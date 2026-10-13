import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { sleep } from '../utils/toolReply.js';
import { ensureQuarantineRole, releaseQuarantine } from './antinuke.js';
import { roleHasDangerousPermissions } from './rolePanels.js';
// /modtools: member-level moderation helpers. Every batch reports a result per user, never aborts
// on one failure, and checks the bot's hierarchy for each target. Heavy ones are owner/delegate
// only (gated in the command). Nothing here runs on its own.
export const MASSBAN_MAX = 25;
const HOIST = /^[^\p{L}\p{N}]+/u;
/** Returns null when the bot may act on this member, otherwise a short reason code. */
export function blocked(guild, bot, actor, member, { checkActor = true } = {}) {
  if (!member) return null;
  if (member.id === guild.ownerId) return 'owner';
  if (member.id === bot.id) return 'self';
  if (actor && member.id === actor.id) return 'self';
  if (bot.roles.highest.comparePositionTo(member.roles.highest) <= 0) return 'botHierarchy';
  if (
    checkActor &&
    actor &&
    actor.id !== guild.ownerId &&
    actor.roles.highest.comparePositionTo(member.roles.highest) <= 0
  )
    return 'actorHierarchy';
  return null;
}
function record(c, i, target, action, reason) {
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: target,
    actorId: i.user.id,
    action,
    reason,
    interactionId: `${i.id}:${action}:${target}`,
  });
  return {
    id,
    done: (s) => {
      c.cases.finish(id, s);
      if (s === 'completed')
        c.logHub
          ?.mod(i.guild, { actor: i.user.id, action, target, reason, caseId: id })
          .catch(() => {});
    },
  };
}
/** Bans each ID (members or not). Returns [{id, ok, why}]. */
export async function banMany(i, c, ids, { reason, bot, actor, checkActor, soft = false }) {
  const out = [];
  for (const id of ids) {
    const member = await i.guild.members.fetch(id).catch(() => null);
    const why = blocked(i.guild, bot, actor, member, { checkActor });
    if (why || id === i.guild.ownerId) {
      out.push({ id, ok: false, why: why ?? 'owner' });
      continue;
    }
    const rec = record(c, i, id, soft ? 'softban' : 'ban', reason);
    try {
      await i.guild.members.ban(id, {
        reason: `${reason} (by ${i.user.id})`,
        ...(soft ? { deleteMessageSeconds: 7 * 86400 } : {}),
      });
      if (soft) await i.guild.members.unban(id, 'Emika softban: ban lifted straight away');
      rec.done('completed');
      out.push({ id, ok: true });
    } catch {
      rec.done('failed');
      out.push({ id, ok: false, why: 'discord' });
    }
    await sleep(c.toolDelayMs ?? 300);
  }
  return out;
}
export async function quarantineMember(i, c, member, bot, actor, reason) {
  const why = blocked(i.guild, bot, actor, member);
  if (why) throw new UserError('mtBlocked_' + why);
  if (!bot.permissions?.has(P.ManageRoles)) throw new UserError('mtBotPerm');
  let role;
  try {
    ({ role } = await ensureQuarantineRole(i.guild, c.antinuke, { applyOverwrites: true }));
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError('ctFailed');
  }
  if (role.position >= bot.roles.highest.position) throw new UserError('mtBotHierarchyRole');
  const held = [...member.roles.cache.values()].filter((r) => r.id !== i.guild.id);
  const kept = held.filter((r) => r.managed).map((r) => r.id);
  const removed = held.filter((r) => !r.managed && r.id !== role.id).map((r) => r.id);
  const rec = record(c, i, member.id, 'quarantine', reason);
  try {
    await member.roles.set(
      [...new Set([...kept, role.id])],
      `Emika quarantine by ${i.user.id}: ${reason}`,
    );
  } catch {
    rec.done('failed');
    throw new UserError('ctFailed');
  }
  c.antinuke.markQuarantined(i.guild.id, member.id, role.id, removed);
  rec.done('completed');
  return { removed: removed.length };
}
export const unquarantineMember = (guild, c, userId) =>
  releaseQuarantine(guild, c.antinuke, userId);
