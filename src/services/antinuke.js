import { z } from 'zod';
import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { validateOutputChannel } from './guildConfig.js';
import { roleHasDangerousPermissions } from './rolePanels.js';
import { lunaPayload } from '../utils/embeds.js';
export const WATCHED_AUDIT_ACTIONS = new Set([
  AuditLogEvent.GuildUpdate,
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelUpdate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.RoleUpdate,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.WebhookUpdate,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick,
]);
const id = z.string().regex(/^\d{17,20}$/),
  schema = z
    .object({
      enabled: z.boolean().default(false),
      channelId: id.optional(),
      threshold: z.number().int().min(2).max(20).default(5),
      windowSeconds: z.number().int().min(10).max(300).default(60),
      trustedUsers: z.array(id).max(20).default([]),
      // Auto-quarantine: a role that hides every channel from a member who trips a threshold.
      quarantine: z
        .object({
          enabled: z.boolean().default(true),
          // Opt-in: re-apply quarantine when someone tampers with it. Off unless an admin enables it.
          tamperHold: z.boolean().default(false),
          roleId: id.optional(),
          punishRoleId: id.optional(),
          channelDeleteThreshold: z.number().int().min(2).max(20).default(3),
          channelDeleteWindowSeconds: z.number().int().min(10).max(300).default(60),
          banThreshold: z.number().int().min(2).max(20).default(3),
          kickThreshold: z.number().int().min(2).max(20).default(3),
          windowSeconds: z.number().int().min(60).max(3600).default(300),
        })
        .strict()
        .prefault({}),
    })
    .strict();
