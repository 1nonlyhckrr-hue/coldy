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
      .setName('list')
      .setDescription('List recent schedule records.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
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
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (!actor.permissions.has(P.ManageGuild)) throw new UserError('userPermission');
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (key, p) => translate(locale, key, p);
    let content;
    if (sub === 'create') {
      const channelId = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, channelId);
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
    if (sub === 'list') {
      const rows = c.messageSchedules.list(i.guildId),
        pages = Math.max(1, Math.ceil(rows.length / 10)),
        page = i.options.getInteger('page') ?? 1;
      if (page > pages) throw new UserError('responderPageInvalid', { pages });
      content =
        t('automationList', { page, pages }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map((r) => `#${r.id} | ${r.status} | <t:${Math.floor(r.due_at / 1000)}:f>`)
          .join('\n') || t('automationEmpty'));
    }
    if (sub === 'config') content = t('automationConfig');
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
