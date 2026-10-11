import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show public user information.')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const selected = i.options.getUser('user') ?? i.user,
      user = await i.client.users.fetch(selected.id, { force: true });
    if (!user || user.id !== selected.id) throw new UserError('customMemberMissing');
    if (
      typeof user.username !== 'string' ||
      typeof user.bot !== 'boolean' ||
      !(user.createdAt instanceof Date) ||
      !Number.isFinite(user.createdAt.getTime())
    )
      throw new UserError('customMemberMissing');
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'userInfo', {
            username: escapeMarkdown(user.username),
            id: user.id,
            bot: user.bot,
            created: user.createdAt.toISOString(),
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