export class AntinukeAlerts {
  constructor(db) {
    this.db = db;
    this.lastCleanup = 0;
  }
  get(guildId) {
    const r = this.db
      .prepare('SELECT settings_json FROM antinuke_config WHERE guild_id=?')
      .get(guildId);
    return schema.parse(r ? JSON.parse(r.settings_json) : {});
  }
  patch(guildId, changes) {
    return this.db.transaction(() => {
      const cfg = schema.parse({ ...this.get(guildId), ...changes });
      this.db
        .prepare(
          'INSERT INTO antinuke_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
        )
        .run(guildId, JSON.stringify(cfg));
      return cfg;
    })();
  }
  resetPolicy(guildId) {
    this.db.prepare('DELETE FROM antinuke_config WHERE guild_id=?').run(guildId);
    return this.get(guildId);
  }
  importPolicy(guildId, text) {
    let cfg;
    try {
      if (typeof text !== 'string' || text.length > 4000) throw Error('bounds');
      const v = JSON.parse(text);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) throw Error('object');
      cfg = schema.parse(v);
      if (new Set(cfg.trustedUsers).size !== cfg.trustedUsers.length) throw Error('duplicate');
      cfg.enabled = false;
    } catch {
      throw new UserError('antinukeImportInvalid');
    }
    this.db
      .prepare(
        'INSERT INTO antinuke_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(cfg));
    return cfg;
  }
  clearTrust(guildId) {
    return this.db.transaction(() => {
      const n = this.get(guildId).trustedUsers.length;
      this.patch(guildId, { trustedUsers: [] });
      return n;
    })();
  }
  clearChannel(guildId) {
    return this.patch(guildId, { enabled: false, channelId: undefined });
  }
  removeTrust(guildId, userId) {
    if (typeof userId !== 'string' || !/^\d{17,20}$/.test(userId))
      throw new UserError('antinukeUserInvalid');
    return this.db.transaction(() => {
      const cfg = this.get(guildId),
        present = cfg.trustedUsers.includes(userId);
      this.patch(guildId, { trustedUsers: cfg.trustedUsers.filter((id) => id !== userId) });
      return Number(present);
    })();
  }
  trust(guildId, userId, trusted) {
    if (!/^\d{17,20}$/.test(userId) || typeof trusted !== 'boolean')
      throw new UserError('antinukeUserInvalid');
    return this.db.transaction(() => {
      const cfg = this.get(guildId),
        ids = new Set(cfg.trustedUsers);
      if (trusted) ids.add(userId);
      else ids.delete(userId);
      return this.patch(guildId, { trustedUsers: [...ids] });
    })();
  }
  record(entry, guild, now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0) return null;
    const cfg = this.get(guild.id);
    if (
      !cfg.enabled ||
      !WATCHED_AUDIT_ACTIONS.has(entry.action) ||
      !/^\d{17,20}$/.test(entry.id ?? '') ||
      !/^\d{17,20}$/.test(entry.executorId ?? '')
    )
      return null;
    if (
      entry.executorId === guild.ownerId ||
      entry.executorId === guild.client.user.id ||
      cfg.trustedUsers.includes(entry.executorId)
    )
      return null;
    if (
      !Number.isFinite(entry.createdTimestamp) ||
      entry.createdTimestamp < now - 300000 ||
      entry.createdTimestamp > now + 30000
    )
      return null;
    if (now - this.lastCleanup > 3600000) {
      this.cleanup(now);
      this.lastCleanup = now;
    }
    return this.db.transaction(() => {
      if (
        !this.db
          .prepare('INSERT OR IGNORE INTO antinuke_events VALUES(?,?,?,?,?)')
          .run(entry.id, guild.id, entry.executorId, entry.action, now).changes
      )
        return null;
      // Events are counted even without an alert channel, so quarantine can still use them.
      if (!cfg.channelId) return null;
      const since = now - cfg.windowSeconds * 1000;
      const count = this.db
        .prepare(
          'SELECT count(*) n FROM antinuke_events WHERE guild_id=? AND actor_id=? AND created_at>=? AND created_at<=?',
        )
        .get(guild.id, entry.executorId, since, now).n;
      if (count < cfg.threshold) return null;
      if (
        this.db
          .prepare(
            'SELECT 1 FROM antinuke_incidents WHERE guild_id=? AND actor_id=? AND created_at>=? AND created_at<=?',
          )
          .get(guild.id, entry.executorId, since, now)
      )
        return null;
      const incidentId = Number(
        this.db
          .prepare(
            "INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,'recorded',?)",
          )
          .run(guild.id, entry.executorId, entry.action, count, now).lastInsertRowid,
      );
      return {
        id: incidentId,
        actorId: entry.executorId,
        count,
        action: entry.action,
        window: cfg.windowSeconds,
        threshold: cfg.threshold,
        channelId: cfg.channelId,
      };
    })();
  }
  /**
   * Decides whether an already-recorded audit entry pushes its actor over a quarantine
   * threshold. Owner, the bot itself and trusted users are never returned.
   */
  quarantineTrigger(entry, guild, now = Date.now()) {
    const cfg = this.get(guild.id),
      q = cfg.quarantine;
    if (!cfg.enabled || !q.enabled || !Number.isSafeInteger(now) || now < 0) return null;
    if (!/^\d{17,20}$/.test(entry?.executorId ?? '')) return null;
    if (
      entry.executorId === guild.ownerId ||
      entry.executorId === guild.client.user.id ||
      cfg.trustedUsers.includes(entry.executorId)
    )
      return null;
    const rule = {
      [AuditLogEvent.ChannelDelete]: [
        'channelDelete',
        q.channelDeleteThreshold,
        q.channelDeleteWindowSeconds,
      ],
      [AuditLogEvent.MemberBanAdd]: ['ban', q.banThreshold, q.windowSeconds],
      [AuditLogEvent.MemberKick]: ['kick', q.kickThreshold, q.windowSeconds],
    }[entry.action];
    if (!rule) return null;
    const [reason, threshold, window] = rule;
    const count = this.db
      .prepare(
        'SELECT count(*) n FROM antinuke_events WHERE guild_id=? AND actor_id=? AND action=? AND created_at>=? AND created_at<=?',
      )
      .get(guild.id, entry.executorId, entry.action, now - window * 1000, now).n;
    if (count < threshold) return null;
    return { actorId: entry.executorId, reason, count, window, roleId: q.roleId ?? null };
  }
  setTamperHold(guildId, enabled) {
    const q = this.get(guildId).quarantine;
    return this.patch(guildId, { quarantine: { ...q, tamperHold: enabled === true } });
  }
  markQuarantined(guildId, userId, roleId, removed = []) {
    this.db
      .prepare(
        "INSERT INTO antinuke_quarantined VALUES(?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET role_id=excluded.role_id, removed_json=CASE WHEN excluded.removed_json='[]' THEN antinuke_quarantined.removed_json ELSE excluded.removed_json END",
      )
      .run(guildId, userId, roleId, JSON.stringify(removed.slice(0, 250)), Date.now());
  }
  quarantinedRow(guildId, userId) {
    const r = this.db
      .prepare('SELECT * FROM antinuke_quarantined WHERE guild_id=? AND user_id=?')
      .get(guildId, userId);
    return r ? { ...r, removed: JSON.parse(r.removed_json) } : null;
  }
  quarantinedCount(guildId) {
    return this.db
      .prepare('SELECT count(*) n FROM antinuke_quarantined WHERE guild_id=?')
      .get(guildId).n;
  }
  forgetQuarantined(guildId, userId) {
    return this.db
      .prepare('DELETE FROM antinuke_quarantined WHERE guild_id=? AND user_id=?')
      .run(guildId, userId).changes;
  }
  setPunishRole(guildId, roleId) {
    if (roleId !== null && !/^\d{17,20}$/.test(roleId)) throw new UserError('roleInvalid');
    const q = this.get(guildId).quarantine;
    return this.patch(guildId, { quarantine: { ...q, punishRoleId: roleId ?? undefined } });
  }
  recorded(id, guildId, expected = null) {
    const row = this.db
      .prepare(
        "SELECT actor_id,action,event_count FROM antinuke_incidents WHERE id=? AND guild_id=? AND status='recorded'",
      )
      .get(id, guildId);
    return (
      !!row &&
      (expected === null ||
        (row.actor_id === expected.actorId &&
          row.action === expected.action &&
          row.event_count === expected.count))
    );
  }
  finish(id, status) {
    if (!['alerted', 'uncertain', 'unavailable'].includes(status))
      throw new TypeError('Invalid alert state');
    const result = this.db
      .prepare("UPDATE antinuke_incidents SET status=? WHERE id=? AND status='recorded'")
      .run(status, id);
    if (result.changes !== 1) throw new Error('Audit alert reservation not recorded');
  }
  inspectIncident(guildId, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('antinukeIncidentScopeInvalid');
    return (
      this.db
        .prepare(
          'SELECT id,action,event_count AS eventCount,status,created_at AS createdAt FROM antinuke_incidents WHERE guild_id=? AND id=?',
        )
        .get(guildId, id) ?? null
    );
  }
  scopedIncidents(guildId, { action = null, recovery = false } = {}) {
    if (action !== null && (!Number.isInteger(action) || !WATCHED_AUDIT_ACTIONS.has(action)))
      throw new UserError('antinukeIncidentScopeInvalid');
    return this.db.transaction(() => {
      const condition =
        "guild_id=? AND (? IS NULL OR action=?) AND (?=0 OR status IN ('recorded','uncertain','unavailable'))";
      const values = [guildId, action, action, recovery ? 1 : 0];
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM antinuke_incidents WHERE ' + condition)
        .get(...values).n;
      const records = this.db
        .prepare(
          'SELECT id,action,event_count AS eventCount,status,created_at AS createdAt FROM antinuke_incidents WHERE ' +
            condition +
            ' ORDER BY id DESC LIMIT 100',
        )
        .all(...values);
      return { total, truncated: total > records.length, records };
    })();
  }
  summary(guildId) {
    return this.db
      .prepare(
        'SELECT status,COUNT(*) AS count FROM antinuke_incidents WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  actionCounts(guildId) {
    return this.db
      .prepare(
        'SELECT action,status,COUNT(*) AS count FROM antinuke_incidents WHERE guild_id=? GROUP BY action,status ORDER BY action,status',
      )
      .all(guildId);
  }
  exportIncidents(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM antinuke_incidents WHERE guild_id=?')
        .get(guildId).n;
      const records = this.db
        .prepare(
          'SELECT id,action,event_count AS eventCount,status,created_at AS createdAt FROM antinuke_incidents WHERE guild_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId);
      return { total, truncated: total > records.length, records };
    })();
  }
  incidents(guildId) {
    return this.db
      .prepare(
        'SELECT id,actor_id,action,event_count,status,created_at FROM antinuke_incidents WHERE guild_id=? ORDER BY id DESC LIMIT 20',
      )
      .all(guildId);
  }
  unresolved(guildId, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 10)
      throw new UserError('antinukePageInvalid');
    return this.db
      .prepare(
        "SELECT id,actor_id,event_count,status,created_at FROM antinuke_incidents WHERE guild_id=? AND status IN ('recorded','uncertain','unavailable') ORDER BY created_at,id LIMIT 10 OFFSET ?",
      )
      .all(guildId, (page - 1) * 10);
  }
  cleanup(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid antinuke clock');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM antinuke_events WHERE created_at<?').run(now - 86400000);
      this.db.prepare('DELETE FROM antinuke_incidents WHERE created_at<?').run(now - 30 * 86400000);
    })();
  }
}
export const QUARANTINE_ROLE_NAME = 'Quarantine';
/** The role must exist here, not be @everyone or managed, and sit below the bot's top role. */
export function validatePunishRole(role, bot, guild) {
  if (!role || role.guild?.id !== guild.id || role.id === guild.id || role.managed)
    throw new UserError('roleInvalid');
  if (role.position >= bot.roles.highest.position) throw new UserError('roleBotHierarchy');
  // A punish role that grants staff powers would reward the actor, so refuse it outright.
  if (roleHasDangerousPermissions(role)) throw new UserError('roleDangerous');
}
function overwriteDenies(channel, role) {
  const o = channel.permissionOverwrites?.cache?.get?.(role.id);
  return !!o?.deny?.has?.(P.ViewChannel);
}
/**
 * Finds or creates the Quarantine role and makes sure every channel and category hides from it.
 * Role permissions alone cannot hide channels @everyone can see, so each channel gets an explicit
 * ViewChannel deny. Safe to rerun: channels that already deny are skipped.
 */