/** Freeze: native timeout plus every removable role taken away (saved so unfreeze can give them back). */
export async function freezeMember(i, c, member, bot, minutes, reason) {
  const why = blocked(i.guild, bot, null, member, { checkActor: false });
  if (why) throw new UserError('mtBlocked_' + why);
  if (member.user?.bot) throw new UserError('mtBlocked_bot');
  if (!bot.permissions?.has(P.ModerateMembers) || !bot.permissions?.has(P.ManageRoles))
    throw new UserError('mtBotPerm');
  if (c.features.get(i.guild.id, 'freeze', member.id)) throw new UserError('mtAlreadyFrozen');
  const held = [...member.roles.cache.values()].filter((r) => r.id !== i.guild.id);
  const removed = held.filter((r) => !r.managed).map((r) => r.id);
  const kept = held.filter((r) => r.managed).map((r) => r.id);
  const rec = record(c, i, member.id, 'freeze', reason);
  c.features.set(i.guild.id, 'freeze', member.id, { removed, at: Date.now(), by: i.user.id });
  let timedOut = false,
    stripped = false;
  try {
    await member.disableCommunicationUntil(Date.now() + minutes * 60000, `Emika freeze: ${reason}`);
    timedOut = true;
  } catch {
    // reported below
  }
  try {
    await member.roles.set(kept, `Emika freeze by ${i.user.id}`);
    stripped = true;
  } catch {
    // reported below
  }
  if (!timedOut && !stripped) {
    c.features.del(i.guild.id, 'freeze', member.id);
    rec.done('failed');
    throw new UserError('ctFailed');
  }
  if (!stripped)
    c.features.set(i.guild.id, 'freeze', member.id, { removed: [], at: Date.now(), by: i.user.id });
  rec.done('completed');
  return { timedOut, stripped, removed: stripped ? removed.length : 0 };
}
export async function unfreezeMember(i, c, member, bot) {
  const saved = c.features.get(i.guild.id, 'freeze', member.id);
  if (!saved) throw new UserError('mtNotFrozen');
  await i.guild.roles.fetch();
  const ok = saved.removed.filter((id) => {
    const r = i.guild.roles.cache.get(id);
    return r && !r.managed && r.position < bot.roles.highest.position;
  });
  const current = [...member.roles.cache.values()]
    .filter((r) => r.id !== i.guild.id)
    .map((r) => r.id);
  try {
    await member.disableCommunicationUntil(null, `Emika unfreeze by ${i.user.id}`);
    await member.roles.set([...new Set([...current, ...ok])], `Emika unfreeze by ${i.user.id}`);
  } catch {
    throw new UserError('ctFailed');
  }
  c.features.del(i.guild.id, 'freeze', member.id);
  return { restored: ok.length, skipped: saved.removed.length - ok.length };
}
export function dehoistName(name) {
  const clean = String(name ?? '')
    .replace(HOIST, '')
    .trim();
  return clean === name ? null : clean || 'Dehoisted';
}
export async function dehoist(i, c, list, bot) {
  let changed = 0,
    failed = 0;
  for (const m of list) {
    const shown = m.nickname ?? m.user?.globalName ?? m.user?.username;
    const next = dehoistName(shown);
    if (next === null || m.user?.bot || blocked(i.guild, bot, null, m, { checkActor: false }))
      continue;
    try {
      await m.setNickname(next.slice(0, 32), `Emika dehoist by ${i.user.id}`);
      changed++;
    } catch {
      failed++;
    }
    await sleep(c.toolDelayMs ?? 300);
  }
  return { changed, failed };
}
const running = new Set();
/** Gives a role to every human who lacks it, paced and reported. Skips bots. One run per server. */
export async function roleAll(i, c, role, bot, progress) {
  if (running.has(i.guild.id)) throw new UserError('mtRoleAllRunning');
  if (!role || role.managed || role.id === i.guild.id) throw new UserError('roleInvalid');
  if (role.position >= bot.roles.highest.position) throw new UserError('roleBotHierarchy');
  if (roleHasDangerousPermissions(role)) throw new UserError('roleDangerous');
  if (!bot.permissions?.has(P.ManageRoles)) throw new UserError('mtBotPerm');
  running.add(i.guild.id);
  try {
    const all = await i.guild.members.fetch();
    const todo = [...all.values()].filter((m) => !m.user.bot && !m.roles.cache.has(role.id));
    const res = { total: todo.length, added: 0, failed: 0, cut: false };
    const started = Date.now();
    for (const m of todo) {
      if (Date.now() - started > (c.toolMaxMs ?? 13 * 60000)) {
        res.cut = true;
        break;
      }
      try {
        await m.roles.add(role, `Emika roleall by ${i.user.id}`);
        res.added++;
      } catch {
        res.failed++;
      }
      if ((res.added + res.failed) % 25 === 0) await progress?.(res);
      await sleep(c.toolDelayMs ?? 400);
    }
    return res;
  } finally {
    running.delete(i.guild.id);
  }
}
export async function voiceKick(member, actorId) {
  if (!member.voice?.channelId) throw new UserError('mtNotInVoice');
  try {
    await member.voice.disconnect(`Emika voicekick by ${actorId}`);
  } catch {
    throw new UserError('ctFailed');
  }
}
const URL_RE = /https?:\/\/\S+|discord\.gg\/\S+/iu;
const DAY14 = 14 * 86400000;
/** Finds up to `count` recent messages matching every given filter; nothing is deleted here. */
export async function planPurge(i, c, channel, { count, userId, bots, links }) {
  if (!channel?.messages?.fetch || !channel.bulkDelete) throw new UserError('ctUnsupported');
  const fetched = await channel.messages.fetch({ limit: 100 });
  const now = Date.now();
  const ids = [];
  for (const m of fetched.values()) {
    if (m.pinned || m.system || now - m.createdTimestamp >= DAY14) continue;
    if (userId && m.author?.id !== userId) continue;
    if (bots && !m.author?.bot) continue;
    if (links && !URL_RE.test(m.content ?? '')) continue;
    ids.push(m.id);
    if (ids.length >= count) break;
  }
  if (!ids.length) throw new UserError('mtPurgeNothing');
  const plan = Math.floor(now / 1000).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  c.features.set(i.guildId, 'purge', 'plan:' + plan, {
    ids,
    channelId: channel.id,
    actorId: i.user.id,
    at: now,
  });
  return { plan, count: ids.length };
}
export async function runPurge(i, c, planId) {
  const key = 'plan:' + planId,
    plan = c.features.get(i.guildId, 'purge', key);
  if (!plan || plan.actorId !== i.user.id || Date.now() - plan.at > 120000) {
    if (plan) c.features.del(i.guildId, 'purge', key);
    throw new UserError('mtPurgeExpired');
  }
  c.features.del(i.guildId, 'purge', key);
  const channel = await i.guild.channels.fetch(plan.channelId, { force: true });
  const rec = record(c, i, i.user.id, 'purge', `purge ${plan.ids.length} in ${plan.channelId}`);
  try {
    const gone = await channel.bulkDelete(plan.ids, true);
    rec.done('completed');
    return { count: gone.size ?? gone.length ?? 0 };
  } catch {
    rec.done('failed');
    throw new UserError('ctFailed');
  }
}
