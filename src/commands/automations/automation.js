import { resolveZonedTime } from '../../services/zonedTime.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { parseScheduledTime } from '../../services/automations.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('automation')
  .setDescription('Persistent scheduled messages.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Schedule one message or a fixed elapsed-time repeat.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Message text; all mentions disabled')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1800),
      )
      .addStringOption((o) =>
        o
          .setName('at')
          .setDescription('ISO time with offset: 2026-10-12T09:00:00+05:30')
          .setRequired(true)
          .setMaxLength(25),
      )
      .addIntegerOption((o) =>
        o
          .setName('repeat-minutes')
          .setDescription('Optional fixed interval, 10 minutes to 30 days')
          .setMinValue(10)
          .setMaxValue(43200),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('createzone')
      .setDescription('Schedule one message using explicit local date/time and named timezone.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Message text; all mentions disabled')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1800),
      )
      .addStringOption((o) =>
        o
          .setName('local')
          .setDescription('Exact local time YYYY-MM-DDTHH:mm:ss; ambiguous/gap times rejected')
          .setRequired(true)
          .setMinLength(19)
          .setMaxLength(19),
      )
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('Named zone e.g. Asia/Kolkata, America/New_York or UTC')
          .setRequired(true)
          .setMaxLength(80),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('cancel')
      .setDescription('Cancel a pending or uncertain schedule.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Schedule ID').setMinValue(1).setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('cancelpending')
      .setDescription(
        'Confirm cancellation of all pending guild schedules;in-flight/uncertain untouched.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm all pending future sends cancelled')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reschedule')
      .setDescription(
        'Move pending next send to explicit offset time;repeat stays elapsed interval.',
      )
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Pending schedule ID').setMinValue(1).setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('at')
          .setDescription('ISO time with offset,one minute to365days ahead')
          .setMaxLength(25)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('edit')
      .setDescription('Replace text of a pending schedule only;time/destination unchanged.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Pending schedule ID').setMinValue(1).setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Replacement message,mentions disabled')
          .setMinLength(1)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('repeat')
      .setDescription('Change pending elapsed repeat;omit minutes to make next send one-time.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Pending schedule ID').setMinValue(1).setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm changing future repeats').setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('minutes')
          .setDescription('10-43200;omit to stop repeating after next send')
          .setMinValue(10)
          .setMaxValue(43200),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('inspect')
      .setDescription('Privately review one stored schedule,text and metadata;no native effects.')
      .addIntegerOption((o) =>
        o
          .setName('id')
          .setDescription('Schedule ID in this server')
          .setMinValue(1)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reschedulezone')
      .setDescription('Move one pending schedule using explicit local time and named timezone.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Schedule ID').setMinValue(1).setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('local')
          .setDescription('YYYY-MM-DDTHH:mm:ss;ambiguous/gap times rejected')
          .setMinLength(19)
          .setMaxLength(19)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('Named timezone such as Asia/Kolkata or UTC')
          .setMinLength(1)
          .setMaxLength(80)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('destination')
      .setDescription('Move one pending message schedule to a validated channel;does not send now.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Schedule ID').setMinValue(1).setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('New destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('forget')
      .setDescription('Erase stored text of a completed/cancelled schedule,not Discord messages.')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Schedule ID').setMinValue(1).setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Erase stored text only').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('List recent schedule records.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('upcoming')
      .setDescription('Privately inspect pending sends ordered by time;no content or sending.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Pending queue page1-3').setMinValue(1).setMaxValue(3),
      )
      .addBooleanOption((o) =>
        o
          .setName('recurring')
          .setDescription('True:repeat schedules only;false:one-time only;unset:all pending'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('overview')
      .setDescription(
        'Privately count stored schedule states;not delivery receipts or live readiness.',
      ),
  )
  .addSubcommand((s) =>
    s.setName('config').setDescription('Show schedule limits and restart policy.'),
  );
export default {
  category: 'automations',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const authorize = async () => {
      const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        actor?.id !== i.user.id ||
        actor.guild?.id !== i.guildId ||
        i.guild.id !== i.guildId ||
        !actor.permissions?.has(P.ManageGuild)
      )
        throw new UserError('userPermission');
    };
    await authorize();
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (key, p) => translate(locale, key, p);
    let content;
    if (sub === 'create') {
      const channelId = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, channelId);
      await authorize();
      const repeat = i.options.getInteger('repeat-minutes'),
        id = c.messageSchedules.create({
          guildId: i.guildId,
          channelId,
          body: i.options.getString('text', true),
          dueAt: parseScheduledTime(i.options.getString('at', true)),
          ...(repeat ? { repeatMs: repeat * 60000 } : {}),
          interactionId: i.id,
        });
      content = t('automationCreated', { id });
    }
    if (sub === 'createzone') {
      const channelId = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, channelId);
      await authorize();
      const resolved = resolveZonedTime(
        i.options.getString('local', true),
        i.options.getString('timezone', true),
      );
      const id = c.messageSchedules.create({
        guildId: i.guildId,
        channelId,
        body: i.options.getString('text', true),
        dueAt: resolved.dueAt,
        interactionId: i.id,
      });
      content = t('automationZoneCreated', { id, zone: resolved.zone, iso: resolved.iso });
    }
    if (sub === 'cancel') {
      const id = i.options.getInteger('id', true);
      c.messageSchedules.cancel(id, i.guildId);
      content = t('automationCancelled', { id });
    }
    if (sub === 'cancelpending') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automationCancelPendingConfirm');
      content = t('automationPendingCancelled', { n: c.messageSchedules.cancelPending(i.guildId) });
    }
    if (sub === 'reschedule') {
      const dueAt = parseScheduledTime(i.options.getString('at', true));
      c.messageSchedules.reschedulePending(i.options.getInteger('id', true), i.guildId, dueAt);
      content = t('automationRescheduled', { iso: new Date(dueAt).toISOString() });
    }
    if (sub === 'reschedulezone') {
      const resolved = resolveZonedTime(
        i.options.getString('local', true),
        i.options.getString('timezone', true),
      );
      c.messageSchedules.reschedulePending(
        i.options.getInteger('id', true),
        i.guildId,
        resolved.dueAt,
      );
      content = t('automationZoneRescheduled', { zone: resolved.zone, iso: resolved.iso });
    }
    if (sub === 'destination') {
      const snapshot = c.messageSchedules.get(i.options.getInteger('id', true), i.guildId);
      if (snapshot?.status !== 'pending') throw new UserError('automationEditInvalid');
      const channelId = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, channelId);
      await authorize();
      c.messageSchedules.destinationPending(snapshot, channelId);
      content = t('automationDestinationSaved', { channel: channelId });
    }
    if (sub === 'edit') {
      c.messageSchedules.editPending(
        i.options.getInteger('id', true),
        i.guildId,
        i.options.getString('text', true),
      );
      content = t('automationEdited');
    }
    if (sub === 'repeat') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automationRepeatConfirm');
      const minutes = i.options.getInteger('minutes');
      c.messageSchedules.repeatPending(
        i.options.getInteger('id', true),
        i.guildId,
        minutes === null ? null : minutes * 60000,
      );
      content = t('automationRepeatSaved');
    }
    if (sub === 'inspect') {
      const row = c.messageSchedules.get(i.options.getInteger('id', true), i.guildId);
      if (!row) throw new UserError('automationInspectMissing');
      content = t('automationInspected', {
        id: row.id,
        status: row.status,
        channel: row.channel_id,
        iso: new Date(row.due_at).toISOString(),
        repeat:
          row.repeat_ms === null
            ? t('automationNoRepeat')
            : t('automationElapsedRepeat', { minutes: row.repeat_ms / 60000 }),
        body: row.body,
      });
    }
    if (sub === 'forget') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automationForgetConfirm');
      const id = i.options.getInteger('id', true);
      c.messageSchedules.forget(id, i.guildId);
      content = t('automationForgot', { id });
    }
    if (sub === 'list') {
      const rows = c.messageSchedules.list(i.guildId),
        pages = Math.max(1, Math.ceil(rows.length / 10)),
        page = i.options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > pages)
        throw new UserError('responderPageInvalid', { pages });
      content =
        t('automationList', { page, pages }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map((r) => `#${r.id} | ${r.status} | <t:${Math.floor(r.due_at / 1000)}:f>`)
          .join('\n') || t('automationEmpty'));
    }
    if (sub === 'upcoming') {
      const page = i.options.getInteger('page') ?? 1,
        rows = c.messageSchedules.upcoming(i.guildId, page, {
          recurring: i.options.getBoolean?.('recurring') ?? null,
        });
      content =
        t('automationUpcoming', { page }) +
        '\n' +
        (rows
          .map(
            (r) =>
              `#${r.id} | ${r.channel_id} | <t:${Math.floor(r.due_at / 1000)}:f> | ${r.repeat_ms === null ? t('automationNoRepeat') : t('automationElapsedRepeat', { minutes: r.repeat_ms / 60000 })}`,
          )
          .join('\n') || t('automationEmpty'));
    }
    if (sub === 'overview') {
      const rows = c.messageSchedules.overview(i.guildId);
      content =
        t('automationOverview') +
        '\n' +
        (rows
          .map(
            (r) =>
              `${t('automationState_' + r.status)}: ${r.count}${r.next_due === null ? '' : ` | <t:${Math.floor(r.next_due / 1000)}:f>`}`,
          )
          .join('\n') || t('automationEmpty'));
    }
    if (sub === 'config') content = t('automationConfig');
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