export async function ensureQuarantineRole(guild, antinuke, { applyOverwrites = true } = {}) {
  const cfg = antinuke.get(guild.id);
  await guild.roles.fetch();
  if (cfg.quarantine.punishRoleId) {
    // Admin-chosen role: re-validated every time, never silently replaced by the default role.
    const chosen = guild.roles.cache.get(cfg.quarantine.punishRoleId);
    const bot = guild.members.me ?? (await guild.members.fetchMe());
    validatePunishRole(chosen, bot, guild);
    const result = { role: chosen, created: false, hidden: 0, failed: 0 };
    if (applyOverwrites) Object.assign(result, await hideChannels(guild, chosen));
    return result;
  }
  let role =
    (cfg.quarantine.roleId && guild.roles.cache.get(cfg.quarantine.roleId)) ||
    guild.roles.cache.find((r) => r.name === QUARANTINE_ROLE_NAME && !r.managed);
  if (role && roleHasDangerousPermissions(role)) throw new UserError('roleDangerous');
  let created = false;
  if (!role) {
    role = await guild.roles.create({
      name: QUARANTINE_ROLE_NAME,
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: 'Emika antinuke quarantine role',
    });
    created = true;
  }
  if (cfg.quarantine.roleId !== role.id)
    antinuke.patch(guild.id, { quarantine: { ...cfg.quarantine, roleId: role.id } });
  const result = { role, created, hidden: 0, failed: 0 };
  if (applyOverwrites) Object.assign(result, await hideChannels(guild, role));
  return result;
}
export async function hideChannels(guild, role) {
  await guild.channels.fetch();
  let hidden = 0,
    failed = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread?.() || !channel.permissionOverwrites?.edit) continue;
    if (overwriteDenies(channel, role)) continue;
    try {
      await channel.permissionOverwrites.edit(
        role,
        { ViewChannel: false },
        { reason: 'Emika antinuke quarantine' },
      );
      hidden++;
    } catch {
      failed++;
    }
  }
  return { hidden, failed };
}
const quarantining = new Set();
async function quarantineActor(c, guild, trigger) {
  const key = guild.id + ':' + trigger.actorId;
  if (quarantining.has(key)) return null;
  quarantining.add(key);
  try {
    const latest = c.antinuke.get(guild.id);
    if (
      !latest.enabled ||
      !latest.quarantine.enabled ||
      latest.trustedUsers.includes(trigger.actorId) ||
      guild.ownerId === trigger.actorId ||
      guild.client.user.id === trigger.actorId
    )
      return null;
    const member = await guild.members.fetch(trigger.actorId).catch(() => null);
    if (!member || member.id === guild.ownerId || member.id === guild.client.user.id) return null;
    const bot = guild.members.me ?? (await guild.members.fetchMe());
    if (!bot.permissions?.has(P.ManageRoles)) return { status: 'unavailable' };
    // Never act on someone at or above the bot in the role hierarchy.
    if (member.roles.highest.position >= bot.roles.highest.position) return { status: 'hierarchy' };
    let role;
    try {
      ({ role } = await ensureQuarantineRole(guild, c.antinuke, { applyOverwrites: false }));
    } catch (error) {
      if (error instanceof UserError) return { status: 'roleInvalid' };
      throw error;
    }
    if (role.position >= bot.roles.highest.position) return { status: 'hierarchy' };
    // Containment: drop every role the actor holds (Administrator and other powers included)
    // and leave only the punish role. Managed roles cannot be removed by hand, so they stay.
    const reason = 'Emika antinuke: ' + trigger.reason + ' x' + trigger.count;
    const held = [...member.roles.cache.values()].filter((r) => r.id !== guild.id);
    const kept = held.filter((r) => r.managed).map((r) => r.id);
    const removed = held.filter((r) => !r.managed && r.id !== role.id).map((r) => r.id);
    let partial = false;
    try {
      await member.roles.set([...new Set([...kept, role.id])], reason);
    } catch {
      partial = true;
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, reason);
    }
    await hideChannels(guild, role);
    c.antinuke.markQuarantined(guild.id, member.id, role.id, partial ? [] : removed);
    return { status: partial ? 'partial' : 'quarantined', removed: partial ? [] : removed };
  } finally {
    quarantining.delete(key);
  }
}
const HOLD_ACTIONS = new Set([
  AuditLogEvent.MemberRoleUpdate,
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.ChannelOverwriteUpdate,
  AuditLogEvent.ChannelOverwriteDelete,
  AuditLogEvent.RoleUpdate,
]);
/**
 * Opt-in tamper-hold. When an admin enabled it and someone is quarantined, a removed punish role,
 * regained roles, edited channel overwrites or an edited quarantine role are put back.
 * Emika's own changes are ignored so the repair cannot loop.
 */
