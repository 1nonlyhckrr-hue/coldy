import { SlashCommandBuilder, InteractionContextType, ChannelType, MessageFlags } from 'discord.js';
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
      ),
  )
  .addSubcommand((s) =>
    s.setName('config').setDescription('Show ticket configuration to server managers.'),
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
    if (['setup', 'panel', 'config', 'retention', 'queue'].includes(sub)) {
      await requireTicketManager(i);
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
        rows = c.tickets.queue(i.guildId, page);
      content =
        t('ticketQueueHeader', { page }) +
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
