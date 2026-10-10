import { translate } from '../services/localization.js';
import { lunaPayload } from './embeds.js';
import { randomUUID } from 'node:crypto';
import { MessageFlags } from 'discord.js';
export class UserError extends Error { constructor(message, parameters={}) { super(message); this.name = 'UserError'; this.key=message; this.parameters=parameters; } }
export async function handleInteractionError(error, interaction, logger, localization) {
  const reference = randomUUID().slice(0,8);
  // Avoid raw API bodies, stack traces, and message content in public/log output.
  logger.error({reference, kind:error?.name ?? 'Error', command:interaction.commandName}, 'Command failed');
  let locale='en';try{locale=localization?.locale(interaction.guildId)??'en';}catch{}
  let content;
  if(error instanceof UserError){try{content=translate(locale,error.key,error.parameters);}catch{content=error.message;}}
  else content=translate(locale,'genericError',{reference});
  try {
    if (interaction.deferred) await interaction.editReply(lunaPayload({content},{kind:'error',locale}));
    else if (interaction.replied) await interaction.followUp(lunaPayload({content, flags:MessageFlags.Ephemeral},{kind:'error',locale}));
    else await interaction.reply(lunaPayload({content, flags:MessageFlags.Ephemeral},{kind:'error',locale}));
  } catch { logger.warn({reference}, 'Unable to deliver error response'); }
}
