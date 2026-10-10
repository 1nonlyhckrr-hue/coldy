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
          'SELECT count(*) n FROM antinuke_events WHERE guild_id=? AND actor_id=? AND created_at>=?',
        )
        .get(guild.id, entry.executorId, since).n;
      if (count < cfg.threshold) return null;
      if (
        this.db
          .prepare(
            'SELECT 1 FROM antinuke_incidents WHERE guild_id=? AND actor_id=? AND created_at>=?',
          )
          .get(guild.id, entry.executorId, since)
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
        channelId: cfg.channelId,
      };
    })();
  }
  finish(id, status) {
    if (!['alerted', 'uncertain', 'unavailable'].includes(status))
      throw new TypeError('Invalid alert state');
    this.db.prepare('UPDATE antinuke_incidents SET status=? WHERE id=?').run(status, id);
  }
  incidents(guildId) {
    return this.db
      .prepare(
        'SELECT id,actor_id,action,event_count,status,created_at FROM antinuke_incidents WHERE guild_id=? ORDER BY id DESC LIMIT 20',
      )
      .all(guildId);
  }
  cleanup(now = Date.now()) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM antinuke_events WHERE created_at<?').run(now - 86400000);
      this.db.prepare('DELETE FROM antinuke_incidents WHERE created_at<?').run(now - 30 * 86400000);
    })();
  }
}
export function createAntinukeHandler(c) {
  return async (entry, guild) => {
    let incident;
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
      try {
        await channel.send(
          lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }),
        );
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
