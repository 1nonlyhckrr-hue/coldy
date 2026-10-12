import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Show Emika gateway latency.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    const latency = i.client.ws.ping;
    await i.reply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, latency < 0 ? 'pingUnavailable' : 'pingValue', {
            latency,
          }),
          flags: MessageFlags.Ephemeral,
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
