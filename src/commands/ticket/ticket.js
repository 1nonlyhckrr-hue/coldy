import {
  AttachmentBuilder,
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import {
  validateTicketConfig,
  requireTicketAccess,
  requireTicketManager,
} from '../../services/tickets.js';
import {
  openTicket,
  publishTicketPanel,
  changeTicketState,
  exportTicketTranscript,
  forgetTicketTranscript,
} from '../../services/ticketDelivery.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Private support tickets with stored transcripts.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription('Set the category and role that can view new tickets.')
      .addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('Ticket category')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      )
      .addRoleOption((o) =>
        o
          .setName('support-role')
          .setDescription('This role will see new ticket contents')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('panel')
      .setDescription('Publish a ticket-open button.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Panel destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('status')
      .setDescription(
        'Privately show your ten latest stored ticket states,no live access or transcript.',
      ),
  )
  .addSubcommand((s) => s.setName('open').setDescription('Open one private support ticket.'))
  .addSubcommand((s) =>
    s.setName('claim').setDescription('Assign the current open ticket to yourself.'),
  )
  .addSubcommand((s) =>
    s
      .setName('unclaim')
      .setDescription('Release your own claim on this open ticket,without changing access.'),
  )
  .addSubcommand((s) =>
    s.setName('close').setDescription('Store transcript and make the owner read-only.'),
  )
  .addSubcommand((s) =>
    s.setName('reopen').setDescription('Restore the ticket owner write access.'),
  )
  .addSubcommand((s) =>
    s.setName('transcript').setDescription('Export current ticket history privately.'),
  )
  .addSubcommand((s) =>
    s
      .setName('retention')
      .setDescription('Manage Server: set stored transcript maximum age 1-30 days.')
      .addIntegerOption((o) =>
        o
          .setName('days')
          .setDescription('Lowering may erase old stored snapshots immediately')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(30),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm new policy and immediate old snapshot deletion')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('forgettranscript')
      .setDescription('Erase stored snapshot for this ticket, not native messages.')
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stored snapshot deletion; exported copies remain')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('queue')
      .setDescription(
        'Manage Server:inspect unresolved stored ticket IDs,not content or live access.',
      )
      .addIntegerOption((o) =>
        o
          .setName('page')
          .setDescription('Page1-10,oldest unresolved first')
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('state')
          .setDescription('One stored unresolved state,not native channel state')
          .addChoices(
            ...['creating', 'open', 'closing', 'reopening', 'uncertain'].map((value) => ({
              name: value,
              value,
            })),
          ),
      )
      .addBooleanOption((o) =>
        o
          .setName('unclaimed')
          .setDescription('Only rows with no stored claimant;no ownership/access change'),
      ),
  )
  .addSubcommand((s) =>
    s.setName('config').setDescription('Show ticket configuration to server managers.'),
  );
for (const sub of ['resetsetup', 'forgetalltranscripts', 'releaseclaims'])
  data.addSubcommand((s) =>
    s
      .setName(sub)
      .setDescription(
        sub === 'resetsetup'
          ? 'Confirmed stop newticket opens/panels by forgettingsetup;existingtickets/nativechannels kept.'
          : sub === 'forgetalltranscripts'
            ? 'Confirmed erase allguild storedtranscripts,no native/exportedmessage deletion.'
            : 'Confirmed release allopen storedclaims,not access/ownership/nativechannels.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stored setup/content/claim change,no native effect')
          .setRequired(true),
      ),
  );
for (const name of ['forgetbyid', 'forgetusertranscripts', 'forgetclosedtranscripts'])
  data.addSubcommand((s) => {
    s.setName(name)
      .setDescription(
        name === 'forgetbyid'
          ? 'Erase one stored ticket snapshot by ID,not native messages or ticket state.'
          : name === 'forgetusertranscripts'
            ? 'Erase all stored snapshots for one owner ID here;no native messages or state changes.'
            : 'Erase snapshots of closed tickets only;open/uncertain snapshots and native history kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm this stored-only private transcript erasure')
          .setRequired(true),
      );
    if (name === 'forgetbyid')
      s.addIntegerOption((o) =>
        o
          .setName('id')
          .setDescription('Exact stored ticket ID in this server')
          .setMinValue(1)
          .setRequired(true),
      );
    if (name === 'forgetusertranscripts')
      s.addStringOption((o) =>
        o
          .setName('owner-id')
          .setDescription('Exact stored ticket owner ID,departed users allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      );
    return s;
  });
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription(
      'ManageServer:private stored ticket states/snapshotcount,no identities/content.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportconfig')
    .setDescription(
      'ManageServer:private stored category/supportrole/retention JSON,no live validation.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportmine')
    .setDescription(
      'Private latest100onlyyour ticket metadata,total/truncated,no staff/source/transcript content.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportrecords')
    .setDescription(
      'Manage Server:latest100 stored ticketmetadataJSON,total/truncation,no owner/staff/sourceIDs.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('transcriptmetadata')
    .setDescription(
      'Manage Server:latest100 snapshot ticketID/count/truncated/time,no messagebody/memberIDs.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('claimsummary')
    .setDescription(
      'Manage Server:stored ticket state/claimed-flag counts only,no staff/ownerIDs.',
    ),
);
export default {
  category: 'ticket',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (key, p) => translate(locale, key, p);
    let content, files;
    if (
      [
        'summary',
        'exportrecords',
        'transcriptmetadata',
        'claimsummary',
        'exportconfig',
        'setup',
        'panel',
        'config',
        'retention',
        'queue',
        'resetsetup',
        'forgetalltranscripts',
        'releaseclaims',
        'forgetbyid',
        'forgetusertranscripts',
        'forgetclosedtranscripts',
      ].includes(sub)
    ) {
      await requireTicketManager(i);
    }
    if (['exportrecords', 'transcriptmetadata', 'claimsummary'].includes(sub)) {
      const report =
        sub === 'exportrecords'
          ? c.tickets.exportRecords(i.guildId)
          : sub === 'transcriptmetadata'
            ? c.tickets.transcriptMetadata(i.guildId)
            : c.tickets.claimSummary(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'exportrecords'
              ? 'luna-ticket-records.json'
              : sub === 'transcriptmetadata'
                ? 'luna-ticket-snapshot-metadata.json'
                : 'luna-ticket-claim-summary.json',
        }),
      ];
      content = t('ticketMetadataExport');
    }
    if (sub === 'summary') {
      const r = c.tickets.summary(i.guildId);
      content =
        t('ticketSummary', { snapshots: r.storedTranscripts }) +
        '\n' +
        (r.states.map((v) => `${v.status}: ${v.count}`).join('\n') || '0');
    }
    if (sub === 'exportconfig' || sub === 'exportmine') {
      if (sub === 'exportmine') {
        const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
        if (i.guild.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
          throw new UserError('ticketAccessDenied');
      }
      const report =
        sub === 'exportconfig'
          ? c.tickets.exportConfig(i.guildId)
          : c.tickets.exportOwn(i.guildId, i.user.id);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: sub === 'exportconfig' ? 'luna-ticket-config.json' : 'luna-own-ticket-records.json',
        }),
      ];
      content = t(sub === 'exportconfig' ? 'ticketConfigExported' : 'ticketOwnExported');
    }
    if (['forgetbyid', 'forgetusertranscripts', 'forgetclosedtranscripts'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('ticketStoredConfirm');
      const count =
        sub === 'forgetbyid'
          ? c.tickets.forgetById(i.guildId, i.options.getInteger('id', true))
          : sub === 'forgetusertranscripts'
            ? c.tickets.forgetUserTranscripts(i.guildId, i.options.getString('owner-id', true))
            : c.tickets.forgetClosedTranscripts(i.guildId);
      content = t('ticketScopedForgotten', { count });
    }
    if (['resetsetup', 'forgetalltranscripts', 'releaseclaims'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('ticketStoredConfirm');
      const method = {
        resetsetup: 'resetSetup',
        forgetalltranscripts: 'forgetAllTranscripts',
        releaseclaims: 'releaseClaims',
      }[sub];
      content = t('ticketBulk_' + sub, { count: c.tickets[method](i.guildId) });
    }
    if (sub === 'setup') {
      const categoryId = i.options.getChannel('category', true).id,
        roleId = i.options.getRole('support-role', true).id;
      await validateTicketConfig(i.guild, categoryId, roleId);
      await requireTicketManager(i);
      c.tickets.configure(i.guildId, categoryId, roleId);
      content = t('ticketSetupSaved');
    }
    if (sub === 'panel') {
      const id = await publishTicketPanel(i, c, i.options.getChannel('channel', true).id);
      content = t('ticketPanelSent', { id });
    }
    if (sub === 'status') {
      if (i.guild?.id !== i.guildId) throw new UserError('ticketAccessDenied');
      const rows = c.tickets.ownRecords(i.guildId, i.user.id);
      content =
        t('ticketOwnStoredHeader') +
        '\n' +
        (rows
          .map((row) =>
            t('ticketOwnStoredRow', {
              id: row.id,
              channel: row.channel_id ?? t('ticketOwnNoChannel'),
              state: t('ticketOwnState_' + row.status),
            }),
          )
          .join('\n') || t('ticketOwnStoredNone'));
    }
    if (sub === 'open') {
      const r = await openTicket(i, c);
      content = t('ticketOpened', { id: r.id, channel: `<#${r.channelId}>` });
    }
    if (sub === 'claim') {
      const ticket = c.tickets.byChannel(i.channelId, i.guildId);
      await requireTicketAccess(i, ticket, { staff: true });
      c.tickets.claim(ticket.id, i.user.id);
      content = t('ticketClaimed', { id: ticket.id });
    }
    if (sub === 'unclaim') {
      const ticket = c.tickets.byChannel(i.channelId, i.guildId);
      await requireTicketAccess(i, ticket, { staff: true });
      c.tickets.unclaim(ticket.id, i.guildId, i.user.id);
      content = t('ticketUnclaimed', { id: ticket.id });
    }
    if (['close', 'reopen'].includes(sub)) {
      const id = await changeTicketState(i, c, sub === 'close');
      content = t(sub === 'close' ? 'ticketClosed' : 'ticketReopened', { id });
    }
    if (sub === 'transcript') {
      const result = await exportTicketTranscript(i, c);
      files = [result.file];
      content = t('ticketTranscriptExport', {
        count: result.count,
        status: t(result.truncated ? 'ticketPartial' : 'ticketComplete'),
      });
    }
    if (sub === 'retention') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('ticketRetentionConfirm');
      const days = i.options.getInteger('days', true),
        count = c.tickets.setRetention(i.guildId, days);
      content = t('ticketRetentionSaved', { days, count });
    }
    if (sub === 'forgettranscript') {
      const r = await forgetTicketTranscript(i, c, {
        confirm: i.options.getBoolean('confirm', true),
      });
      content = t('ticketTranscriptForgotten', { id: r.id, count: r.count });
    }
    if (sub === 'queue') {
      const page = i.options.getInteger('page') ?? 1,
        state = i.options.getString('state'),
        unclaimed = i.options.getBoolean('unclaimed') ?? false,
        rows = c.tickets.queue(i.guildId, page, { state, unclaimed });
      content =
        t('ticketQueueHeader', { page }) +
        '\n' +
        t('ticketQueueFilters', {
          state: state === null ? t('ticketQueueAllStates') : t('ticketOwnState_' + state),
          unclaimed: t(unclaimed ? 'enabled' : 'disabled'),
        }) +
        '\n' +
        (rows
          .map((r) =>
            t('ticketQueueRow', {
              id: r.id,
              channel: r.channel_id ?? '-',
              state: t('ticketOwnState_' + r.status),
              claim: r.claimed_by ?? '-',
            }),
          )
          .join('\n') || t('ticketQueueEmpty'));
    }
    if (sub === 'config') {
      const s = c.tickets.config(i.guildId);
      content = s
        ? t('ticketConfig', { category: s.category_id, role: s.support_role_id })
        : t('ticketSetupRequired');
      content += ' ' + t('ticketRetentionStatus', { days: c.tickets.retention(i.guildId) });
    }
    await i.editReply(
      lunaPayload(
        { content, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
