import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
export class Polls {
  constructor(db) {
    this.db = db;
  }
  summary(guildId) {
    return this.db
      .prepare(
        'SELECT status,COUNT(*) count FROM native_polls WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  exportReceipts(guildId, channelId = null) {
    if (channelId !== null && (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId)))
      throw new UserError('pollManageInvalid');
    return this.db.transaction(() => {
      const total = this.db
        .prepare(
          'SELECT COUNT(*) n FROM native_polls WHERE guild_id=? AND (? IS NULL OR channel_id=?)',
        )
        .get(guildId, channelId, channelId).n;
      const receipts = this.db
        .prepare(
          'SELECT id,channel_id,message_id,status,created_at FROM native_polls WHERE guild_id=? AND (? IS NULL OR channel_id=?) ORDER BY id DESC LIMIT 100',
        )
        .all(guildId, channelId, channelId);
      return { total, truncated: total > receipts.length, receipts };
    })();
  }
  scopedMetadata(guildId, scope, value = null) {
    let filter, parameters;
    if (scope === 'channel') {
      if (typeof value !== 'string' || !/^\d{17,20}$/.test(value))
        throw new UserError('pollManageInvalid');
      filter = 'channel_id=?';
      parameters = [value];
    } else if (scope === 'state') {
      if (!['sending', 'sent', 'uncertain'].includes(value))
        throw new UserError('pollManageInvalid');
      filter = 'status=?';
      parameters = [value];
    } else if (scope === 'unresolved') {
      filter = "status IN ('sending','uncertain')";
      parameters = [];
    } else throw new UserError('pollManageInvalid');
    return this.db.transaction(() => {
      const values = [guildId, ...parameters],
        where = 'guild_id=? AND ' + filter;
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM native_polls WHERE ' + where)
        .get(...values).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id AS channelId,status,created_at AS createdAt FROM native_polls WHERE ' +
            where +
            ' ORDER BY id DESC LIMIT 100',
        )
        .all(...values);
      return { total, truncated: total > records.length, records };
    })();
  }
  exportMetadata(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM native_polls WHERE guild_id=?')
        .get(guildId).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id AS channelId,status,created_at AS createdAt FROM native_polls WHERE guild_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId);
      return { total, truncated: total > records.length, records };
    })();
  }
  channelCounts(guildId) {
    return this.db
      .prepare(
        'SELECT channel_id AS channelId,status,COUNT(*) AS count FROM native_polls WHERE guild_id=? GROUP BY channel_id,status ORDER BY channel_id,status',
      )
      .all(guildId);
  }
  inspectReceipt(guildId, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('pollManageInvalid');
    return (
      this.db
        .prepare(
          'SELECT id,channel_id AS channelId,status,created_at AS createdAt FROM native_polls WHERE guild_id=? AND id=?',
        )
        .get(guildId, id) ?? null
    );
  }
  reserve(i, channelId) {
    return this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM native_polls WHERE created_at<?')
        .run(Date.now() - 30 * 86400000);
      if (
        this.db
          .prepare('SELECT count(*) n FROM native_polls WHERE guild_id=? AND created_at>?')
          .get(i.guildId, Date.now() - 3600000).n >= 10
      )
        throw new UserError('pollLimit');
      return Number(
        this.db
          .prepare(
            "INSERT INTO native_polls(guild_id,actor_id,channel_id,status,interaction_id,created_at) VALUES(?,?,?,'sending',?,?)",
          )
          .run(i.guildId, i.user.id, channelId, i.id, Date.now()).lastInsertRowid,
      );
    })();
  }
  finish(id, status, messageId = null) {
    if (!['sent', 'uncertain'].includes(status)) throw new TypeError('Invalid poll state');
    if (status === 'sent' && (typeof messageId !== 'string' || !messageId.trim()))
      throw new TypeError('Missing poll message identity');
    const result = this.db
      .prepare("UPDATE native_polls SET status=?,message_id=? WHERE id=? AND status='sending'")
      .run(status, messageId, id);
    if (result.changes !== 1) throw new Error('Poll reservation not pending');
  }
  recover() {
    this.db.prepare("UPDATE native_polls SET status='uncertain' WHERE status='sending'").run();
  }
}
export function pollInput({ question, answers, duration = 24, multiple = false }) {
  if (
    typeof question !== 'string' ||
    !question.trim() ||
    question.length > 300 ||
    /[\u0000-\u001f\u007f]/u.test(question)
  )
    throw new UserError('pollInputInvalid');
  if (
    !Array.isArray(answers) ||
    answers.length < 2 ||
    answers.length > 10 ||
    answers.some(
      (a) =>
        typeof a !== 'string' || !a.trim() || a.length > 55 || /[\u0000-\u001f\u007f]/u.test(a),
    ) ||
    new Set(answers.map((a) => a.trim().toLocaleLowerCase('en'))).size !== answers.length ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 768 ||
    typeof multiple !== 'boolean'
  )
    throw new UserError('pollInputInvalid');
  return {
    question: { text: question.trim() },
    answers: answers.map((text) => ({ text: text.trim() })),
    duration,
    allowMultiselect: multiple,
  };
}
export async function publishPoll(i, c, input) {
  const poll = pollInput(input),
    channel = await i.guild.channels.fetch(input.channelId, { force: true });
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    !channel ||
    channel.id !== input.channelId ||
    channel.guildId !== i.guildId ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  )
    throw new UserError('pollChannelInvalid');
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageGuild) ||
    !channel.permissionsFor(actor)?.has([P.ViewChannel, P.SendMessages, P.SendPolls])
  )
    throw new UserError('userPermission');
  if (
    !i.guild.client?.user?.id ||
    bot?.id !== i.guild.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.SendPolls])
  )
    throw new UserError('pollBotPermission');
  const id = c.polls.reserve(i, channel.id);
  let message;
  try {
    message = await channel.send(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'pollPrompt'),
          poll,
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  } catch {
    try {
      c.polls.finish(id, 'uncertain');
    } catch {}
    throw new UserError('pollUncertain', { id });
  }
  try {
    if (typeof message?.id !== 'string' || !message.id.trim()) {
      c.polls.finish(id, 'uncertain');
      throw new Error('Missing poll message');
    }
    c.polls.finish(id, 'sent', message.id);
  } catch {
    throw new UserError('pollUncertain', { id });
  }
  return { id, messageId: message.id, channelId: channel.id };
}
