import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show how long this process has been running.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    const s = Math.floor(process.uptime());
    await i.reply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'uptimeValue', {
            hours: Math.floor(s / 3600),
            minutes: Math.floor((s % 3600) / 60),
            seconds: s % 60,
          }),
          flags: MessageFlags.Ephemeral,
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
