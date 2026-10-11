import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export async function editTextChannel(i, c, { channelId, action, value, confirm }) {
  if (confirm !== true) throw new UserError('channelEditConfirm');
  if (
    !/^\d{17,20}$/.test(channelId) ||
    !['rename', 'topic', 'cleartopic', 'threadarchive', 'threadslowmode', 'agerestrict'].includes(
      action,
    )
  )
    throw new UserError('channelEditInput');
  const name = action === 'rename',
    setting = ['threadarchive', 'threadslowmode', 'agerestrict'].includes(action),
    desired = action === 'cleartopic' ? null : action === 'agerestrict' ? true : value;
  if (
    (action === 'threadarchive' && ![60, 1440, 4320, 10080].includes(value)) ||
    (action === 'threadslowmode' && (!Number.isInteger(value) || value < 0 || value > 21600))
  )
    throw new UserError('channelEditInput');
  if (
    !setting &&
    action !== 'cleartopic' &&
    (typeof value !== 'string' ||
      value.trim() !== value ||
      !value ||
      value.length > (name ? 100 : 1024) ||
      /[\u0000-\u001f\u007f@]/u.test(value) ||
      (name && !/^[a-z0-9_-]+$/.test(value)))
  )
    throw new UserError('channelEditInput');
  const channel = await i.guild.channels.fetch(channelId, { force: true });
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (i.guild.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
    throw new UserError('userPermission');
  if (bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
    throw new UserError('botPermission');
  if (
    channel?.id !== channelId ||
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
  const property =
    {
      threadarchive: 'defaultAutoArchiveDuration',
      threadslowmode: 'defaultThreadRateLimitPerUser',
      agerestrict: 'nsfw',
    }[action] ?? (name ? 'name' : 'topic');
  if (
    (name && typeof channel.name !== 'string') ||
    (!setting && !name && channel.topic !== null && typeof channel.topic !== 'string')
  )
    throw new UserError('channelEditInput');
  if (
    setting &&
    !(action === 'agerestrict'
      ? typeof channel[property] === 'boolean'
      : channel[property] === null || Number.isInteger(channel[property]))
  )
    throw new UserError('channelEditInput');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('channel_rename','channel_topic','channel_threadarchive','channel_threadslowmode','channel_agerestrict') AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, channelId)
  )
    throw new UserError('channelEditUncertain');
  if (channel[property] === desired) return { changed: false };
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: channelId,
    actorId: actor.id,
    action: setting ? 'channel_' + action : name ? 'channel_rename' : 'channel_topic',
    reason: setting
      ? 'Confirmed text-channel default/age restriction setting'
      : name
        ? 'Explicit one text-channel rename'
        : 'Explicit one text-channel topic update/reset',
    interactionId: i.id,
  });
  let accepted = false;
  try {
    if (setting)
      await channel.edit({
        [property]: desired,
        reason: `Luna | actor ${actor.id} | confirmed channel setting`,
      });
    else if (name)
      await channel.setName(desired, `Luna | actor ${actor.id} | confirmed channel rename`);
    else await channel.setTopic(desired, `Luna | actor ${actor.id} | confirmed channel topic`);
    accepted = true;
    const latest = await i.guild.channels.fetch(channelId, { force: true });
    if (
      latest?.id !== channelId ||
      latest.guildId !== i.guildId ||
      latest.type !== ChannelType.GuildText ||
      latest[property] !== desired
    )
      throw Error('Channel edit not observed');
  } catch (error) {
    const rejected =
      !accepted && typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    try {
      c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    } catch {
      /* Pending blocks replay. */
    }
    throw new UserError('channelEditUncertain');
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('channelEditUncertain');
  }
  return { changed: true, id };
}
