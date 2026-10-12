import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export async function setSlowmode(i, c, { channelId, seconds, confirm }) {
  if (confirm !== true) throw new UserError('slowmodeConfirm');
  if (
    !/^\d{17,20}$/.test(channelId) ||
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > 21600
  )
    throw new UserError('slowmodeInput');
  const [actor, bot, channel] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.channels.fetch(channelId, { force: true }),
  ]);
  if (i.guild.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
    throw new UserError('userPermission');
  if (bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
    throw new UserError('botPermission');
  if (
    !channel ||
    channel.id !== channelId ||
    channel.guildId !== i.guildId ||
    channel.type !== ChannelType.GuildText
  )
    throw new UserError('channelTypeInvalid');
  if (!channel.permissionsFor(actor)?.has([P.ViewChannel, P.ManageChannels]))
    throw new UserError('userPermission');
  if (
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ManageChannels]) ||
    !i.appPermissions?.has(P.ManageChannels)
  )
    throw new UserError('botPermission');
  if (
    !Number.isInteger(channel.rateLimitPerUser) ||
    channel.rateLimitPerUser < 0 ||
    channel.rateLimitPerUser > 21600
  )
    throw new UserError('slowmodeInput');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='slowmode' AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, channelId)
  )
    throw new UserError('slowmodeUncertain');
  if (channel.rateLimitPerUser === seconds) return { changed: false };
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: channelId,
    actorId: actor.id,
    action: 'slowmode',
    reason: `Explicit slowmode ${channel.rateLimitPerUser}s to ${seconds}s`,
    interactionId: i.id,
  });
  let accepted = false;
  try {
    await channel.setRateLimitPerUser(seconds, `Emika | actor ${actor.id} | explicit slowmode`);
    accepted = true;
    const latest = await i.guild.channels.fetch(channelId, { force: true });
    if (
      !latest ||
      latest.id !== channelId ||
      latest.guildId !== i.guildId ||
      latest.type !== ChannelType.GuildText ||
      latest.rateLimitPerUser !== seconds
    )
      throw Error('Slowmode verification failed');
  } catch (error) {
    const rejected =
      !accepted && typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    throw new UserError('slowmodeUncertain');
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('slowmodeUncertain');
  }
  return { changed: true, id };
}
