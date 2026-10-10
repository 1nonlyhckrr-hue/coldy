import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Fetch a public user profile banner link,no guild membership assumption.')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Defaults to you')),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const selected = i.options.getUser('user') ?? i.user,
      user = await i.client.users.fetch(selected.id, { force: true });
    if (!user || user.id !== selected.id) throw new UserError('customMemberMissing');
    const locale = c.localization.locale(i.guildId),
      url = user.bannerURL({ size: 1024 });
    await i.editReply(
      lunaPayload(
        {
          content: url
            ? c.localization.t(i.guildId, 'bannerValue', { id: user.id, url })
            : c.localization.t(i.guildId, 'bannerMissing', { id: user.id }),
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
  },
};
