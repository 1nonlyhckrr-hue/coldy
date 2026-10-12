import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { requireVoiceReady, voiceOccupancy } from './voiceReadiness.js';
import { UserError } from '../utils/errors.js';
export async function editEmptyVoiceChannel(i, c, { channelId, action, value, confirm }) {
  if (confirm !== true) throw new UserError('voiceChannelConfirm');
  requireVoiceReady(i, c);
  if (
    !/^\d{17,20}$/.test(channelId) ||
    !['voicelimit', 'voicebitrate', 'voiceregionauto'].includes(action) ||
    (action === 'voicelimit' && (!Number.isInteger(value) || value < 0 || value > 99)) ||
    (action === 'voicebitrate' && (!Number.isInteger(value) || value < 8 || value > 96))
  )
    throw new UserError('voiceChannelInput');
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
    channel.type !== ChannelType.GuildVoice
  )
    throw new UserError('voiceChannelInput');
  for (const member of [actor, bot])
    if (!channel.permissionsFor(member)?.has([P.ViewChannel, P.ManageChannels]))
      throw new UserError('voiceChannelPermission');
  if (!i.appPermissions?.has(P.ManageChannels)) throw new UserError('botPermission');
  requireVoiceReady(i, c);
  if (voiceOccupancy(i.guild, channelId) !== 0) throw new UserError('voiceChannelOccupied');
  const property = {
      voicelimit: 'userLimit',
      voicebitrate: 'bitrate',
      voiceregionauto: 'rtcRegion',
    }[action],
    desired =
      action === 'voicebitrate' ? value * 1000 : action === 'voiceregionauto' ? null : value;
  if (
    (property === 'userLimit' &&
      (!Number.isInteger(channel.userLimit) || channel.userLimit < 0 || channel.userLimit > 99)) ||
    (property === 'bitrate' && (!Number.isInteger(channel.bitrate) || channel.bitrate < 8000)) ||
    (property === 'rtcRegion' &&
      channel.rtcRegion !== null &&
      typeof channel.rtcRegion !== 'string')
  )
    throw new UserError('voiceChannelInput');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('voicelimit','voicebitrate','voiceregionauto') AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, channelId)
  )
    throw new UserError('voiceChannelUncertain');
  if (channel[property] === desired) return { changed: false };
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: channelId,
    actorId: actor.id,
    action,
    reason: 'Confirmed empty voice-channel setting',
    interactionId: i.id,
  });
  let accepted = false;
  try {
    const reason = `Emika | actor ${actor.id} | empty voice-channel setting`;
    if (action === 'voicelimit') await channel.setUserLimit(desired, reason);
    else if (action === 'voicebitrate') await channel.setBitrate(desired, reason);
    else await channel.setRTCRegion(null, reason);
    accepted = true;
    const latest = await i.guild.channels.fetch(channelId, { force: true });
    if (
      latest?.id !== channelId ||
      latest.guildId !== i.guildId ||
      latest.type !== ChannelType.GuildVoice ||
      latest[property] !== desired
    )
      throw Error('Voice setting not observed');
  } catch (error) {
    const rejected =
      !accepted && typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    try {
      c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    } catch {
      /*Pending blocks retry*/
    }
    throw new UserError('voiceChannelUncertain');
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('voiceChannelUncertain');
  }
  return { changed: true, id };
}
