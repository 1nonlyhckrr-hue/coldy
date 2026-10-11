import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export const CHANNEL_TYPES = new Map([
  [ChannelType.GuildText, 'text'],
  [ChannelType.GuildVoice, 'voice'],
  [ChannelType.GuildCategory, 'category'],
  [ChannelType.GuildAnnouncement, 'announcement'],
  [ChannelType.GuildStageVoice, 'stage'],
  [ChannelType.GuildForum, 'forum'],
  [ChannelType.GuildMedia, 'media'],
]);
export async function currentChannelActor(i) {
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (i.guild.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
    throw new UserError('channelMetadataInvalid');
  return actor;
}
export function readableChannel(channel, i, actor) {
  if (
    !channel ||
    channel.guildId !== i.guildId ||
    !/^[0-9]{17,20}$/.test(channel.id) ||
    !CHANNEL_TYPES.has(channel.type) ||
    typeof channel.name !== 'string' ||
    channel.name.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(channel.name) ||
    !Number.isSafeInteger(channel.rawPosition) ||
    channel.rawPosition < 0
  )
    throw new UserError('channelMetadataInvalid');
  return channel.permissionsFor(actor)?.has(P.ViewChannel) === true;
}
export async function inspectChannel(i, id) {
  if (typeof id !== 'string' || !/^[0-9]{17,20}$/.test(id))
    throw new UserError('channelMetadataInvalid');
  const channel = await i.guild.channels.fetch(id, { force: true });
  const actor = await currentChannelActor(i);
  if (channel?.id !== id || !readableChannel(channel, i, actor))
    throw new UserError('channelMetadataDenied');
  return { channel, actor };
}
