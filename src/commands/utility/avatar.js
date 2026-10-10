import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a public avatar link.')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
  async execute(i, c) {
    const user = i.options.getUser('user') ?? i.user;
    await i.reply(
      lunaPayload(
        {
          content: user.displayAvatarURL({ size: 1024 }),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
        {
          title: c.localization.t(i.guildId, 'avatarTitle'),
          locale: c.localization.locale(i.guildId),
        },
      ),
    );
  },
};
