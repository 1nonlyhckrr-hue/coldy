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
  .setDescription('Current server role and emoji metadata,no member enumeration.')
  .setContexts(InteractionContextType.Guild);
for (const kind of ['roles', 'emojis'])
  data.addSubcommand((s) =>
    s
      .setName(kind)
      .setDescription(`List current server ${kind},ten per page.`)
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(1000),
      ),
  );
export default {
  category: 'utility',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const kind = i.options.getSubcommand(),
      page = i.options.getInteger('page') ?? 1;
    if (!['roles', 'emojis'].includes(kind)) throw new UserError('unknownCommand');
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000)
      throw new UserError('listPageInvalid');
    const collection =
        kind === 'roles' ? await i.guild.roles.fetch() : await i.guild.emojis.fetch(),
      rows = [...collection.values()];
    if (rows.some((r) => !r || r.guild?.id !== i.guildId))
      throw new UserError('listIdentityInvalid');
    rows.sort(
      kind === 'roles'
        ? (a, b) => b.position - a.position || a.id.localeCompare(b.id)
        : (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id),
    );
    const pages = Math.max(1, Math.ceil(rows.length / 10));
    if (page > pages) throw new UserError('listPageInvalid');
    const lines = rows
      .slice((page - 1) * 10, page * 10)
      .map((r) =>
        kind === 'roles'
          ? `${escapeMarkdown(r.name).slice(0, 120)} | ${r.id} | ${r.position}`
          : `${escapeMarkdown(r.name ?? '-').slice(0, 120)} | ${r.id} | ${r.animated ? 'animated' : 'static'}`,
      );
    const locale = c.localization.locale(i.guildId),
      text =
        c.localization.t(i.guildId, 'listMetadataHeader', {
          kind: c.localization.t(
            i.guildId,
            kind === 'roles' ? 'listRolesLabel' : 'listEmojisLabel',
          ),
          count: rows.length,
          page,
          pages,
        }) +
        '\n' +
        (lines.join('\n') || c.localization.t(i.guildId, 'listMetadataEmpty'));
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
