import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
export class AfkStates {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  summary(guildId) {
    const clock = this.now();
    if (!Number.isSafeInteger(clock) || clock < 0) throw new UserError('afkStoredScopeInvalid');
    return {
      states: this.db
        .prepare('SELECT COUNT(*) n FROM afk_states WHERE guild_id=? AND created_at>=?')
        .get(guildId, clock - 7 * 86400000).n,
      notices: this.db
        .prepare('SELECT COUNT(*) n FROM afk_notices WHERE guild_id=? AND created_at>=?')
        .get(guildId, clock - 86400000).n,
    };
  }
  channelCounts(guildId) {
    const clock = this.now();
    if (!Number.isSafeInteger(clock) || clock < 0) throw new UserError('afkStoredScopeInvalid');
    return this.db
      .prepare(
        'SELECT channel_id AS channelId,COUNT(*) AS count FROM afk_states WHERE guild_id=? AND created_at>=? GROUP BY channel_id ORDER BY channel_id',
      )
      .all(guildId, clock - 7 * 86400000);
  }
  exportNotices(guildId) {
    const clock = this.now();
    if (!Number.isSafeInteger(clock) || clock < 0) throw new UserError('afkStoredScopeInvalid');
    return this.db.transaction(() => {
      const cutoff = clock - 86400000,
        total = this.db
          .prepare('SELECT COUNT(*) n FROM afk_notices WHERE guild_id=? AND created_at>=?')
          .get(guildId, cutoff).n;
      const records = this.db
        .prepare(
          'SELECT channel_id AS channelId,created_at AS createdAt FROM afk_notices WHERE guild_id=? AND created_at>=? ORDER BY created_at DESC,message_id DESC LIMIT 100',
        )
        .all(guildId, cutoff);
      return { total, truncated: total > records.length, records };
    })();
  }
  exportStatusMetadata(guildId, channelId = null) {
    if (channelId !== null && (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId)))
      throw new UserError('afkStoredScopeInvalid');
    const clock = this.now();
    if (!Number.isSafeInteger(clock) || clock < 0) throw new UserError('afkStoredScopeInvalid');
    return this.db.transaction(() => {
      const values = [guildId, clock - 7 * 86400000, channelId, channelId];
      const filter = 'guild_id=? AND created_at>=? AND (? IS NULL OR channel_id=?)';
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM afk_states WHERE ' + filter)
        .get(...values).n;
      const records = this.db
        .prepare(
          'SELECT channel_id AS channelId,created_at AS createdAt,created_at+604800000 AS expiresAt FROM afk_states WHERE ' +
            filter +
            ' ORDER BY created_at DESC,user_id DESC LIMIT 100',
        )
        .all(...values);
      return { asOf: clock, total, truncated: total > records.length, records };
    })();
  }
  ageBands(guildId) {
    const clock = this.now();
    if (!Number.isSafeInteger(clock) || clock < 0) throw new UserError('afkStoredScopeInvalid');
    const rows = this.db
      .prepare('SELECT created_at FROM afk_states WHERE guild_id=? AND created_at>=?')
      .all(guildId, clock - 7 * 86400000);
    const bands = { futureTimestamp: 0, under1hour: 0, from1hourTo1day: 0, from1dayTo7days: 0 };
    for (const r of rows) {
      const age = clock - r.created_at;
      bands[
        age < 0
          ? 'futureTimestamp'
          : age < 3600000
            ? 'under1hour'
            : age < 86400000
              ? 'from1hourTo1day'
              : 'from1dayTo7days'
      ]++;
    }
    return { asOf: clock, total: rows.length, bands };
  }
  cleanup() {
    this.db.prepare('DELETE FROM afk_states WHERE created_at<?').run(this.now() - 7 * 86400000);
    this.db.prepare('DELETE FROM afk_notices WHERE created_at<?').run(this.now() - 86400000);
  }
  get(guildId, userId) {
    this.cleanup();
    return this.db
      .prepare('SELECT * FROM afk_states WHERE guild_id=? AND user_id=?')
      .get(guildId, userId);
  }
  set(guildId, userId, channelId, reason) {
    if (
      typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(reason)
    )
      throw new UserError('afkReasonInvalid');
    this.cleanup();
    if (
      !this.get(guildId, userId) &&
      this.db.prepare('SELECT count(*) n FROM afk_states WHERE guild_id=?').get(guildId).n >= 1000
    )
      throw new UserError('afkLimit');
    this.db
      .prepare(
        'INSERT INTO afk_states VALUES(?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET channel_id=excluded.channel_id,reason=excluded.reason,created_at=excluded.created_at',
      )
      .run(guildId, userId, channelId, reason.trim(), this.now());
  }
  updateReason(guildId, userId, reason) {
    if (
      typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(reason)
    )
      throw new UserError('afkReasonInvalid');
    if (!this.get(guildId, userId)) throw new UserError('afkNotSet');
    this.db
      .prepare('UPDATE afk_states SET reason=? WHERE guild_id=? AND user_id=?')
      .run(reason.trim(), guildId, userId);
  }
  move(guildId, userId, channelId) {
    if (!this.get(guildId, userId)) throw new UserError('afkNotSet');
    this.db
      .prepare('UPDATE afk_states SET channel_id=? WHERE guild_id=? AND user_id=?')
      .run(channelId, guildId, userId);
  }
  clearAll(guildId) {
    return this.db.prepare('DELETE FROM afk_states WHERE guild_id=?').run(guildId).changes;
  }
  clearChannel(guildId, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new UserError('afkStoredScopeInvalid');
    return this.db
      .prepare('DELETE FROM afk_states WHERE guild_id=? AND channel_id=?')
      .run(guildId, channelId).changes;
  }
  clearUser(guildId, userId) {
    if (typeof userId !== 'string' || !/^\d{17,20}$/.test(userId))
      throw new UserError('afkStoredScopeInvalid');
    return this.clear(guildId, userId);
  }
  clear(guildId, userId) {
    return this.db
      .prepare('DELETE FROM afk_states WHERE guild_id=? AND user_id=?')
      .run(guildId, userId).changes;
  }
  reserve(messageId, guildId, channelId) {
    return this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM afk_notices WHERE message_id=?').get(messageId))
        return false;
      if (
        this.db
          .prepare('SELECT count(*) n FROM afk_notices WHERE guild_id=? AND created_at>?')
          .get(guildId, this.now() - 60000).n >= 10
      )
        return false;
      if (
        this.db
          .prepare('SELECT 1 FROM afk_notices WHERE guild_id=? AND channel_id=? AND created_at>?')
          .get(guildId, channelId, this.now() - 30000)
      )
        return false;
      this.db
        .prepare('INSERT INTO afk_notices VALUES(?,?,?,?)')
        .run(messageId, guildId, channelId, this.now());
      return true;
    })();
  }
}
function recentMessage(message, now) {
  let clock;
  try {
    clock = now();
  } catch {
    return false;
  }
  return (
    Number.isSafeInteger(clock) &&
    clock >= 0 &&
    Number.isFinite(message.createdTimestamp) &&
    Math.abs(clock - message.createdTimestamp) <= 300000
  );
}
export function createAfkHandler(c, now = Date.now) {
  return async (message) => {
    if (
      c.config.messageEventsEnabled !== true ||
      !message.guildId ||
      message.guild?.id !== message.guildId ||
      !message.author ||
      message.author.bot !== false ||
      message.webhookId ||
      message.system ||
      !/^[0-9]{17,20}$/.test(message.id) ||
      !recentMessage(message, now)
    )
      return;
    try {
      const own = c.afk.get(message.guildId, message.author.id);
      if (own && message.createdTimestamp > own.created_at)
        c.afk.clear(message.guildId, message.author.id);
      const ids = [...(message.mentions?.users?.keys?.() ?? [])].slice(0, 5),
        rows = ids
          .map((id) => c.afk.get(message.guildId, id))
          .filter((row) => row && row.channel_id === message.channelId);
      if (!rows.length) return;
      const channel = await message.guild.channels.fetch(message.channelId, { force: true });
      if (
        !channel ||
        channel.id !== message.channelId ||
        channel.guildId !== message.guildId ||
        ![
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        ].includes(channel.type)
      )
        return;
      const bot = await message.guild.members.fetchMe({ force: true });
      if (
        !message.guild.client?.user?.id ||
        bot?.id !== message.guild.client.user.id ||
        bot.guild?.id !== message.guildId ||
        c.config.messageEventsEnabled !== true ||
        !recentMessage(message, now) ||
        message.author?.bot !== false ||
        message.system ||
        message.webhookId ||
        !channel
          .permissionsFor(bot)
          ?.has([
            P.ViewChannel,
            [
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
            ].includes(channel.type)
              ? P.SendMessagesInThreads
              : P.SendMessages,
            P.EmbedLinks,
          ])
      )
        return;
      const rowsNow = rows.filter((row) => {
        const latest = c.afk.get(message.guildId, row.user_id);
        return (
          latest?.created_at === row.created_at &&
          latest.channel_id === row.channel_id &&
          latest.reason === row.reason
        );
      });
      if (!rowsNow.length) return;
      if (!c.afk.reserve(message.id, message.guildId, message.channelId)) return;
      await channel.send(
        lunaPayload(
          {
            content: rowsNow
              .map((row) =>
                c.localization.t(message.guildId, 'afkNotice', {
                  user: row.user_id,
                  reason: row.reason,
                  minutes: Math.max(0, Math.floor((now() - row.created_at) / 60000)),
                }),
              )
              .join('\n'),
            allowedMentions: { parse: [] },
          },
          { locale: c.localization.locale(message.guildId) },
        ),
      );
    } catch {
      c.logger.warn({ kind: 'afk_unavailable' }, 'AFK state/notice unavailable;no automatic retry');
    }
  };
}
