import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
  escapeMarkdown,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('casehistory')
  .setDescription('Private stored Emika case audit,no native effects or recovery.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('inspect')
      .setDescription('Read one exact stored case identity/reason/status,not current native state.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Case ID in this server').setMinValue(1).setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('Page stored case metadata,ten per page,optional exact status filter.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-1000,newestfirst').setMinValue(1).setMaxValue(1000),
      )
      .addStringOption((o) =>
        o
          .setName('state')
          .setDescription('Stored outcome state')
          .addChoices(
            ...['pending', 'completed', 'failed', 'uncertain'].map((v) => ({ name: v, value: v })),
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription(
        'Private latest100case metadata/reasons JSON,total/truncated,no recovery/grant.',
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription(
      'Private allstoredcase counts bystatus,no identities/reasons or native claims.',
    ),
);
for (const kind of ['actor', 'target'])
  data.addSubcommand((s) =>
    s
      .setName(kind)
      .setDescription(
        'Private storedcase metadata for exact ' + kind + ' ID,10/page,no native lookup.',
      )
      .addStringOption((o) =>
        o
          .setName('id')
          .setDescription('Exact stored17-20digit ' + kind + ' ID')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-1000,newestfirst').setMinValue(1).setMaxValue(1000),
      ),
  );
for (const sub of ['exportmetadata', 'actioncounts', 'exportunresolved'])
  data.addSubcommand((s) =>
    s.setName(sub).setDescription(
      {
        exportmetadata:
          'Latest100minimal storedcaseID/action/state/timeJSON,total/truncated,no reasons/actor/targetIDs.',
        actioncounts:
          'Storedcase counts by action/state,no identities/reasons/currentnative state claims.',
        exportunresolved:
          'Latest100pending/uncertain caseID/action/state/timeJSON,no recovery/retry/nativeproof.',
      }[sub],
    ),
  );
export default {
  category: 'logging',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions?.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    let text, files;
    if (['exportmetadata', 'actioncounts', 'exportunresolved'].includes(sub)) {
      const report =
        sub === 'actioncounts'
          ? c.cases.caseActionCounts(i.guildId)
          : c.cases.exportCaseMetadata(i.guildId, sub === 'exportunresolved');
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-case-' + sub + '.json',
        }),
      ];
      text = t('caseMinimalMetadata');
    } else if (sub === 'summary') {
      const rows = c.cases.caseSummary(i.guildId);
      text =
        t('caseSummaryHeader') +
        '\n' +
        (rows.map((r) => `${r.status}: ${r.count}`).join('\n') || '0');
    } else if (sub === 'actor' || sub === 'target') {
      const r = c.cases.caseSubject(
        i.guildId,
        sub,
        i.options.getString('id', true),
        i.options.getInteger('page') ?? 1,
      );
      text =
        t('caseSubjectHeader', { page: r.page, pages: r.pages, total: r.total }) +
        '\n' +
        r.rows
          .map((v) => `#${v.id} | ${v.action} | ${v.status} | ${v.actor_id} / ${v.target_id}`)
          .join('\n');
    } else if (sub === 'inspect') {
      const row = c.cases.inspectCase(i.guildId, i.options.getInteger('id', true));
      text =
        t('caseHistoryHeader') +
        '\n' +
        `#${row.id} | ${row.action} | ${row.status}\n${row.actor_id} | ${row.target_id}\n${escapeMarkdown(row.reason.replace(/[\u0000-\u001f\u007f]/gu, ' '))}`;
    } else if (sub === 'list') {
      const r = c.cases.casePage(
        i.guildId,
        i.options.getInteger('page') ?? 1,
        i.options.getString('state') ?? null,
      );
      text =
        t('caseHistoryHeader') +
        '\n' +
        r.rows.map((v) => `#${v.id} | ${v.action} | ${v.status} | ${v.target_id}`).join('\n');
    } else if (sub === 'export') {
      const r = c.cases.exportCases(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(r, null, 2) + '\n', 'utf8'), {
          name: 'emika-case-history.json',
        }),
      ];
      text = t('caseHistoryExported', { count: r.cases.length, total: r.total });
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
