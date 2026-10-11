import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export async function readOwnedPoll(i, c, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new UserError('pollManageInvalid');
  const row = c.polls.db
    .prepare('SELECT id,channel_id,message_id,status FROM native_polls WHERE id=? AND guild_id=?')
    .get(id, i.guildId);
  if (row?.status !== 'sent' || typeof row.message_id !== 'string' || !row.message_id)
    throw new UserError('pollManageInvalid');
  const channel = await i.guild.channels.fetch(row.channel_id, { force: true });
  const actor = await pollManager(i);
  if (
    channel?.id !== row.channel_id ||
    channel.guildId !== i.guildId ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) ||
    !channel.permissionsFor(actor)?.has([P.ViewChannel, P.ReadMessageHistory])
  )
    throw new UserError('pollManageInvalid');
  const bot = await i.guild.members.fetchMe({ force: true });
  if (
    !i.guild.client?.user?.id ||
    bot?.id !== i.guild.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory])
  )
    throw new UserError('botPermission');
  const message = await channel.messages.fetch({ message: row.message_id, force: true });
  const currentActor = await pollManager(i);
  if (!channel.permissionsFor(currentActor)?.has([P.ViewChannel, P.ReadMessageHistory]))
    throw new UserError('userPermission');
  if (
    !i.guild.client?.user?.id ||
    message?.id !== row.message_id ||
    message.channelId !== row.channel_id ||
    message.guildId !== i.guildId ||
    message.author?.id !== i.guild.client?.user?.id ||
    !message.poll
  )
    throw new UserError('pollManageInvalid');
  const latest = c.polls.db
    .prepare('SELECT status,message_id,channel_id FROM native_polls WHERE id=? AND guild_id=?')
    .get(id, i.guildId);
  if (
    latest?.status !== 'sent' ||
    latest.message_id !== row.message_id ||
    latest.channel_id !== row.channel_id
  )
    throw new UserError('pollManageInvalid');
  return { row, channel, message };
}
export async function pollManager(i) {
  const a = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    i.guild.id !== i.guildId ||
    a?.id !== i.user.id ||
    a.guild?.id !== i.guildId ||
    !a.permissions?.has(P.ManageGuild)
  )
    throw new UserError('userPermission');
  return a;
}
export async function endOwnedPoll(i, c, id, confirm) {
  if (confirm !== true) throw new UserError('pollEndConfirm');
  const { row, channel, message } = await readOwnedPoll(i, c, id);
  const expiry = message.poll.expiresTimestamp;
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new UserError('pollManageInvalid');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='poll_end' AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, row.message_id)
  )
    throw new UserError('pollEndUncertain');
  const caseId = c.cases.begin({
    guildId: i.guildId,
    targetId: row.message_id,
    actorId: i.user.id,
    action: 'poll_end',
    reason: 'Confirmed early end of own bot-created poll',
    interactionId: i.id,
  });
  try {
    await message.poll.end();
    const observed = await channel.messages.fetch({ message: row.message_id, force: true });
    if (
      observed?.id !== row.message_id ||
      observed.guildId !== i.guildId ||
      observed.channelId !== row.channel_id ||
      observed.author?.id !== i.guild.client.user.id ||
      !Number.isFinite(observed.poll?.expiresTimestamp) ||
      observed.poll.expiresTimestamp > Date.now()
    )
      throw Error('Poll end not observed');
    c.cases.finish(caseId, 'completed');
  } catch {
    try {
      c.cases.finish(caseId, 'uncertain');
    } catch {
      /*Pending blocks retry*/
    }
    throw new UserError('pollEndUncertain');
  }
  return caseId;
}
