import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('boostcount')
    .setDescription('Fetch current server boost count and premium tier.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await i.client.guilds.fetch({ guild: i.guildId, force: true });
    if (
      !guild ||
      guild.id !== i.guildId ||
      !Number.isInteger(guild.premiumSubscriptionCount) ||
      !Number.isInteger(guild.premiumTier)
    )
      throw new UserError('boostUnavailable');
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'boostCountValue', {
            count: guild.premiumSubscriptionCount,
            tier: guild.premiumTier,
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
