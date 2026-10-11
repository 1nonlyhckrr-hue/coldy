import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Current role,emoji and sticker metadata,no member enumeration.')
  .setContexts(InteractionContextType.Guild);
for (const kind of ['roles', 'emojis', 'stickers'])
  data.addSubcommand((s) =>
    s
      .setName(kind)
      .setDescription(`List current server ${kind},ten per page with optional literal name search.`)
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(1000),
      )
      .addStringOption((o) =>
        o
          .setName('search')
          .setDescription('Literal case-insensitive name substring1-80characters')
          .setMinLength(1)
          .setMaxLength(80),
      ),
  );
export default {
  category: 'utility',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const kind = i.options.getSubcommand(),
      page = i.options.getInteger('page') ?? 1,
      search = i.options.getString('search');
    if (!['roles', 'emojis', 'stickers'].includes(kind)) throw new UserError('unknownCommand');
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000)
      throw new UserError('listPageInvalid');
    if (
      search !== null &&
      (typeof search !== 'string' ||
        !search.trim() ||
        search.length > 80 ||
        /[\u0000-\u001f\u007f]/u.test(search))
    )
      throw new UserError('listSearchInvalid');
    const collection =
        kind === 'roles'
          ? await i.guild.roles.fetch()
          : kind === 'emojis'
            ? await i.guild.emojis.fetch()
            : await i.guild.stickers.fetch(),
      rows = [...collection.values()];
    if (
      rows.some(
        (r) =>
          !r ||
          r.guild?.id !== i.guildId ||
          !/^\d{17,20}$/.test(r.id) ||
          typeof r.name !== 'string' ||
          r.name.length > 128 ||
          /[\u0000-\u001f\u007f]/u.test(r.name) ||
          (kind === 'roles' && (!Number.isSafeInteger(r.position) || r.position < 0)) ||
          (kind === 'emojis' && typeof r.animated !== 'boolean'),
      )
    )
      throw new UserError('listIdentityInvalid');
    const filtered =
      search === null
        ? rows
        : rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
    filtered.sort(
      kind === 'roles'
        ? (a, b) => b.position - a.position || a.id.localeCompare(b.id)
        : (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 10));
    if (page > pages) throw new UserError('listPageInvalid');
    const lines = filtered
      .slice((page - 1) * 10, page * 10)
      .map((r) =>
        kind === 'roles'
          ? `${escapeMarkdown(r.name.length > 50 ? r.name.slice(0, 50) + '...' : r.name)} | ${r.id} | ${r.position}`
          : kind === 'emojis'
            ? `${escapeMarkdown(r.name.length > 50 ? r.name.slice(0, 50) + '...' : r.name)} | ${r.id} | ${c.localization.t(i.guildId, r.animated ? 'listEmojiAnimated' : 'listEmojiStatic')}`
            : `${escapeMarkdown(r.name.length > 50 ? r.name.slice(0, 50) + '...' : r.name)} | ${r.id}`,
      );
    const locale = c.localization.locale(i.guildId),
      text =
        c.localization.t(i.guildId, 'listMetadataHeader', {
          kind: c.localization.t(
            i.guildId,
            kind === 'roles'
              ? 'listRolesLabel'
              : kind === 'emojis'
                ? 'listEmojisLabel'
                : 'listStickersLabel',
          ),
          count: filtered.length,
          page,
          pages,
        }) +
        '\n' +
        (lines.join('\n') || c.localization.t(i.guildId, 'listMetadataEmpty')) +
        '\n' +
        c.localization.t(i.guildId, 'listNameNotice');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
