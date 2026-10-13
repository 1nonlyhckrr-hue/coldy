import { z } from 'zod';
import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
import { validateOutputChannel } from './guildConfig.js';
import { lunaPayload } from '../utils/embeds.js';
// Opt-in server guards driven by the audit log. Every rule is off until /guard enables it. Alerts go
// to the /antinuke alert channel. Trusted actors (server owner, Emika, bot owners, /antinuke trusted
// users, /owner delegates for "guard") are never acted on.
const SNOWFLAKE = /^\d{17,20}$/;
const schema = z
  .object({
    webhook: z
      .object({ mode: z.enum(['off', 'alert', 'delete']).default('off') })
      .strict()
      .prefault({}),
    permAlert: z
      .object({ mode: z.enum(['off', 'alert', 'strip']).default('off') })
      .strict()
      .prefault({}),
    botAdd: z
      .object({
        mode: z.enum(['off', 'alert', 'kick']).default('off'),
        allow: z.array(z.string().regex(SNOWFLAKE)).max(25).default([]),
      })
      .strict()
      .prefault({}),
  })
  .strict();
export class Guard {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.seen = new Map();
  }
  get(guildId) {
    const r = this.db
      .prepare('SELECT settings_json FROM guard_config WHERE guild_id=?')
      .get(guildId);
    return schema.parse(r ? JSON.parse(r.settings_json) : {});
  }
  patch(guildId, changes) {
    const cur = this.get(guildId),
      next = { ...cur };
    for (const [k, v] of Object.entries(changes)) next[k] = { ...cur[k], ...v };
    const cfg = schema.parse(next);
    this.db
      .prepare(
        'INSERT INTO guard_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(cfg));
    return cfg;
  }
  /** True once per audit entry id, so a repeated gateway event is handled a single time. */
  firstSight(entryId) {
    const now = this.now();
    for (const [k, t] of this.seen) if (t < now - 600000) this.seen.delete(k);
    if (this.seen.has(entryId)) return false;
    this.seen.set(entryId, now);
    return true;
  }
}
export function isTrusted(c, guild, userId) {
  return (
    userId === guild.ownerId ||
    userId === guild.client.user.id ||
    c.config?.ownerIds?.includes(userId) === true ||
    c.antinuke.get(guild.id).trustedUsers.includes(userId) ||
    c.securityAccess.delegated(guild.id, userId, 'guard')
  );
}
async function alert(c, guild, key, params) {
  const channelId = c.antinuke.get(guild.id).channelId;
  if (!channelId) return;
  const channel = await validateOutputChannel(guild, channelId);
  await channel.send(
    lunaPayload(
      {
        content: c.localization.t(guild.id, key, params),
        allowedMentions: { parse: [] },
      },
      { locale: c.localization.locale(guild.id) },
    ),
  );
}
async function botHas(guild, perm) {
  const me = await guild.members.fetchMe();
  return me.permissions?.has(perm) === true;
}
async function webhookRule(c, guild, entry, cfg) {
  if (entry.action !== AuditLogEvent.WebhookCreate || cfg.webhook.mode === 'off') return;
  let result = 'alerted';
  if (cfg.webhook.mode === 'delete') {
    result = 'failed';
    try {
      if (await botHas(guild, P.ManageWebhooks)) {
        const hook = (await guild.fetchWebhooks()).get(entry.targetId);
        if (hook) {
          await hook.delete('Emika guard: webhook created by an untrusted user');
          result = 'deleted';
        } else result = 'gone';
      }
    } catch {
      result = 'failed';
    }
  }
  await alert(c, guild, 'guardWebhook_' + result, { actor: entry.executorId });
}
const DANGEROUS = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageChannels,
  P.KickMembers,
  P.BanMembers,
].reduce((a, b) => a | b, 0n);
/** Dangerous permission bits that a role-change audit entry added. */
export function addedDangerousBits(entry) {
  const ch = (entry.changes ?? []).find((x) => x.key === 'permissions');
  if (!ch) return 0n;
  try {
    const was = BigInt(ch.old ?? 0),
      now = BigInt(ch.new ?? 0);
    return now & ~was & DANGEROUS;
  } catch {
    return 0n;
  }
}
async function permRule(c, guild, entry, cfg) {
  if (
    ![AuditLogEvent.RoleUpdate, AuditLogEvent.RoleCreate].includes(entry.action) ||
    cfg.permAlert.mode === 'off'
  )
    return;
  const bits = addedDangerousBits(entry);
  if (!bits) return;
  const names = Object.entries(P)
    .filter(([, v]) => (bits & v) === v && (v & (v - 1n)) === 0n)
    .map(([k]) => k)
    .join(', ');
  let result = 'alerted';
  if (cfg.permAlert.mode === 'strip') {
    result = 'failed';
    try {
      const role = await guild.roles.fetch(entry.targetId, { force: true });
      const me = await guild.members.fetchMe();
      if (
        role &&
        !role.managed &&
        me.permissions?.has(P.ManageRoles) &&
        role.position < me.roles.highest.position
      ) {
        await role.setPermissions(
          role.permissions.remove(bits),
          'Emika guard: dangerous permissions added by an untrusted user',
        );
        result = 'stripped';
      }
    } catch {
      result = 'failed';
    }
  }
  await alert(c, guild, 'guardPerm_' + result, {
    actor: entry.executorId,
    role: entry.targetId,
    perms: names,
  });
}
async function botAddRule(c, guild, entry, cfg) {
  if (entry.action !== AuditLogEvent.BotAdd || cfg.botAdd.mode === 'off') return;
  const botId = entry.targetId;
  if (!SNOWFLAKE.test(botId ?? '') || cfg.botAdd.allow.includes(botId)) return;
  let result = 'alerted';
  if (cfg.botAdd.mode === 'kick') {
    result = 'failed';
    try {
      const me = await guild.members.fetchMe();
      const target = await guild.members.fetch({ user: botId, force: true }).catch(() => null);
      if (!target) result = 'gone';
      else if (
        me.permissions?.has(P.KickMembers) &&
        target.roles.highest.position < me.roles.highest.position
      ) {
        await target.kick('Emika guard: bot added by an untrusted user');
        result = 'kicked';
      }
    } catch {
      result = 'failed';
    }
  }
  await alert(c, guild, 'guardBot_' + result, { actor: entry.executorId, bot: botId });
}
const RULES = [webhookRule, permRule, botAddRule];
export function createGuardHandler(c) {
  return async (entry, guild) => {
    try {
      if (c.config?.auditEventsEnabled !== true) return;
      const cfg = c.guard.get(guild.id);
      if (!SNOWFLAKE.test(entry.executorId ?? '') || !SNOWFLAKE.test(entry.id ?? '')) return;
      const age = Date.now() - entry.createdTimestamp;
      if (!Number.isFinite(age) || age > 300000 || age < -30000) return;
      if (!c.guard.firstSight(entry.id)) return;
      if (isTrusted(c, guild, entry.executorId)) return;
      for (const rule of RULES) {
        try {
          await rule(c, guild, entry, cfg);
        } catch {
          c.logger?.warn?.({ guildId: guild.id, kind: 'guard' }, 'Guard rule failed');
        }
      }
    } catch {
      c.logger?.warn?.({ guildId: guild.id, kind: 'guard' }, 'Guard unavailable');
    }
  };
}
