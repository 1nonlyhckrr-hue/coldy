import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
import { startLockdown, endLockdown } from './lockdown.js';
// /raid: manual raid controls. All of it is off until an owner or delegate turns it on.
const DAY = 86400000;
export const JOINGATE = { enabled: false, minDays: 7 };
export const RAIDMODE = { on: false, action: 'kick', since: 0 };
export const INVITES = { enabled: false };
const MAX_HELD = 200;
/** Alert goes to the modlog channel, or to the /antinuke alert channel when no modlog is set. */
export async function alertTo(c, guild, key, params = {}) {
  if (await c.logHub.send(guild, 'mod', key, params)) return true;
  const id = c.antinuke?.get?.(guild.id)?.channelId;
  if (!id) return false;
  try {
    const ch = await validateOutputChannel(guild, id);
    await ch.send(
      lunaPayload(
        { content: c.localization.t(guild.id, key, params), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(guild.id) },
      ),
    );
    return true;
  } catch {
    return false;
  }
}
export const gateConfig = (c, g) => c.features.config(g, 'joingate', JOINGATE);
export const raidConfig = (c, g) => c.features.config(g, 'raidmode', RAIDMODE);
export function setJoinGate(c, g, enabled, minDays) {
  return c.features.setConfig(g, 'joingate', JOINGATE, {
    enabled,
    ...(minDays !== null && minDays !== undefined ? { minDays } : {}),
  });
}
export function setRaidMode(c, g, on, action) {
  return c.features.setConfig(g, 'raidmode', RAIDMODE, {
    on,
    ...(action ? { action } : {}),
    since: on ? Date.now() : 0,
  });
}
/** Members held by raid mode (timeout action) so turning it off can release them. */
export const heldList = (c, g) => c.features.get(g, 'raidmode', 'held', []);
async function hold(c, member) {
  const cfg = raidConfig(c, member.guild.id);
  if (cfg.action === 'kick') await member.kick('Emika raid mode');
  else {
    await member.timeout(DAY, 'Emika raid mode hold');
    const held = heldList(c, member.guild.id);
    if (!held.includes(member.id))
      c.features.set(member.guild.id, 'raidmode', 'held', [...held, member.id].slice(-MAX_HELD));
  }
}
export async function releaseHeld(c, guild) {
  let released = 0;
  for (const id of heldList(c, guild.id)) {
    try {
      const m = await guild.members.fetch(id);
      await m.timeout(null, 'Emika raid mode off');
      released++;
    } catch {
      // member left or can no longer be changed
    }
  }
  c.features.del(guild.id, 'raidmode', 'held');
  return released;
}
export function createRaidHandlers(c) {
  const safe =
    (fn) =>
    async (...a) => {
      try {
        await fn(...a);
      } catch {
        c.logger?.warn?.({ kind: 'raid_tools' }, 'Raid tool action unavailable');
      }
    };
  return {
    join: safe(async (member) => {
      if (member.user?.bot) return;
      const g = member.guild;
      const raid = raidConfig(c, g.id);
      if (raid.on) {
        try {
          await hold(c, member);
          await alertTo(c, g, 'rtHeld_' + raid.action, { user: `<@${member.id}>` });
        } catch {
          await alertTo(c, g, 'rtHoldFailed', { user: `<@${member.id}>` });
        }
        return;
      }
      const gate = gateConfig(c, g.id);
      if (!gate.enabled) return;
      const age = Math.floor((Date.now() - member.user.createdTimestamp) / DAY);
      if (age >= gate.minDays) return;
      try {
        await member.kick('Emika joingate: account younger than ' + gate.minDays + ' days');
        await alertTo(c, g, 'rtGateKick', { user: `<@${member.id}>`, age, min: gate.minDays });
      } catch {
        await alertTo(c, g, 'rtGateFail', { user: `<@${member.id}>`, age });
      }
    }),
  };
}
/** Panic button: lockdown plus raid mode, and the server owner is told in a DM and in the alert channel. */
export async function emergencyOn(c, guild, byId) {
  const bot = await guild.members.fetchMe({ force: true });
  if (!bot.permissions.has(P.ManageChannels)) throw new UserError('botPermission');
  let lock = { locked: 0, failed: 0 };
  try {
    lock = await startLockdown(guild, c.lockdown);
  } catch (e) {
    if (!(e instanceof UserError) || e.key !== 'lockdownActive') throw e;
  }
  setRaidMode(c, guild.id, true, 'kick');
  let dm = false;
  try {
    const owner = await guild.fetchOwner();
    await owner.send(
      c.localization.t(guild.id, 'rtEmergencyDm', { by: `<@${byId}>`, server: guild.name }),
    );
    dm = true;
  } catch {
    // closed DMs: the alert channel still gets it
  }
  const alerted = await alertTo(c, guild, 'rtEmergencyAlert', { by: `<@${byId}>` });
  return { ...lock, dm, alerted };
}
export async function emergencyOff(c, guild) {
  let restored = { restored: 0, failed: 0 };
  try {
    restored = await endLockdown(guild, c.lockdown);
  } catch (e) {
    if (!(e instanceof UserError) || e.key !== 'lockdownNotActive') throw e;
  }
  setRaidMode(c, guild.id, false);
  const released = await releaseHeld(c, guild);
  return { ...restored, released };
}
/** Account signals that hint at an alt. A score, not proof. */
export function altSignals(member, now = Date.now()) {
  const u = member.user,
    out = [];
  const age = (now - u.createdTimestamp) / DAY;
  if (age < 7) out.push(['young', 40]);
  else if (age < 30) out.push(['new', 20]);
  const joinedAfter = member.joinedTimestamp
    ? (member.joinedTimestamp - u.createdTimestamp) / DAY
    : null;
  if (joinedAfter !== null && joinedAfter < 1) out.push(['joinedFast', 20]);
  if (!u.avatar) out.push(['noAvatar', 15]);
  if (!u.banner && !u.globalName) out.push(['noProfile', 10]);
  if (/\d{3,}$/.test(u.username)) out.push(['numberName', 10]);
  if (!member.roles?.cache || member.roles.cache.size <= 1) out.push(['noRoles', 5]);
  return {
    ageDays: Math.floor(age),
    signals: out,
    score: Math.min(
      100,
      out.reduce((a, s) => a + s[1], 0),
    ),
  };
}
export const nameKey = (n) =>
  String(n ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+$/, '');
