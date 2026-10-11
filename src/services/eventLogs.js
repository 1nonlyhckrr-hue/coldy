import { createHmac, randomBytes } from 'node:crypto';
import { validateOutputChannel } from './guildConfig.js';
import { lunaPayload } from '../utils/embeds.js';
export const LOG_EVENT_KINDS = [
  'memberjoin',
  'memberleave',
  'rolecreate',
  'roledelete',
  'roleupdate',
  'channelcreate',
  'channeldelete',
  'channelupdate',
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
    return (
      this.db
        .prepare("UPDATE event_log_deliveries SET status=? WHERE event_key=? AND status='reserved'")
        .run(status, key).changes === 1
    );
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
              : ['roleupdate', 'channelupdate'].includes(kind)
                ? resource.lunaUpdateKey
                : '';
      if (['roleupdate', 'channelupdate'].includes(kind) && !/^[a-f0-9]{32}$/.test(suffix ?? ''))
        return;
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
      const latest = c.guildConfig.get(guild.id);
      if (
        !latest.logging.enabled ||
        latest.logging.channelId !== cfg.channelId ||
        !latest.logging.events.includes(kind)
      ) {
        c.eventLogs.finish(key, 'unavailable');
        return;
      }
      const text = c.localization.t(guild.id, 'logMetadataEvent', {
        kind: c.localization.t(guild.id, `logKind_${kind}`),
        id: resource.id,
      });
      try {
        const message = await channel.send(
          lunaPayload(
            { content: text, allowedMentions: { parse: [] } },
            { locale: latest.language },
          ),
        );
        if (typeof message?.id !== 'string' || !message.id.trim()) {
          c.eventLogs.finish(key, 'uncertain');
          return;
        }
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

export function createRoleUpdateLogHandler(c) {
  const emit = createMetadataLogHandler(c, 'roleupdate');
  // Ephemeral secret prevents stored receipts becoming dictionary hashes of private names.
  const receiptKey = randomBytes(32);
  return async (before, after) => {
    if (!before || !after || before.id !== after.id || before.guild?.id !== after.guild?.id) return;
    const snapshot = (r) => [
      r.name,
      r.permissions?.bitfield?.toString(),
      r.position,
      r.colors?.primaryColor,
      r.hoist,
      r.mentionable,
      r.managed,
    ];
    const complete = (r) =>
      typeof r.name === 'string' &&
      typeof r.permissions?.bitfield === 'bigint' &&
      Number.isInteger(r.position) &&
      Number.isInteger(r.colors?.primaryColor) &&
      ['hoist', 'mentionable', 'managed'].every((k) => typeof r[k] === 'boolean');
    if (!complete(before) || !complete(after)) return;
    const old = JSON.stringify(snapshot(before)),
      current = JSON.stringify(snapshot(after));
    if (old === current) return;
    const lunaUpdateKey = createHmac('sha256', receiptKey)
      .update(old + '\n' + current)
      .digest('hex')
      .slice(0, 32);
    await emit({ id: after.id, guild: after.guild, lunaUpdateKey });
  };
}

export function createChannelUpdateLogHandler(c) {
  const emit = createMetadataLogHandler(c, 'channelupdate'),
    receiptKey = randomBytes(32);
  return async (before, after) => {
    if (
      !before ||
      !after ||
      before.id !== after.id ||
      !before.guild?.id ||
      before.guild.id !== after.guild?.id
    )
      return;
    const complete = (r) =>
      typeof r.name === 'string' &&
      Number.isInteger(r.type) &&
      Number.isInteger(r.rawPosition) &&
      r.rawPosition >= 0 &&
      (r.parentId === null || typeof r.parentId === 'string') &&
      typeof r.nsfw === 'boolean';
    if (!complete(before) || !complete(after)) return;
    const snapshot = (r) => JSON.stringify([r.name, r.type, r.rawPosition, r.parentId, r.nsfw]),
      old = snapshot(before),
      current = snapshot(after);
    if (old === current) return;
    const lunaUpdateKey = createHmac('sha256', receiptKey)
      .update(old + '\n' + current)
      .digest('hex')
      .slice(0, 32);
    await emit({ id: after.id, guild: after.guild, lunaUpdateKey });
  };
}
