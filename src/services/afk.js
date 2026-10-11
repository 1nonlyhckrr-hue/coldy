import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
export class AfkStates {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
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
export function createAfkHandler(c) {
  return async (message) => {
    if (
      !c.config.messageEventsEnabled ||
      !message.guildId ||
      message.guild?.id !== message.guildId ||
      !message.author ||
      message.author.bot ||
      message.webhookId ||
      message.system ||
      !/^[0-9]{17,20}$/.test(message.id) ||
      !Number.isFinite(message.createdTimestamp) ||
      Math.abs(Date.now() - message.createdTimestamp) > 300000
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
        !c.config.messageEventsEnabled ||
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
      if (!c.afk.reserve(message.id, message.guildId, message.channelId)) return;
      const rowsNow = rows.filter((row) => {
        const latest = c.afk.get(message.guildId, row.user_id);
        return (
          latest?.created_at === row.created_at &&
          latest.channel_id === row.channel_id &&
          latest.reason === row.reason
        );
      });
      if (!rowsNow.length) return;
      await channel.send(
        lunaPayload(
          {
            content: rowsNow
              .map((row) =>
                c.localization.t(message.guildId, 'afkNotice', {
                  user: row.user_id,
                  reason: row.reason,
                  minutes: Math.max(0, Math.floor((Date.now() - row.created_at) / 60000)),
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
