import {
  AttachmentBuilder,
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { readOwnedPoll, endOwnedPoll, pollManager } from '../../services/pollManagement.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('pollmanage')
  .setDescription('Manage bot-created polls; private counts without voter IDs.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const sub of ['results', 'end', 'list'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      sub === 'results'
        ? 'Read current answer counts, which may not be finalized.'
        : sub === 'end'
          ? 'End voting early on one bot-created poll after confirmation.'
          : 'List the latest 20 stored poll receipts, not live voting states.',
    );
    if (sub !== 'list')
      s.addIntegerOption((o) =>
        o
          .setName('id')
          .setDescription('Stored poll ID in this server')
          .setMinValue(1)
          .setRequired(true),
      );
    if (sub === 'end')
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm ending voting early on this poll')
          .setRequired(true),
      );
    return s;
  });
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription('Private stored send-receipt counts by state, not voting counts/active polls.'),
);
data.addSubcommand((s) =>
  s
    .setName('export')
    .setDescription(
      'Private latest 100 stored receipt bindings/timestamps JSON, total/truncated, no actors/voters.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('channelreceipts')
    .setDescription(
      'Private latest 100 stored send receipts for exact channel ID, no native channel/voting lookup.',
    )
    .addStringOption((o) =>
      o
        .setName('channel-id')
        .setDescription('Exact 17-20 digit stored channel ID')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportmetadata')
    .setDescription(
      'Latest 100 minimal stored receipt ID/channel/state/time JSON, total/truncation, no source IDs.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('channelcounts')
    .setDescription(
      'Stored poll send receipt counts by channel ID/state, no voting counts or native lookup.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('inspectreceipt')
    .setDescription(
      'Exact stored receipt ID minimal metadata JSON/null, no native poll/message lookup or voter IDs.',
    )
    .addIntegerOption((o) =>
      o
        .setName('id')
        .setDescription('Exact stored receipt ID')
        .setMinValue(1)
        .setMaxValue(Number.MAX_SAFE_INTEGER)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('channelmetadata')
    .setDescription(
      'Latest 100 minimal stored poll receipt metadata for exact channel ID, no source IDs/voting lookup.',
    )
    .addStringOption((o) =>
      o
        .setName('channel-id')
        .setDescription('Exact 17-20 digit stored channel ID')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('statemetadata')
    .setDescription(
      'Latest 100 minimal stored poll receipt metadata in exact state, no native outcome proof.',
    )
    .addStringOption((o) =>
      o
        .setName('state')
        .setDescription('Stored send receipt state, not voting state')
        .setRequired(true)
        .addChoices(...['sending', 'sent', 'uncertain'].map((value) => ({ name: value, value }))),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportunresolved')
    .setDescription(
      'Latest 100 sending/uncertain minimal poll receipt metadata, no native lookup/retry/repair.',
    ),
);
export default {
  category: 'utility',
  data,
  userPermissions: [P.ManageGuild],
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await pollManager(i);
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    let text, files;
    if (['channelmetadata', 'statemetadata', 'exportunresolved'].includes(sub)) {
      const report = c.polls.scopedMetadata(
        i.guildId,
        { channelmetadata: 'channel', statemetadata: 'state', exportunresolved: 'unresolved' }[sub],
        sub === 'channelmetadata'
          ? i.options.getString('channel-id', true)
          : sub === 'statemetadata'
            ? i.options.getString('state', true)
            : null,
      );
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-poll-' + sub + '.json',
        }),
      ];
      text = t('pollScopedMetadata');
    } else if (['exportmetadata', 'channelcounts', 'inspectreceipt'].includes(sub)) {
      const report =
        sub === 'exportmetadata'
          ? c.polls.exportMetadata(i.guildId)
          : sub === 'channelcounts'
            ? c.polls.channelCounts(i.guildId)
            : c.polls.inspectReceipt(i.guildId, i.options.getInteger('id', true));
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-poll-' + sub + '.json',
        }),
      ];
      text = t('pollMinimalMetadata');
    } else if (sub === 'summary') {
      const rows = c.polls.summary(i.guildId);
      text =
        t('pollReceiptSummary') +
        '\n' +
        (rows.map((r) => `${r.status}: ${r.count}`).join('\n') || '0');
    } else if (sub === 'export' || sub === 'channelreceipts') {
      const r = c.polls.exportReceipts(
        i.guildId,
        sub === 'channelreceipts' ? i.options.getString('channel-id', true) : null,
      );
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(r, null, 2) + '\n', 'utf8'), {
          name: 'emika-poll-send-receipts.json',
        }),
      ];
      text = t('pollReceiptExport', { count: r.receipts.length, total: r.total });
    } else if (sub === 'list') {
      const rows = c.polls.db
        .prepare(
          'SELECT id,channel_id,status FROM native_polls WHERE guild_id=? ORDER BY id DESC LIMIT 20',
        )
        .all(i.guildId);
      text =
        t('pollStoredList') +
        '\n' +
        (rows.map((r) => `#${r.id} | ${r.channel_id} | ${r.status}`).join('\n') || '-');
    } else if (sub === 'end') {
      const id = await endOwnedPoll(
        i,
        c,
        i.options.getInteger('id', true),
        i.options.getBoolean('confirm', true),
      );
      text = t('pollEnded', { id });
    } else if (sub === 'results') {
      const { message } = await readOwnedPoll(i, c, i.options.getInteger('id', true));
      const p = message.poll,
        rows = [...p.answers.values()];
      if (
        rows.length < 2 ||
        rows.length > 10 ||
        typeof p.resultsFinalized !== 'boolean' ||
        rows.some(
          (r) =>
            !Number.isInteger(r.id) ||
            r.id < 1 ||
            typeof r.text !== 'string' ||
            r.text.length > 55 ||
            !Number.isSafeInteger(r.voteCount) ||
            r.voteCount < 0,
        )
      )
        throw new UserError('pollManageInvalid');
      text =
        t('pollResultsHeader', { finalized: t(p.resultsFinalized ? 'enabled' : 'disabled') }) +
        '\n' +
        rows
          .map(
            (r) =>
              `${r.id}. ${escapeMarkdown(r.text.replace(/[\u0000-\u001f\u007f]/gu, ' '))} | ${r.voteCount}`,
          )
          .join('\n');
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
