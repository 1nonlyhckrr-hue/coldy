import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export class AntiBot {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  get(guildId, channelId) {
    return (
      this.db
        .prepare('SELECT * FROM antibot_channels WHERE guild_id=? AND channel_id=?')
        .get(guildId, channelId) ?? null
    );
  }
  channels(guildId) {
    return this.db
      .prepare('SELECT channel_id FROM antibot_channels WHERE guild_id=? ORDER BY channel_id')
      .all(guildId)
      .map((r) => r.channel_id);
  }
  add(guildId, channelId) {
    if (!/^\d{17,20}$/.test(channelId)) throw new UserError('antibotInput');
    this.db.transaction(() => {
      if (!this.get(guildId, channelId) && this.channels(guildId).length >= 25)
        throw new UserError('antibotLimit');
      this.db
        .prepare(
          'INSERT INTO antibot_channels VALUES(?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET revision=excluded.revision',
        )
        .run(guildId, channelId, randomUUID());
    })();
  }
  remove(guildId, channelId) {
    return this.db
      .prepare('DELETE FROM antibot_channels WHERE guild_id=? AND channel_id=?')
      .run(guildId, channelId).changes;
  }
  reset(guildId) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM antibot_channels WHERE guild_id=?').run(guildId);
      this.db.prepare('DELETE FROM antibot_whitelist WHERE guild_id=?').run(guildId);
    })();
  }
  whitelist(guildId) {
    return this.db
      .prepare('SELECT user_id FROM antibot_whitelist WHERE guild_id=? ORDER BY user_id')
      .all(guildId)
      .map((r) => r.user_id);
  }
  wlAdd(guildId, userId) {
    if (!/^\d{17,20}$/.test(userId)) throw new UserError('antibotInput');
    this.db.transaction(() => {
      if (!this.whitelist(guildId).includes(userId) && this.whitelist(guildId).length >= 100)
        throw new UserError('antibotLimit');
      this.db.prepare('INSERT OR IGNORE INTO antibot_whitelist VALUES(?,?)').run(guildId, userId);
    })();
  }
  wlRemove(guildId, userId) {
    if (!/^\d{17,20}$/.test(userId)) throw new UserError('antibotInput');
    return this.db
      .prepare('DELETE FROM antibot_whitelist WHERE guild_id=? AND user_id=?')
      .run(guildId, userId).changes;
  }
  reserve(messageId, guildId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO antibot_receipts VALUES(?,?,'reserved',?)")
        .run(messageId, guildId, this.now()).changes === 1
    );
  }
  finish(messageId, status) {
    this.db
      .prepare("UPDATE antibot_receipts SET status=? WHERE message_id=? AND status='reserved'")
      .run(status, messageId);
  }
  recover() {
    this.db.prepare("UPDATE antibot_receipts SET status='uncertain' WHERE status='reserved'").run();
  }
  cleanup() {
    this.db
      .prepare('DELETE FROM antibot_receipts WHERE created_at<?')
      .run(this.now() - 30 * 86400000);
  }
}
function eligible(message, now) {
  return (
    message.guild &&
    message.author?.bot === true &&
    !message.webhookId &&
    !message.system &&
    !message.editedTimestamp &&
    /^\d{17,20}$/.test(message.id) &&
    Number.isSafeInteger(message.createdTimestamp) &&
    message.createdTimestamp <= now &&
    message.createdTimestamp > now - 300000 &&
    message.author.id !== message.client?.user?.id
  );
}
export function createAntiBotHandler(c) {
  return async (message) => {
    if (c.config.messageEventsEnabled !== true || !eligible(message, c.antiBot.now())) return false;
    const guildId = message.guild.id,
      policy = c.antiBot.get(guildId, message.channel?.id);
    if (
      !policy ||
      policy.channel_id !== message.channel?.id ||
      c.antiBot.whitelist(guildId).includes(message.author.id)
    )
      return false;
    let reserved = false;
    try {
      const [actor, bot, channel] = await Promise.all([
        message.guild.members.fetch({ user: message.author.id, force: true }),
        message.guild.members.fetchMe({ force: true }),
        message.guild.channels.fetch(policy.channel_id, { force: true }),
      ]);
      if (
        actor?.id !== message.author.id ||
        actor.guild?.id !== guildId ||
        actor.user?.bot !== true ||
        bot?.id !== message.client?.user?.id ||
        bot.guild?.id !== guildId ||
        channel?.id !== policy.channel_id ||
        channel.guildId !== guildId ||
        channel.type !== ChannelType.GuildText ||
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages])
      )
        return false;
      const native = await channel.messages.fetch({ message: message.id, force: true });
      const latest = c.antiBot.get(guildId, message.channel?.id);
      if (
        c.config.messageEventsEnabled !== true ||
        !eligible(native, c.antiBot.now()) ||
        native.id !== message.id ||
        native.guild.id !== guildId ||
        native.channelId !== policy.channel_id ||
        native.author.id !== message.author.id ||
        latest?.revision !== policy.revision ||
        c.antiBot.whitelist(guildId).includes(message.author.id)
      )
        return false;
      // Revalidate bot and sender authority after message lookup before reservation/deletion.
      const [currentActor, currentBot] = await Promise.all([
        message.guild.members.fetch({ user: message.author.id, force: true }),
        message.guild.members.fetchMe({ force: true }),
      ]);
      if (
        currentActor?.id !== message.author.id ||
        currentActor.guild?.id !== guildId ||
        currentActor.user?.bot !== true ||
        currentBot?.id !== message.client.user.id ||
        currentBot.guild?.id !== guildId ||
        !channel
          .permissionsFor(currentBot)
          ?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages]) ||
        c.config.messageEventsEnabled !== true ||
        c.antiBot.get(guildId, message.channel?.id)?.revision !== policy.revision ||
        c.antiBot.whitelist(guildId).includes(message.author.id) ||
        !eligible(native, c.antiBot.now()) ||
        typeof native.delete !== 'function'
      )
        return false;
      reserved = c.antiBot.reserve(message.id, guildId);
      if (!reserved) return true;
      await native.delete();
      let absent = false;
      try {
        await channel.messages.fetch({ message: message.id, force: true });
      } catch (error) {
        absent = error?.code === 10008 && error?.status === 404;
      }
      c.antiBot.finish(message.id, absent ? 'completed' : 'uncertain');
      return true;
    } catch {
      if (reserved) {
        try {
          c.antiBot.finish(message.id, 'uncertain');
        } catch {}
      }
      c.logger?.warn({ guildId }, 'AntiBot deletion unavailable;no automatic retry');
      return reserved;
    }
  };
}
