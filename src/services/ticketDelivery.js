import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { UserError } from '../utils/errors.js';
import { validateOutputChannel } from './guildConfig.js';
import {
  validateTicketConfig,
  ticketOverwrites,
  requireTicketAccess,
  verifyTicketPrivacy,
  requireTicketBot,
  requireTicketManager,
} from './tickets.js';
import { collectTicketTranscript } from './ticketTranscripts.js';
export async function openTicket(i, c) {
  const config = c.tickets.config(i.guildId);
  if (!config) throw new UserError('ticketSetupRequired');
  const member = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (i.guild?.id !== i.guildId || member?.id !== i.user.id || member.guild?.id !== i.guildId)
    throw new UserError('ticketAccessDenied');
  if (member.user.bot) throw new UserError('ticketBotOwner');
  const { bot } = await validateTicketConfig(i.guild, config.category_id, config.support_role_id);
  const current = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (current?.id !== i.user.id || current.guild?.id !== i.guildId)
    throw new UserError('ticketAccessDenied');
  if (current.user?.bot) throw new UserError('ticketBotOwner');
  const latest = c.tickets.config(i.guildId);
  if (
    !latest ||
    latest.category_id !== config.category_id ||
    latest.support_role_id !== config.support_role_id
  )
    throw new UserError('ticketSetupRequired');
  const id = c.tickets.reserve(i.guildId, i.user.id, config.support_role_id, i.id);
  let channel;
  try {
    channel = await i.guild.channels.create({
      name: `ticket-${id}`,
      type: ChannelType.GuildText,
      parent: config.category_id,
      topic: `Emika ticket ${id}`,
      permissionOverwrites: ticketOverwrites(i.guildId, bot.id, i.user.id, config.support_role_id),
      reason: 'Emika private support ticket',
    });
  } catch {
    c.tickets.uncertain(id, 'creating');
    throw new UserError('ticketCreateUncertain', { id });
  }
  try {
    const record = { ...c.tickets.get(id, i.guildId), channel_id: channel.id };
    requireTicketBot(i.guild, bot);
    await verifyTicketPrivacy(channel, record, bot.id);
    c.tickets.activate(id, channel.id);
  } catch {
    c.tickets.uncertain(id, 'creating');
    throw new UserError('ticketPrivacyUncertain', { id });
  }
  return { id, channelId: channel.id };
}
export async function publishTicketPanel(i, c, channelId) {
  await requireTicketManager(i);
  if (!c.tickets.config(i.guildId)) throw new UserError('ticketSetupRequired');
  const channel = await validateOutputChannel(i.guild, channelId),
    locale = c.guildConfig.get(i.guildId).language;
  await requireTicketManager(i);
  if (!c.tickets.config(i.guildId)) throw new UserError('ticketSetupRequired');
  const id = c.tickets.reservePanel(i.guildId, channelId, i.id),
    button = new ButtonBuilder()
      .setCustomId(`luna:ticket:${id}`)
      .setLabel(translate(locale, 'ticketOpenButton'))
      .setStyle(ButtonStyle.Primary);
  try {
    const message = await channel.send(
      lunaPayload(
        {
          content: translate(locale, 'ticketPanelPrompt'),
          components: [new ActionRowBuilder().addComponents(button)],
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
    c.tickets.panelSent(id, message?.id);
  } catch {
    c.tickets.panelUncertain(id);
    throw new UserError('ticketPanelUncertain', { id });
  }
  return id;
}
async function recheckTicketSnapshot(i, c, ticket, { staff = false } = {}) {
  const latest = c.tickets.get(ticket.id, i.guildId);
  if (
    !latest ||
    ['status', 'channel_id', 'owner_id', 'support_role_id'].some(
      (key) => latest[key] !== ticket[key],
    )
  )
    throw new UserError('ticketStateInvalid');
  await requireTicketAccess(i, latest, { staff });
  const [channel, bot] = await Promise.all([
    i.guild.channels.fetch(ticket.channel_id, { force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  requireTicketBot(i.guild, bot);
  await verifyTicketPrivacy(channel, latest, bot.id);
  await requireTicketAccess(i, latest, { staff });
  const final = c.tickets.get(ticket.id, i.guildId);
  if (
    !final ||
    ['status', 'channel_id', 'owner_id', 'support_role_id'].some(
      (key) => final[key] !== ticket[key],
    )
  )
    throw new UserError('ticketStateInvalid');
  return { channel, bot };
}
export async function changeTicketState(i, c, close) {
  const ticket = c.tickets.byChannel(i.channelId, i.guildId);
  await requireTicketAccess(i, ticket, { staff: !close });
  if (ticket.status !== (close ? 'open' : 'closed')) throw new UserError('ticketStateInvalid');
  let { channel, bot } = await recheckTicketSnapshot(i, c, ticket, { staff: !close });
  if (close) {
    const transcript = await collectTicketTranscript(channel);
    ({ channel, bot } = await recheckTicketSnapshot(i, c, ticket, { staff: !close }));
    c.tickets.saveTranscript(ticket.id, transcript);
  } else {
    ({ channel, bot } = await recheckTicketSnapshot(i, c, ticket, { staff: true }));
  }
  // Reserve before overwrites; a timeout or storage fault blocks automatic repeats.
  c.tickets.transition(ticket.id, ticket.status, close ? 'closing' : 'reopening');
  try {
    await channel.permissionOverwrites.set(
      ticketOverwrites(i.guildId, bot.id, ticket.owner_id, ticket.support_role_id, close),
      'Emika ticket access change',
    );
    requireTicketBot(i.guild, bot);
    await verifyTicketPrivacy(channel, { ...ticket, status: close ? 'closed' : 'open' }, bot.id);
    c.tickets.transition(ticket.id, close ? 'closing' : 'reopening', close ? 'closed' : 'open');
  } catch {
    c.tickets.uncertain(ticket.id, close ? 'closing' : 'reopening');
    throw new UserError('ticketStateUncertain', { id: ticket.id });
  }
  return ticket.id;
}
export async function exportTicketTranscript(i, c) {
  const ticket = c.tickets.byChannel(i.channelId, i.guildId);
  await requireTicketAccess(i, ticket);
  if (!['open', 'closed'].includes(ticket.status)) throw new UserError('ticketStateInvalid');
  const { channel } = await recheckTicketSnapshot(i, c, ticket);
  let transcript;
  if (ticket.status === 'closed') {
    transcript = c.tickets.transcript(ticket.id);
    if (!transcript) throw new UserError('ticketTranscriptMissing');
  } else {
    transcript = await collectTicketTranscript(channel);
    await recheckTicketSnapshot(i, c, ticket);
    c.tickets.saveTranscript(ticket.id, transcript);
  }
  await recheckTicketSnapshot(i, c, ticket);
  return {
    file: new AttachmentBuilder(Buffer.from(transcript.body, 'utf8'), {
      name: `emika-ticket-${ticket.id}.txt`,
    }),
    count: transcript.count ?? transcript.message_count,
    truncated: !!transcript.truncated,
  };
}
export function createTicketButtonHandler(c) {
  return async (i) => {
    if (!i.isButton() || !i.customId.startsWith('luna:ticket:')) return false;
    try {
      if (!i.inGuild()) throw new UserError('guildOnly');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const raw = i.customId.slice(12);
      if (!/^\d+$/.test(raw)) throw new UserError('ticketPanelInvalid');
      const p = c.tickets.panel(Number(raw), i.guildId);
      if (
        !p ||
        p.status !== 'active' ||
        p.message_id !== i.message.id ||
        p.channel_id !== i.channelId
      )
        throw new UserError('ticketPanelInvalid');
      const r = await openTicket(i, c),
        locale = c.guildConfig.get(i.guildId).language;
      await i.editReply(
        lunaPayload(
          {
            content: translate(locale, 'ticketOpened', { id: r.id, channel: `<#${r.channelId}>` }),
            allowedMentions: { parse: [] },
          },
          { locale },
        ),
      );
    } catch (e) {
      await c.handleInteractionError(e, i, c.logger);
    }
    return true;
  };
}

export async function forgetTicketTranscript(i, c, { confirm }) {
  if (confirm !== true) throw new UserError('ticketForgetConfirm');
  const ticket = c.tickets.byChannel(i.channelId, i.guildId);
  await requireTicketAccess(i, ticket);
  await recheckTicketSnapshot(i, c, ticket);
  const count = c.tickets.forgetTranscript(ticket.id, i.guildId);
  return { id: ticket.id, count };
}
