import {
  AttachmentBuilder,
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { banList } from '../../services/banLists.js';
import { memberList } from '../../services/memberLists.js';
import { translate } from '../../services/localization.js';
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
for (const kind of ['admins', 'bots', 'boosters'])
  data.addSubcommand((s) =>
    s
      .setName(kind)
      .setDescription(
        'Manager-only current ' + kind + ' member snapshot,ten/page,no presences or storage.',
      )
      .addIntegerOption((o) =>
        o
          .setName('page')
          .setDescription('Page within filtered fresh result')
          .setMinValue(1)
          .setMaxValue(10000),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('inrole')
    .setDescription(
      'Manager-only fresh members holding one confirmed role,ten/page,no presences/storage.',
    )
    .addRoleOption((o) =>
      o.setName('role').setDescription('One current guild role').setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(10000),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('bans')
    .setDescription(
      'Manager+BanMembers-only current bans,max100perfetch,no reasons;optional after-ID.',
    )
    .addStringOption((o) =>
      o
        .setName('after')
        .setDescription('Previous page last user ID;omit for first page')
        .setMinLength(17)
        .setMaxLength(20),
    ),
);
export default {
  category: 'utility',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();
    if (sub === 'bans') {
      const result = await banList(i, { after: i.options.getString('after') }),
        locale = c.guildConfig.get(i.guildId).language;
      await i.editReply(
        lunaPayload(
          {
            content:
              translate(locale, 'banListHeader', {
                count: result.records.length,
                next: result.nextAfter ?? '-',
              }) +
              '\n' +
              (result.records
                .slice(0, 10)
                .map((r) => escapeMarkdown(r.username) + ' | ' + r.id)
                .join('\n') || translate(locale, 'listMetadataEmpty')),
            files: [
              new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
                name: 'emika-ban-page.json',
              }),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    }
    if (['admins', 'bots', 'boosters', 'inrole'].includes(sub)) {
      const result = await memberList(i, c, {
          kind: sub,
          page: i.options.getInteger('page') ?? 1,
          roleId: sub === 'inrole' ? i.options.getRole('role', true).id : null,
        }),
        locale = c.guildConfig.get(i.guildId).language;
      const text =
        translate(locale, 'memberListHeader', {
          kind: translate(locale, 'memberList_' + sub),
          count: result.count,
          page: result.page,
          pages: result.pages,
        }) +
        '\n' +
        (result.records.map((r) => escapeMarkdown(r.username) + ' | ' + r.id).join('\n') ||
          translate(locale, 'listMetadataEmpty'));
      await i.editReply(
        lunaPayload(
          { content: text, allowedMentions: { parse: [], repliedUser: false } },
          { locale },
        ),
      );
      return;
    }
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
