import { translate } from '../../services/localization.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { helpPage, commandDetails } from '../../services/helpIndex.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
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
    )
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('Exact installed path for native parameter details,e.g.music play')
        .setMinLength(1)
        .setMaxLength(80),
    ),
  async execute(i, c) {
    const locale = c.localization?.locale(i.guildId) ?? 'en',
      t = (key, params) => translate(locale, key, params);
    const detail = i.options?.getString?.('command'),
      category = i.options?.getString?.('category'),
      search = i.options?.getString?.('search'),
      page = i.options?.getInteger?.('page') ?? 1;
    let content;
    if (detail !== null && detail !== undefined) {
      if (category || search) throw new UserError('helpDetailConflict');
      const r = commandDetails(c.commands, detail, page);
      const lines = r.lines.map((row) =>
        row.kind === 'parameter'
          ? t('helpParameter', {
              name: row.name,
              type: row.type,
              required: t(row.required ? 'helpRequired' : 'helpOptional'),
              description: row.description,
            })
          : row.kind === 'bounds'
            ? t('helpParameterBounds', { name: row.name, bounds: JSON.stringify(row.bounds) })
            : t('helpChoice', {
                name: row.name,
                label: escapeMarkdown(row.label),
                value: escapeMarkdown(String(row.value)),
              }),
      );
      content =
        t('helpDetailHeader', {
          path: r.path,
          description: r.description,
          category: r.category,
          n: r.parameters,
          page: r.page,
          pages: r.pages,
        }) +
        '\n' +
        (lines.join('\n') || t('helpNoParameters')) +
        '\n' +
        t('helpDetailFooter');
    } else {
      const result = helpPage(c.commands, { page, category, search });
      content = `${t('helpHeader', { version: c.version, page: result.page, pages: result.pages })}\n${t('helpResultCount', { n: result.total })}\n${result.lines.join('\n') || t('helpNoResults')}\n${t('helpFooter')}`;
    }
    await i.reply(
      lunaPayload(
        {
          content,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
  },
};
