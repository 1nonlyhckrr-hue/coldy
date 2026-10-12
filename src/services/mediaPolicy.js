import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export class MediaPolicy {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  get(guildId) {
    return this.db.prepare('SELECT * FROM media_policy WHERE guild_id=?').get(guildId) ?? null;
  }
  setup(guildId, channelId) {
    this.db
      .prepare(
        'INSERT INTO media_policy VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,revision=excluded.revision',
      )
      .run(guildId, channelId, randomUUID());
  }
  remove(guildId) {
    return this.db.prepare('DELETE FROM media_policy WHERE guild_id=?').run(guildId).changes;
  }
  bypasses(guildId) {
    return this.db
      .prepare('SELECT user_id FROM media_bypass WHERE guild_id=? ORDER BY user_id')
      .all(guildId)
      .map((r) => r.user_id);
  }
  addBypass(guildId, userId) {
    if (!/^\d{17,20}$/.test(userId)) throw new UserError('mediaInput');
    this.db.transaction(() => {
      if (!this.bypasses(guildId).includes(userId) && this.bypasses(guildId).length >= 100)
        throw new UserError('mediaLimit');
      this.db.prepare('INSERT OR IGNORE INTO media_bypass VALUES(?,?)').run(guildId, userId);
    })();
  }
  removeBypass(guildId, userId) {
    if (!/^\d{17,20}$/.test(userId)) throw new UserError('mediaInput');
    return this.db
      .prepare('DELETE FROM media_bypass WHERE guild_id=? AND user_id=?')
      .run(guildId, userId).changes;
  }
  reserve(messageId, guildId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO media_receipts VALUES(?,?,'reserved',?)")
        .run(messageId, guildId, this.now()).changes === 1
    );
  }
  finish(messageId, status) {
    this.db
      .prepare("UPDATE media_receipts SET status=? WHERE message_id=? AND status='reserved'")
      .run(status, messageId);
  }
  recover() {
    this.db.prepare("UPDATE media_receipts SET status='uncertain' WHERE status='reserved'").run();
  }
  cleanup() {
    this.db
      .prepare('DELETE FROM media_receipts WHERE created_at<?')
      .run(this.now() - 30 * 86400000);
  }
}
function eligible(message, now) {
  return (
    message.guild &&
    message.author?.bot === false &&
    !message.webhookId &&
    !message.system &&
    !message.editedTimestamp &&
    /^\d{17,20}$/.test(message.id) &&
    Number.isSafeInteger(message.createdTimestamp) &&
    message.createdTimestamp <= now &&
    message.createdTimestamp > now - 300000 &&
    Number.isSafeInteger(message.attachments?.size) &&
    message.attachments.size === 0
  );
}
export function createMediaHandler(c) {
  return async (message) => {
    if (c.config.messageEventsEnabled !== true || !eligible(message, c.mediaPolicy.now()))
      return false;
    const guildId = message.guild.id,
      policy = c.mediaPolicy.get(guildId);
    if (
      !policy ||
      policy.channel_id !== message.channel?.id ||
      c.mediaPolicy.bypasses(guildId).includes(message.author.id)
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
        actor.user?.bot !== false ||
        actor.id === message.guild.ownerId ||
        actor.permissions?.has(P.ManageMessages) !== false ||
        actor.permissions?.has(P.ManageGuild) !== false ||
        bot?.id !== message.client?.user?.id ||
        bot.guild?.id !== guildId ||
        channel?.id !== policy.channel_id ||
        channel.guildId !== guildId ||
        channel.type !== ChannelType.GuildText ||
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages])
      )
        return false;
      const native = await channel.messages.fetch({ message: message.id, force: true });
      const latest = c.mediaPolicy.get(guildId);
      if (
        c.config.messageEventsEnabled !== true ||
        !eligible(native, c.mediaPolicy.now()) ||
        native.id !== message.id ||
        native.guild.id !== guildId ||
        native.channelId !== policy.channel_id ||
        native.author.id !== message.author.id ||
        latest?.revision !== policy.revision ||
        c.mediaPolicy.bypasses(guildId).includes(message.author.id)
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
        currentActor.user?.bot !== false ||
        currentActor.id === message.guild.ownerId ||
        currentActor.permissions?.has(P.ManageMessages) !== false ||
        currentActor.permissions?.has(P.ManageGuild) !== false ||
        currentBot?.id !== message.client.user.id ||
        currentBot.guild?.id !== guildId ||
        !channel
          .permissionsFor(currentBot)
          ?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages]) ||
        c.config.messageEventsEnabled !== true ||
        c.mediaPolicy.get(guildId)?.revision !== policy.revision ||
        c.mediaPolicy.bypasses(guildId).includes(message.author.id) ||
        !eligible(native, c.mediaPolicy.now()) ||
        typeof native.delete !== 'function'
      )
        return false;
      reserved = c.mediaPolicy.reserve(message.id, guildId);
      if (!reserved) return true;
      await native.delete();
      let absent = false;
      try {
        await channel.messages.fetch({ message: message.id, force: true });
      } catch (error) {
        absent = error?.code === 10008 && error?.status === 404;
      }
      c.mediaPolicy.finish(message.id, absent ? 'completed' : 'uncertain');
      return true;
    } catch {
      if (reserved) {
        try {
          c.mediaPolicy.finish(message.id, 'uncertain');
        } catch {}
      }
      c.logger?.warn({ guildId }, 'Media-only deletion unavailable;no automatic retry');
      return reserved;
    }
  };
}
