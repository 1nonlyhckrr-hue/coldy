import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { formatQueue } from '../../services/steal.js';
export default {
  category: 'utility',
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('stealqueue')
    .setDescription('Owner-only list of /steal requests Emika does not have yet.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const t = (k, p) => c.localization.t(i.guildId, k, p);
    await i.editReply(
      lunaPayload(
        { content: formatQueue(c.steal.list(), t), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
