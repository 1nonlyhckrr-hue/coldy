import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
export function reactTrigger(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 50 || !value.isWellFormed())
    throw new UserError('autoreactInput');
  const trigger = value.normalize('NFKC').toLocaleLowerCase('en');
  if (!/^[\p{L}\p{N}_]+$/u.test(trigger) || trigger.length > 50)
    throw new UserError('autoreactInput');
  return trigger;
}
export function reactEmojis(text) {
  let values;
  try {
    if (typeof text !== 'string' || text.length > 1000) throw Error();
    values = JSON.parse(text);
  } catch {
    throw new UserError('autoreactInput');
  }
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 10 ||
    new Set(values).size !== values.length ||
    values.some(
      (v) =>
        typeof v !== 'string' ||
        !v.isWellFormed() ||
        v.length > 32 ||
        (!/^\d{17,20}$/.test(v) &&
          (!v.length ||
            [...segmenter.segment(v)].length !== 1 ||
            !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(v) ||
            !/^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f\u20e3#*0-9]+$/u.test(
              v,
            ))),
    )
  )
    throw new UserError('autoreactInput');
  return values;
}
export class AutoReactions {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  list(guildId) {
    return this.db
      .prepare(
        'SELECT trigger,emojis_json,revision FROM autoreact_rules WHERE guild_id=? ORDER BY trigger',
      )
      .all(guildId)
      .map((r) => ({ ...r, emojis: JSON.parse(r.emojis_json) }));
  }
  add(guildId, trigger, text) {
    const key = reactTrigger(trigger),
      emojis = reactEmojis(text);
    this.db.transaction(() => {
      if (!this.list(guildId).some((r) => r.trigger === key) && this.list(guildId).length >= 10)
        throw new UserError('autoreactLimit');
      this.db
        .prepare(
          'INSERT INTO autoreact_rules VALUES(?,?,?,?) ON CONFLICT(guild_id,trigger) DO UPDATE SET emojis_json=excluded.emojis_json,revision=excluded.revision',
        )
        .run(guildId, key, JSON.stringify(emojis), randomUUID());
    })();
  }
  remove(guildId, trigger) {
    return this.db
      .prepare('DELETE FROM autoreact_rules WHERE guild_id=? AND trigger=?')
      .run(guildId, reactTrigger(trigger)).changes;
  }
  reset(guildId) {
    return this.db.prepare('DELETE FROM autoreact_rules WHERE guild_id=?').run(guildId).changes;
  }
  reserve(messageId, emoji, guildId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO autoreact_receipts VALUES(?,?,?,'reserved',?)")
        .run(messageId, emoji, guildId, this.now()).changes === 1
    );
  }
  finish(messageId, emoji, status) {
    this.db
      .prepare(
        "UPDATE autoreact_receipts SET status=? WHERE message_id=? AND emoji=? AND status='reserved'",
      )
      .run(status, messageId, emoji);
  }
  recover() {
    this.db
      .prepare("UPDATE autoreact_receipts SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup() {
    this.db
      .prepare('DELETE FROM autoreact_receipts WHERE created_at<?')
      .run(this.now() - 30 * 86400000);
  }
}
export async function reactionEmoji(guild, value) {
  if (!/^\d{17,20}$/.test(value)) return value;
  const emoji = await guild.emojis.fetch(value, { force: true });
  if (
    emoji?.id !== value ||
    emoji.guild?.id !== guild.id ||
    typeof emoji.name !== 'string' ||
    !emoji.name ||
    typeof emoji.animated !== 'boolean'
  )
    throw new UserError('autoreactInput');
  return emoji;
}
function validMessage(message, now) {
  return (
    message.guild &&
    message.author?.bot === false &&
    !message.webhookId &&
    !message.system &&
    !message.editedTimestamp &&
    /^\d{17,20}$/.test(message.id) &&
    typeof message.content === 'string' &&
    message.content.length <= 4000 &&
    message.content.isWellFormed() &&
    Number.isSafeInteger(message.createdTimestamp) &&
    message.createdTimestamp <= now &&
    message.createdTimestamp > now - 300000
  );
}
function words(content) {
  return new Set(
    content
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .match(/[\p{L}\p{N}_]+/gu) ?? [],
  );
}
export function createAutoReactHandler(c) {
  return async (message) => {
    if (c.config.messageEventsEnabled !== true || !validMessage(message, c.autoReactions.now()))
      return;
    const guildId = message.guild.id,
      matched = words(message.content),
      rules = c.autoReactions.list(guildId).filter((r) => matched.has(r.trigger));
    if (!rules.length) return;
    const attempted = new Set();
    for (const rule of rules)
      for (const value of rule.emojis) {
        if (attempted.has(value)) continue;
        attempted.add(value);
        let reserved = false;
        try {
          const [bot, channel] = await Promise.all([
            message.guild.members.fetchMe({ force: true }),
            message.guild.channels.fetch(message.channel.id, { force: true }),
          ]);
          if (
            bot?.id !== message.client?.user?.id ||
            bot.guild?.id !== guildId ||
            channel?.id !== message.channel.id ||
            channel.guildId !== guildId ||
            channel.type !== ChannelType.GuildText ||
            !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory, P.AddReactions])
          )
            return;
          const emoji = await reactionEmoji(message.guild, value),
            native = await channel.messages.fetch({ message: message.id, force: true });
          const latest = c.autoReactions.list(guildId).find((r) => r.trigger === rule.trigger),
            currentBot = await message.guild.members.fetchMe({ force: true });
          if (
            c.config.messageEventsEnabled !== true ||
            !validMessage(native, c.autoReactions.now()) ||
            native.id !== message.id ||
            native.guild.id !== guildId ||
            native.channelId !== channel.id ||
            native.author.id !== message.author.id ||
            !words(native.content).has(rule.trigger) ||
            latest?.revision !== rule.revision ||
            currentBot?.id !== message.client.user.id ||
            currentBot.guild?.id !== guildId ||
            !channel
              .permissionsFor(currentBot)
              ?.has([P.ViewChannel, P.ReadMessageHistory, P.AddReactions]) ||
            typeof native.react !== 'function'
          )
            return;
          reserved = c.autoReactions.reserve(message.id, value, guildId);
          if (!reserved) continue;
          await native.react(emoji);
          const observed = await channel.messages.fetch({ message: message.id, force: true });
          const reaction = observed?.reactions?.cache?.get(value);
          const confirmed =
            observed?.id === message.id &&
            observed.guild?.id === guildId &&
            observed.channelId === channel.id &&
            reaction?.me === true &&
            reaction.message?.id === message.id;
          c.autoReactions.finish(message.id, value, confirmed ? 'completed' : 'uncertain');
          if (!confirmed) return;
        } catch {
          if (reserved) {
            try {
              c.autoReactions.finish(message.id, value, 'uncertain');
            } catch {}
          }
          c.logger?.warn({ guildId }, 'AutoReact unavailable;no automatic retry');
          return;
        }
      }
  };
}
