import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
const windowMs = 600000;
export function mentionDuration(text) {
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,7}[smhd]$/.test(text))
    throw new UserError('mentionGuardDuration');
  const n = Number(text.slice(0, -1)) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[text.at(-1)];
  if (!Number.isSafeInteger(n) || n < 1000 || n > 2419200000)
    throw new UserError('mentionGuardDuration');
  return n;
}
export class MentionGuard {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  get(guildId) {
    return (
      this.db.prepare('SELECT * FROM mention_guard_settings WHERE guild_id=?').get(guildId) ?? {
        guild_id: guildId,
        target_id: null,
        duration_ms: null,
        enabled: 0,
        revision: 0,
        last_result: 'none',
      }
    );
  }
  set(guildId, targetId, duration) {
    if (!/^\d{17,20}$/.test(targetId)) throw new UserError('mentionGuardTarget');
    const ms = mentionDuration(duration);
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO mention_guard_settings(guild_id,target_id,duration_ms,enabled,revision,last_result) VALUES(?,?,?,1,1,'none') ON CONFLICT(guild_id) DO UPDATE SET target_id=excluded.target_id,duration_ms=excluded.duration_ms,enabled=1,revision=revision+1,last_result='none'",
        )
        .run(guildId, targetId, ms);
    })();
    return this.get(guildId);
  }
  off(guildId) {
    this.db
      .prepare('UPDATE mention_guard_settings SET enabled=0,revision=revision+1 WHERE guild_id=?')
      .run(guildId);
  }
  count(message, settings) {
    return this.db.transaction(() => {
      const now = this.now();
      this.db.prepare('DELETE FROM mention_guard_messages WHERE created_at<=?').run(now - windowMs);
      const current = this.get(message.guild.id);
      if (!current.enabled || current.revision !== settings.revision) return false;
      const inserted = this.db
        .prepare("INSERT OR IGNORE INTO mention_guard_messages VALUES(?,?,?,?,?,'counted')")
        .run(message.id, message.guild.id, message.author.id, settings.revision, now);
      if (!inserted.changes) return false;
      const rows = this.db
        .prepare(
          'SELECT status FROM mention_guard_messages WHERE guild_id=? AND sender_id=? AND revision=? AND created_at>?',
        )
        .all(message.guild.id, message.author.id, settings.revision, now - windowMs);
      if (rows.length < 4 || rows.some((r) => r.status !== 'counted')) return false;
      this.db
        .prepare("UPDATE mention_guard_messages SET status='reserved' WHERE message_id=?")
        .run(message.id);
      this.db
        .prepare(
          "UPDATE mention_guard_settings SET last_result='reserved' WHERE guild_id=? AND revision=?",
        )
        .run(message.guild.id, settings.revision);
      return true;
    })();
  }
  finish(message, settings, status) {
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE mention_guard_messages SET status=? WHERE message_id=? AND status='reserved'",
        )
        .run(status, message.id);
      this.db
        .prepare('UPDATE mention_guard_settings SET last_result=? WHERE guild_id=? AND revision=?')
        .run(status, message.guild.id, settings.revision);
    })();
  }
  recover() {
    this.db.transaction(() => {
      for (const row of this.db
        .prepare("SELECT guild_id,revision FROM mention_guard_messages WHERE status='reserved'")
        .all())
        this.db
          .prepare(
            "UPDATE mention_guard_settings SET last_result='uncertain' WHERE guild_id=? AND revision=?",
          )
          .run(row.guild_id, row.revision);
      this.db
        .prepare("UPDATE mention_guard_messages SET status='uncertain' WHERE status='reserved'")
        .run();
    })();
  }
}
function direct(message, target, now) {
  return (
    message.guild &&
    message.author?.bot === false &&
    !message.webhookId &&
    !message.system &&
    !message.editedTimestamp &&
    /^\d{17,20}$/.test(message.id) &&
    message.author.id !== target &&
    typeof message.content === 'string' &&
    message.content.length <= 4000 &&
    Number.isSafeInteger(message.createdTimestamp) &&
    message.createdTimestamp <= now &&
    message.createdTimestamp > now - 30000 &&
    new RegExp('<@!?' + target + '>').test(message.content) &&
    message.mentions?.users?.has(target) === true
  );
}
export function createMentionGuardHandler(c) {
  return async (message) => {
    if (c.config.messageEventsEnabled !== true || !message.guild) return false;
    const settings = c.mentionGuard.get(message.guild.id),
      now = c.mentionGuard.now();
    if (!settings.enabled || !direct(message, settings.target_id, now)) return false;
    let reserved = false;
    try {
      reserved = c.mentionGuard.count(message, settings);
      if (!reserved) return false;
      const [bot, target] = await Promise.all([
        message.guild.members.fetchMe({ force: true }),
        message.guild.members.fetch({ user: message.author.id, force: true }),
      ]);
      const latest = c.mentionGuard.get(message.guild.id),
        time = c.mentionGuard.now();
      if (
        c.config.messageEventsEnabled !== true ||
        !latest.enabled ||
        latest.revision !== settings.revision ||
        !direct(message, settings.target_id, time) ||
        bot?.id !== message.client?.user?.id ||
        bot?.guild?.id !== message.guild.id ||
        !bot.permissions?.has(P.ModerateMembers) ||
        target?.id !== message.author.id ||
        target?.guild?.id !== message.guild.id ||
        target.user?.bot !== false ||
        target.id === message.guild.ownerId ||
        target.permissions?.has(P.Administrator) !== false ||
        target.moderatable !== true ||
        !(
          bot.roles?.highest &&
          target.roles?.highest &&
          typeof bot.roles.highest.comparePositionTo === 'function' &&
          bot.roles.highest.comparePositionTo(target.roles.highest) > 0
        ) ||
        typeof target.disableCommunicationUntil !== 'function' ||
        !(
          target.communicationDisabledUntilTimestamp === null ||
          Number.isSafeInteger(target.communicationDisabledUntilTimestamp)
        ) ||
        (target.communicationDisabledUntilTimestamp !== null &&
          target.communicationDisabledUntilTimestamp < 0)
      ) {
        c.mentionGuard.finish(message, settings, 'skipped');
        return false;
      }
      if (
        target.communicationDisabledUntilTimestamp !== null &&
        target.communicationDisabledUntilTimestamp > time
      ) {
        c.mentionGuard.finish(message, settings, 'skipped');
        return false;
      }
      const until = time + settings.duration_ms;
      await target.disableCommunicationUntil(
        until,
        'Mention spam: 4 direct mentions of protected member within 10 minutes',
      );
      const observed = await message.guild.members.fetch({ user: target.id, force: true });
      c.mentionGuard.finish(
        message,
        settings,
        observed?.id === target.id &&
          observed.guild?.id === message.guild.id &&
          observed.communicationDisabledUntilTimestamp === until
          ? 'completed'
          : 'uncertain',
      );
      return true;
    } catch {
      if (reserved) {
        try {
          c.mentionGuard.finish(message, settings, 'uncertain');
        } catch {}
      }
      c.logger?.warn({ guildId: message.guild.id }, 'MentionGuard unavailable;no automatic retry');
      return reserved;
    }
  };
}