export async function holdQuarantine(c, guild, entry) {
  const cfg = c.antinuke.get(guild.id);
  if (!cfg.enabled || !cfg.quarantine.tamperHold || !HOLD_ACTIONS.has(entry?.action)) return null;
  if (entry.executorId === guild.client.user.id) return null;
  if (!c.antinuke.quarantinedCount(guild.id)) return null;
  const bot = guild.members.me ?? (await guild.members.fetchMe());
  if (!bot.permissions?.has(P.ManageRoles)) return null;
  const roleId = cfg.quarantine.punishRoleId ?? cfg.quarantine.roleId;
  if (!roleId) return null;
  await guild.roles.fetch();
  const role = guild.roles.cache.get(roleId);
  if (!role || role.managed || role.position >= bot.roles.highest.position) return null;
  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const targetId = entry.targetId ?? entry.target?.id;
    if (!/^\d{17,20}$/.test(targetId ?? '') || !c.antinuke.quarantinedRow(guild.id, targetId))
      return null;
    const member = await guild.members.fetch(targetId).catch(() => null);
    if (!member || member.id === guild.ownerId) return null;
    if (member.roles.highest.position >= bot.roles.highest.position) return null;
    const held = [...member.roles.cache.values()].filter((r) => r.id !== guild.id);
    const extra = held.filter((r) => !r.managed && r.id !== role.id);
    if (member.roles.cache.has(role.id) && !extra.length) return null;
    const keep = held.filter((r) => r.managed).map((r) => r.id);
    await member.roles.set([...new Set([...keep, role.id])], 'Emika antinuke: tamper-hold');
    return { kind: 'member', target: targetId };
  }
  if (entry.action === AuditLogEvent.RoleUpdate) {
    if ((entry.targetId ?? entry.target?.id) !== role.id) return null;
    if (!roleHasDangerousPermissions(role)) return null;
    if (cfg.quarantine.punishRoleId) return { kind: 'rolechosen', target: role.id };
    await role.setPermissions([], 'Emika antinuke: tamper-hold');
    return { kind: 'role', target: role.id };
  }
  const { hidden } = await hideChannels(guild, role);
  return hidden ? { kind: 'overwrite', target: role.id } : null;
}
/** Releases a quarantined member: gives back the roles that were removed and drops the punish role. */
export async function releaseQuarantine(guild, antinuke, userId) {
  const row = antinuke.quarantinedRow(guild.id, userId);
  if (!row) throw new UserError('antinukeNotQuarantined');
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    antinuke.forgetQuarantined(guild.id, userId);
    return { restored: 0, skipped: 0, gone: true };
  }
  const bot = guild.members.me ?? (await guild.members.fetchMe());
  if (!bot.permissions?.has(P.ManageRoles)) throw new UserError('antinukeBotPermission');
  await guild.roles.fetch();
  const restorable = row.removed.filter((id) => {
    const r = guild.roles.cache.get(id);
    return r && !r.managed && id !== guild.id && r.position < bot.roles.highest.position;
  });
  const current = [...member.roles.cache.values()]
    .filter((r) => r.id !== guild.id && r.id !== row.role_id)
    .map((r) => r.id);
  await member.roles.set([...new Set([...current, ...restorable])], 'Emika antinuke: released');
  antinuke.forgetQuarantined(guild.id, userId);
  return { restored: restorable.length, skipped: row.removed.length - restorable.length };
}
export function createAntinukeHandler(c) {
  return async (entry, guild) => {
    let incident;
    if (c.config?.auditEventsEnabled !== true) return;
    try {
      try {
        const held = await holdQuarantine(c, guild, entry);
        const hcfg = held && c.antinuke.get(guild.id);
        if (held && hcfg.channelId) {
          const channel = await validateOutputChannel(guild, hcfg.channelId);
          await channel.send(
            lunaPayload(
              {
                content: c.localization.t(guild.id, 'antinukeHold_' + held.kind, {
                  target: held.target,
                  actor: entry.executorId ?? '-',
                }),
                allowedMentions: { parse: [] },
              },
              { locale: c.localization.locale(guild.id) },
            ),
          );
        }
      } catch {
        c.logger?.warn?.(
          { guildId: guild.id, kind: 'antinuke_hold' },
          'Tamper-hold unavailable; no automatic retry',
        );
      }
      incident = c.antinuke.record(entry, guild);
      try {
        const trigger = c.antinuke.quarantineTrigger(entry, guild);
        const outcome = trigger && (await quarantineActor(c, guild, trigger));
        const cfg = c.antinuke.get(guild.id);
        if (outcome && cfg.channelId) {
          const channel = await validateOutputChannel(guild, cfg.channelId);
          await channel.send(
            lunaPayload(
              {
                content: c.localization.t(guild.id, 'antinukeQuarantine_' + outcome.status, {
                  actor: trigger.actorId,
                  count: trigger.count,
                  window: trigger.window,
                  reason: c.localization.t(guild.id, 'antinukeQuarantineReason_' + trigger.reason),
                  removed:
                    (outcome.removed ?? [])
                      .slice(0, 15)
                      .map((id) => `<@&${id}>`)
                      .join(' ') || '-',
                }),
                allowedMentions: { parse: [] },
              },
              { locale: c.localization.locale(guild.id) },
            ),
          );
        }
      } catch {
        c.logger?.warn?.(
          { guildId: guild.id, kind: 'antinuke_quarantine' },
          'Quarantine unavailable; no automatic retry',
        );
      }
      if (!incident) return;
      const locale = c.localization.locale(guild.id),
        text = c.localization.t(guild.id, 'antinukeAlert', {
          id: incident.id,
          actor: incident.actorId,
          count: incident.count,
          window: incident.window,
        });
      let channel;
      try {
        channel = await validateOutputChannel(guild, incident.channelId);
      } catch {
        c.antinuke.finish(incident.id, 'unavailable');
        return;
      }
      const latest = c.antinuke.get(guild.id);
      if (
        c.config?.auditEventsEnabled !== true ||
        !latest.enabled ||
        latest.channelId !== incident.channelId ||
        latest.windowSeconds !== incident.window ||
        latest.threshold !== incident.threshold ||
        latest.trustedUsers.includes(incident.actorId) ||
        guild.ownerId === incident.actorId ||
        guild.client.user.id === incident.actorId
      ) {
        c.antinuke.finish(incident.id, 'unavailable');
        return;
      }
      if (!c.antinuke.recorded(incident.id, guild.id, incident)) return;
      try {
        const sent = await channel.send(
          lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }),
        );
        if (typeof sent?.id !== 'string' || !sent.id.trim())
          throw new Error('Missing accepted audit alert identity');
      } catch {
        c.antinuke.finish(incident.id, 'uncertain');
        return;
      }
      c.antinuke.finish(incident.id, 'alerted');
    } catch {
      c.logger.warn(
        { guildId: guild.id, kind: 'antinuke_alert' },
        'Audit alert unavailable; no automatic retry',
      );
    }
  };
}
