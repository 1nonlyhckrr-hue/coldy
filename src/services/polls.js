import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
export class Polls {
  constructor(db) {
    this.db = db;
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
    this.db
      .prepare('UPDATE native_polls SET status=?,message_id=? WHERE id=?')
      .run(status, messageId, id);
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
    [actor, bot, channel] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
      i.guild.channels.fetch(input.channelId, { force: true }),
    ]);
  if (
    !channel ||
    channel.id !== input.channelId ||
    channel.guildId !== i.guildId ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  )
    throw new UserError('pollChannelInvalid');
  if (
    !actor.permissions.has(P.ManageGuild) ||
    !channel.permissionsFor(actor)?.has([P.ViewChannel, P.SendMessages, P.SendPolls])
  )
    throw new UserError('userPermission');
  if (!channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.SendPolls]))
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
    c.polls.finish(id, 'uncertain');
    throw new UserError('pollUncertain', { id });
  }
  try {
    if (!message?.id) throw new Error('Missing poll message');
    c.polls.finish(id, 'sent', message.id);
  } catch {
    throw new UserError('pollUncertain', { id });
  }
  return { id, messageId: message.id, channelId: channel.id };
}
