import { z } from 'zod';
import { AuditLogEvent } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { validateOutputChannel } from './guildConfig.js';
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
      !cfg.channelId ||
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
export function createAntinukeHandler(c) {
  return async (entry, guild) => {
    let incident;
    if (c.config?.auditEventsEnabled !== true) return;
    try {
      incident = c.antinuke.record(entry, guild);
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
