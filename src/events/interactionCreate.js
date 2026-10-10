import { UserError, handleInteractionError } from '../utils/errors.js';
import { enforcePermissions } from '../utils/permissions.js';
export function createInteractionHandler(context) {
  return async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
      const command = context.commands.get(interaction.commandName);
      if (!command) throw new UserError('unknownCommand');
      enforcePermissions(interaction,command,context.config);
      if (context.commandRestrictions) await context.commandRestrictions.enforce(interaction, command.data.name);
      const subcommand = interaction.options?.getSubcommand?.(false) ?? '';
      const remaining = context.cooldowns.acquire(`${interaction.guildId}:${interaction.user.id}:${command.data.name}:${subcommand}`, command.cooldownMs ?? 3000);
      if (remaining) throw new UserError('commandCooldown',{seconds:Math.ceil(remaining/1000)});
      await command.execute(interaction,context);
    } catch (error) { await handleInteractionError(error,interaction,context.logger,context.localization); }
  };
}
