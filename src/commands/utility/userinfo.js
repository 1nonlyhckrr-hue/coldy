import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show public user information.')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
  async execute(i, c) {
    const user = i.options.getUser('user') ?? i.user;
    await i.reply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'userInfo', {
            username: user.username,
            id: user.id,
            bot: user.bot,
            created: user.createdAt.toISOString(),
          }),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
