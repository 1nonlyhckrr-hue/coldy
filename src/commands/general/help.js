import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { helpPage } from '../../services/helpIndex.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Privately browse installed paths by page,category or literal search.')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Result page1-100').setMinValue(1).setMaxValue(100),
    )
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('Exact installed category,for example music or utility')
        .setMaxLength(32),
    )
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Literal case-insensitive command/description search')
        .setMinLength(1)
        .setMaxLength(80),
    ),
  async execute(i, c) {
    const locale = c.localization?.locale(i.guildId) ?? 'en',
      t = (key, params) => translate(locale, key, params);
    const result = helpPage(c.commands, {
      page: i.options?.getInteger?.('page') ?? 1,
      category: i.options?.getString?.('category'),
      search: i.options?.getString?.('search'),
    });
    await i.reply(
      lunaPayload(
        {
          content: `${t('helpHeader', { version: c.version, page: result.page, pages: result.pages })}\n${t('helpResultCount', { n: result.total })}\n${result.lines.join('\n') || t('helpNoResults')}\n${t('helpFooter')}`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
  },
};
