import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show Emika version and implementation status.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, context) {
    await i.reply(
      lunaPayload(
        {
          content: context.localization.t(i.guildId, 'aboutBuild', {
            version: context.version,
            commands: context.commands.size,
          }),
          flags: MessageFlags.Ephemeral,
        },
        { locale: context.localization.locale(i.guildId) },
      ),
    );
  },
};
