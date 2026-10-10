import { validateOutputChannel } from './guildConfig.js';
import { lunaPayload } from '../utils/embeds.js';
export const LOG_EVENT_KINDS = [
  'memberjoin',
  'memberleave',
  'rolecreate',
  'roledelete',
  'channelcreate',
  'channeldelete',
];
export class EventLogDelivery {
  constructor(db) {
    this.db = db;
    this.lastCleanup = 0;
  }
  reserve(key, guildId, now = Date.now()) {
    return this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM event_log_deliveries WHERE event_key=?').get(key))
        return false;
      if (
        this.db
          .prepare('SELECT count(*) n FROM event_log_deliveries WHERE guild_id=? AND created_at>=?')
          .get(guildId, now - 60000).n >= 20
      )
        return false;
      return (
        this.db
          .prepare("INSERT OR IGNORE INTO event_log_deliveries VALUES(?,?,'reserved',?)")
          .run(key, guildId, now).changes === 1
      );
    })();
  }
  finish(key, status) {
    if (!['sent', 'uncertain', 'unavailable'].includes(status))
      throw new TypeError('Invalid event log state');
    this.db.prepare('UPDATE event_log_deliveries SET status=? WHERE event_key=?').run(status, key);
  }
  recover() {
    this.db
      .prepare("UPDATE event_log_deliveries SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup(now = Date.now()) {
    this.db.prepare('DELETE FROM event_log_deliveries WHERE created_at<?').run(now - 30 * 86400000);
  }
}
export function createMetadataLogHandler(c, kind, now = Date.now) {
  if (!LOG_EVENT_KINDS.includes(kind)) throw new TypeError('Unsupported log event');
  return async (resource) => {
    let key;
    try {
      const guild = resource.guild;
      if (!guild || !resource.id) return;
      const settings = c.guildConfig.get(guild.id),
        cfg = settings.logging;
      if (!cfg.enabled || !cfg.channelId || !cfg.events.includes(kind)) return;
      // No names, text, overwrite bodies, profile fields or guessed actor attribution.
      const time = now(),
        suffix =
          kind === 'memberjoin'
            ? String(resource.joinedTimestamp ?? Math.floor(time / 86400000))
            : kind === 'memberleave'
              ? String(Math.floor(time / 86400000))
              : '';
      key = `${guild.id}:${kind}:${resource.id}:${suffix}`;
      if (time - c.eventLogs.lastCleanup > 3600000) {
        c.eventLogs.cleanup(time);
        c.eventLogs.lastCleanup = time;
      }
      if (!c.eventLogs.reserve(key, guild.id, time)) return;
      let channel;
      try {
        channel = await validateOutputChannel(guild, cfg.channelId);
      } catch {
        c.eventLogs.finish(key, 'unavailable');
        return;
      }
      const text = c.localization.t(guild.id, 'logMetadataEvent', {
        kind: c.localization.t(guild.id, `logKind_${kind}`),
        id: resource.id,
      });
      try {
        await channel.send(
          lunaPayload(
            { content: text, allowedMentions: { parse: [] } },
            { locale: settings.language },
          ),
        );
      } catch {
        c.eventLogs.finish(key, 'uncertain');
        return;
      }
      c.eventLogs.finish(key, 'sent');
    } catch {
      c.logger.warn({ kind: 'event_log' }, 'Metadata event log unavailable; no automatic retry');
    }
  };
}
