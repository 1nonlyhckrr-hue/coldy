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
      !Number.isSafeInteger(guild.premiumSubscriptionCount) ||
      guild.premiumSubscriptionCount < 0 ||
      !Number.isInteger(guild.premiumTier) ||
      guild.premiumTier < 0 ||
      guild.premiumTier > 3
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
