import { UserError } from '../../utils/errors.js';
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
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const selected = i.options.getUser('user') ?? i.user,
      user = await i.client.users.fetch(selected.id, { force: true });
    if (!user || user.id !== selected.id) throw new UserError('customMemberMissing');
    await i.editReply(
      lunaPayload(
        {
          content: user.displayAvatarURL({ size: 1024 }),
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
