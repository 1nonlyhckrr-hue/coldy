import { UserError } from './errors.js';
export function enforcePermissions(interaction, command, config) {
  if (!interaction.inGuild()) throw new UserError('guildOnly');
  if (command.ownerOnly && !config.ownerIds.includes(interaction.user.id))
    throw new UserError('ownerOnly');
  const user = command.userPermissions ?? [];
  const bot = command.botPermissions ?? [];
  if (user.length && !interaction.memberPermissions?.has(user))
    throw new UserError('userPermission');
  if (bot.length && !interaction.appPermissions?.has(bot)) throw new UserError('botPermission');
}
export function enforceHierarchy(actor, bot, target, guildOwnerId) {
  if (target.id === guildOwnerId || target.id === actor.id || target.id === bot.id)
    throw new UserError('protectedTarget');
  if (actor.id !== guildOwnerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    throw new UserError('actorHierarchy');
  if (bot.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    throw new UserError('botHierarchy');
}
