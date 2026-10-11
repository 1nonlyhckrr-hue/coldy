import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
export default {
  category: 'giveaway',
  cooldownMs: 5000,
  data: new SlashCommandBuilder()
    .setName('giveawayleave')
    .setDescription('Withdraw only your own entry from an active giveaway before its deadline.')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o.setName('id').setDescription('Giveaway record ID').setMinValue(1).setRequired(true),
    ),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      member?.id !== i.user.id ||
      member.guild?.id !== i.guildId ||
      member.user.bot
    )
      throw new UserError('giveawayUserInvalid');
    const changed = c.giveaways.leave(i.options.getInteger('id', true), i.guildId, i.user.id);
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, changed ? 'giveawayLeft' : 'giveawayNotEntered'),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
