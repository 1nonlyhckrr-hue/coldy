import { requireVoiceReady, voiceOccupancy } from './voiceReadiness.js';
import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
import { translate } from './localization.js';
export const VOICE_PERMISSIONS = {
  mute: P.MuteMembers,
  unmute: P.MuteMembers,
  deafen: P.DeafenMembers,
  undeafen: P.DeafenMembers,
  disconnect: P.MoveMembers,
  move: P.MoveMembers,
};
export async function voiceAction(i, c, { action, targetId, channelId, reason }) {
  requireVoiceReady(i, c);
  const permission = VOICE_PERMISSIONS[action];
  if (!permission) throw new UserError('voiceActionInvalid');
  if (!/^\d{17,20}$/.test(targetId ?? '')) throw new UserError('modIdInvalid');
  if (
    reason != null &&
    (typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 400 ||
      /[\u0000-\u001f\u007f]/u.test(reason))
  )
    throw new UserError('modReasonBounds');
  let [actor, bot, target] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.members.fetch({ user: targetId, force: true }),
  ]);
  if (i.guild?.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
    throw new UserError('modActorPermission');
  if (!i.client?.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
    throw new UserError('modBotPermission');
  if (!actor?.permissions.has(permission)) throw new UserError('modActorPermission');
  if (!bot?.permissions.has(permission) || !i.appPermissions?.has(permission))
    throw new UserError('modBotPermission');
  if (!target || target.id !== targetId || target.guild?.id !== i.guildId)
    throw new UserError('modTargetUnavailable');
  enforceHierarchy(actor, bot, target, i.guild.ownerId);
  if (target.user?.bot !== false) throw new UserError('voiceBotTarget');
  const sourceId = target.voice.channelId;
  if (!sourceId) throw new UserError('voiceNotConnected');
  if (typeof sourceId !== 'string' || !/^\d{17,20}$/.test(sourceId))
    throw new UserError('voiceChannelInvalid');
  const source = await i.guild.channels.fetch(sourceId, { force: true });
  if (
    !source ||
    source.id !== sourceId ||
    source.guildId !== i.guildId ||
    source.type !== ChannelType.GuildVoice
  )
    throw new UserError('voiceChannelInvalid');
  for (const member of [actor, bot])
    if (!source.permissionsFor(member)?.has([P.ViewChannel, permission]))
      throw new UserError('voiceChannelPermission');
  let destination;
  if (action === 'move') {
    if (!/^\d{17,20}$/.test(channelId ?? '')) throw new UserError('voiceChannelInvalid');
    destination = await i.guild.channels.fetch(channelId, { force: true });
    if (
      !destination ||
      destination.id !== channelId ||
      destination.guildId !== i.guildId ||
      destination.type !== ChannelType.GuildVoice ||
      destination.id === source.id
    )
      throw new UserError('voiceChannelInvalid');
    if (
      !Number.isInteger(destination.userLimit) ||
      destination.userLimit < 0 ||
      destination.userLimit > 99
    )
      throw new UserError('voiceChannelInvalid');
    for (const member of [actor, bot, target])
      if (!destination.permissionsFor(member)?.has([P.ViewChannel, P.Connect]))
        throw new UserError('voiceDestinationPermission');
    // Do not bypass normal capacity, even when the bot's privileges could.
    if (
      destination.userLimit > 0 &&
      voiceOccupancy(i.guild, destination.id) >= destination.userLimit
    )
      throw new UserError('voiceChannelFull');
  }
  // Recheck voice channel immediately before reserving the effect. Refuse races, never chase the target.
  let current;
  [actor, bot, current] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.members.fetch({ user: targetId, force: true }),
  ]);
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(permission)
  )
    throw new UserError('modActorPermission');
  if (
    bot?.id !== i.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has(permission) ||
    !i.appPermissions?.has(permission)
  )
    throw new UserError('modBotPermission');
  for (const member of [actor, bot])
    if (!source.permissionsFor(member)?.has([P.ViewChannel, permission]))
      throw new UserError('voiceChannelPermission');
  if (destination) {
    if (
      !Number.isInteger(destination.userLimit) ||
      destination.userLimit < 0 ||
      destination.userLimit > 99
    )
      throw new UserError('voiceChannelInvalid');
    for (const member of [actor, bot])
      if (!destination.permissionsFor(member)?.has([P.ViewChannel, P.Connect]))
        throw new UserError('voiceDestinationPermission');
    if (
      destination.userLimit > 0 &&
      voiceOccupancy(i.guild, destination.id) >= destination.userLimit
    )
      throw new UserError('voiceChannelFull');
  }
  if (
    !current ||
    current.id !== targetId ||
    current.guild?.id !== i.guildId ||
    current.voice.channelId !== sourceId
  )
    throw new UserError('voiceMoved');
  enforceHierarchy(actor, bot, current, i.guild.ownerId);
  if (current.user?.bot !== false) throw new UserError('voiceBotTarget');
  if (destination && !destination.permissionsFor(current)?.has([P.ViewChannel, P.Connect]))
    throw new UserError('voiceDestinationPermission');
  const locale = c.localization?.locale(i.guildId) ?? 'en';
  const auditReason = (reason ?? translate(locale, 'noReason')).trim();
  requireVoiceReady(i, c);
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action=? AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, targetId, `voice_${action}`)
  )
    throw new UserError('voicePriorUncertain');
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId,
    actorId: actor.id,
    action: `voice_${action}`,
    reason: auditReason,
    interactionId: i.id,
  });
  try {
    const audit = `Luna | actor ${actor.id} | ${auditReason}`;
    if (['mute', 'unmute'].includes(action)) await current.voice.setMute(action === 'mute', audit);
    else if (['deafen', 'undeafen'].includes(action))
      await current.voice.setDeaf(action === 'deafen', audit);
    else await current.voice.setChannel(action === 'move' ? destination : null, audit);
  } catch (error) {
    const rejected = typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    throw new UserError('voiceActionUncertain', { id, status: rejected ? 'failed' : 'uncertain' });
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('voiceStorageIncomplete', { id });
  }
  return { id };
}