/** Other members whose name matches this one apart from trailing digits and symbols. */
export function similarNames(member, all) {
  const k = nameKey(member.user.username);
  if (k.length < 4) return [];
  return all
    .filter((m) => m.id !== member.id && nameKey(m.user.username) === k)
    .map((m) => m.id)
    .slice(0, 10);
}
// ---------- invite tracking ----------
export class InviteTracker {
  constructor(c) {
    this.c = c;
    this.cache = new Map();
  }
  enabled(guildId) {
    return this.c.features.config(guildId, 'invites', INVITES).enabled;
  }
  async snapshot(guild) {
    const inv = await guild.invites.fetch();
    this.cache.set(guild.id, new Map([...inv.values()].map((i) => [i.code, i.uses ?? 0])));
    return inv;
  }
  invited(guildId, userId) {
    return this.c.features.get(guildId, 'invites', 'joined:' + userId);
  }
  async join(member) {
    const g = member.guild;
    if (member.user?.bot || !this.enabled(g.id)) return;
    const before = this.cache.get(g.id);
    const inv = await this.snapshot(g);
    if (!before) return;
    const used = [...inv.values()].find((i) => (i.uses ?? 0) > (before.get(i.code) ?? 0));
    this.c.features.set(g.id, 'invites', 'joined:' + member.id, {
      inviter: used?.inviter?.id ?? null,
      code: used?.code ?? null,
      at: Date.now(),
      young: Date.now() - member.user.createdTimestamp < 7 * DAY,
    });
  }
  leave(member) {
    const rec = this.invited(member.guild.id, member.id);
    if (rec && !rec.left)
      this.c.features.set(member.guild.id, 'invites', 'joined:' + member.id, {
        ...rec,
        left: Date.now(),
      });
  }
  /** Per-inviter totals; "suspect" when at least half of 5+ invited members are brand new or left within an hour. */
  stats(guildId, inviterId) {
    const rows = this.c.features.list(guildId, 'invites', 'joined:', 5000).map((r) => r.value);
    const mine = rows.filter((r) => r.inviter === inviterId);
    const quick = mine.filter((r) => r.left && r.left - r.at < 3600000).length;
    const young = mine.filter((r) => r.young).length;
    const fake = mine.filter((r) => r.young || (r.left && r.left - r.at < 3600000)).length;
    return {
      total: mine.length,
      stayed: mine.filter((r) => !r.left).length,
      quick,
      young,
      suspect: mine.length >= 5 && fake / mine.length >= 0.5,
    };
  }
}
