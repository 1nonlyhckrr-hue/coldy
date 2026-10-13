import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lockdownFlags, readOverwrite } from './lockdown.js';
// /channeltools: per-channel lock, hide, archive, clone and nuke. Every change saves the exact
// previous @everyone overwrite first so the matching undo puts back precisely what was there.
const FEATURE = 'chan';
const ARCHIVE_FLAGS = ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'AddReactions'];
const NUKE_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
export function flagsFor(kind, channel) {
  if (kind === 'lock') return lockdownFlags(channel);
  if (kind === 'hide') return ['ViewChannel'];
  if (kind === 'archive')
    return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice
      ? ['ViewChannel', 'Connect']
      : ARCHIVE_FLAGS;
  throw new Error('Unknown channel state');
}
const key = (kind, id) => `${kind}:${id}`;
export async function denyEveryone(guild, channel, store, kind, actorId) {
  if (!channel?.permissionOverwrites?.edit) throw new UserError('ctUnsupported');
  const flags = flagsFor(kind, channel);
  if (!flags.length) throw new UserError('ctUnsupported');
  if (store.get(guild.id, FEATURE, key(kind, channel.id))) throw new UserError('ctAlready');
  // lock/hide and archive both edit the same flags, so they cannot overlap on one channel.
  const other = kind === 'archive' ? ['lock', 'hide'] : ['archive'];
  if (other.some((k) => store.get(guild.id, FEATURE, key(k, channel.id))))
    throw new UserError('ctBusy');
  const prev = readOverwrite(channel, guild.id, flags);
  store.set(guild.id, FEATURE, key(kind, channel.id), { prev, by: actorId, at: Date.now() });
  try {
    await channel.permissionOverwrites.edit(
      guild.id,
      Object.fromEntries(flags.map((f) => [f, false])),
      { reason: `Emika ${kind} by ${actorId}` },
    );
  } catch {
    store.del(guild.id, FEATURE, key(kind, channel.id));
    throw new UserError('ctFailed');
  }
  return { flags: flags.length };
}
export async function restoreEveryone(guild, channel, store, kind, actorId) {
  const saved = store.get(guild.id, FEATURE, key(kind, channel.id));
  if (!saved) throw new UserError('ctNotActive');
  try {
    await channel.permissionOverwrites.edit(guild.id, saved.prev, {
      reason: `Emika un${kind} by ${actorId}`,
    });
  } catch {
    throw new UserError('ctFailed');
  }
  store.del(guild.id, FEATURE, key(kind, channel.id));
  return { flags: Object.keys(saved.prev).length };
}
export async function cloneChannel(channel, name, actorId) {
  if (!channel?.clone) throw new UserError('ctUnsupported');
  try {
    return await channel.clone({ ...(name ? { name } : {}), reason: `Emika clone by ${actorId}` });
  } catch {
    throw new UserError('ctFailed');
  }
}
/** Delete and recreate: same name, topic, category, overwrites and slowmode. Messages are gone. */
export async function nukeChannel(guild, channel, store, actorId) {
  if (!NUKE_TYPES.has(channel?.type)) throw new UserError('ctUnsupported');
  if (
    [guild.rulesChannelId, guild.publicUpdatesChannelId, guild.systemChannelId].includes(channel.id)
  )
    throw new UserError('ctProtected');
  const position = channel.position;
  let fresh;
  try {
    fresh = await channel.clone({ reason: `Emika nuke by ${actorId}` });
  } catch {
    throw new UserError('ctFailed');
  }
  try {
    await fresh.setPosition(position);
  } catch {
    // order is cosmetic; the channel itself is already correct
  }
  try {
    await channel.delete(`Emika nuke by ${actorId}`);
  } catch {
    // keep the copy only if the old one could not be removed: the caller is told
    return { fresh, deleted: false };
  }
  for (const k of ['lock', 'hide', 'archive']) store.del(guild.id, FEATURE, key(k, channel.id));
  return { fresh, deleted: true };
}
