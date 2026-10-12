import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Opt-in own status,reason disclosed only in this exact channel.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription(
        'Manage Server: unexpired stored status/notice counts, no reasons or user IDs.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('channelcounts')
      .setDescription(
        'Manage Server: private unexpired stored AFK counts perchannelID, no user IDs/reasons.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exportnotices')
      .setDescription(
        'Manage Server: private latest100 notice channel/time JSON,no message/member IDs.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Set status up to7days,clear on your next eligible server message.')
      .addStringOption((o) =>
        o
          .setName('reason')
          .setDescription('Public reason for this channel,no private details')
          .setMinLength(1)
          .setMaxLength(200)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('share')
          .setDescription('Confirm sharing this reason when mentioned in this exact channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reason')
      .setDescription(
        'Edit own existing public reason without extending expiry;confirm exact-channel sharing.',
      )
      .addStringOption((o) =>
        o
          .setName('reason')
          .setDescription('New public reason,1-200characters')
          .setMinLength(1)
          .setMaxLength(200)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('share')
          .setDescription('Confirm disclosure in the existing stored channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('move')
      .setDescription(
        'Move own existing reason sharing to this current channel,without extending expiry.',
      )
      .addBooleanOption((o) =>
        o
          .setName('share')
          .setDescription('Confirm sharing your stored reason in this exact current channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clearall')
      .setDescription(
        'Manage Server:erase all stored guild AFK reasons;no native message deletion.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm erasing all current server AFK states/reasons')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('clear').setDescription('Erase your status and reason here.'))
  .addSubcommand((s) =>
    s.setName('status').setDescription('Privately view your status and disclosure channel.'),
  );
data.addSubcommand((s) =>
  s
    .setName('exportmine')
    .setDescription('Private JSON of only your stored away reason/channel/expiry,no notice IDs.'),
);
for (const sub of ['clearchannel', 'clearuser'])
  data.addSubcommand((s) =>
    s
      .setName(sub)
      .setDescription(
        sub === 'clearchannel'
          ? 'Manage Server:erase stored away reasons shared in one exact channel,no native deletes.'
          : 'Manage Server:erase one exact user away reason/status,no native deletes.',
      )
      .addStringOption((o) =>
        o
          .setName('id')
          .setDescription('Exact stored channel/user ID,deleted/departed resources allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm erasing stored away states/reasons in this scope')
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('exportstatuses')
    .setDescription(
      'ManageServer:latest100unexpired status channel/time/expiryJSON,no reasons/userIDs,total/truncated.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('channelmetadata')
    .setDescription(
      'ManageServer:latest100unexpired statusmetadata forstoredchannelID,no reasons/userIDs/native lookup.',
    )
    .addStringOption((o) =>
      o
        .setName('channel-id')
        .setDescription('ExactstoredchannelID17-20digits')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('agebands')
    .setDescription(
      'ManageServer:unexpired storedstatus agebands fromasOfclock,no userIDs/reasons/currentawayclaim.',
    ),
);
export default {
  category: 'utility',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    let text, files;
    if (
      [
        'clearchannel',
        'clearuser',
        'exportmine',
        'summary',
        'channelcounts',
        'exportnotices',
        'exportstatuses',
        'channelmetadata',
        'agebands',
      ].includes(sub)
    ) {
      const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        i.guild.id !== i.guildId ||
        actor?.id !== i.user.id ||
        actor.guild?.id !== i.guildId ||
        (sub !== 'exportmine' && !actor.permissions?.has(P.ManageGuild))
      )
        throw new UserError('userPermission');
      if (['exportstatuses', 'channelmetadata', 'agebands'].includes(sub)) {
        const report =
          sub === 'agebands'
            ? c.afk.ageBands(i.guildId)
            : c.afk.exportStatusMetadata(
                i.guildId,
                sub === 'channelmetadata' ? i.options.getString('channel-id', true) : null,
              );
        files = [
          new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
            name: 'emika-afk-' + sub + '.json',
          }),
        ];
        text = t('afkStatusMetadata');
      } else if (['summary', 'channelcounts', 'exportnotices'].includes(sub)) {
        const report =
          sub === 'summary'
            ? c.afk.summary(i.guildId)
            : sub === 'channelcounts'
              ? c.afk.channelCounts(i.guildId)
              : c.afk.exportNotices(i.guildId);
        files = [
          new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
            name:
              sub === 'summary'
                ? 'emika-afk-summary.json'
                : sub === 'channelcounts'
                  ? 'emika-afk-channel-counts.json'
                  : 'emika-afk-notices.json',
          }),
        ];
        text = t(sub === 'exportnotices' ? 'afkNoticesExport' : 'afkCountsExport');
      } else if (sub === 'exportmine') {
        const r = c.afk.get(i.guildId, i.user.id),
          report = r
            ? {
                channelId: r.channel_id,
                reason: r.reason,
                createdAt: r.created_at,
                expiresAt: r.created_at + 7 * 86400000,
              }
            : null;
        files = [
          new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
            name: 'emika-own-afk.json',
          }),
        ];
        text = t('afkOwnExported');
      } else {
        if (i.options.getBoolean('confirm', true) !== true) throw new UserError('afkClearConfirm');
        const count =
          sub === 'clearchannel'
            ? c.afk.clearChannel(i.guildId, i.options.getString('id', true))
            : c.afk.clearUser(i.guildId, i.options.getString('id', true));
        text = t('afkScopedCleared', { count });
      }
    } else if (['reason', 'move', 'clearall'].includes(sub)) {
      const authorize = async () => {
        const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
        if (
          i.guild.id !== i.guildId ||
          actor?.id !== i.user.id ||
          actor.guild?.id !== i.guildId ||
          (sub === 'clearall' && !actor.permissions?.has(P.ManageGuild))
        )
          throw new UserError('userPermission');
        return actor;
      };
      let actor = await authorize();
      if (sub === 'clearall') {
        if (i.options.getBoolean('confirm', true) !== true) throw new UserError('afkClearConfirm');
        text = t('afkClearedAll', { count: c.afk.clearAll(i.guildId) });
      } else {
        if (c.config.messageEventsEnabled !== true) throw new UserError('responderRuntimeDisabled');
        if (i.options.getBoolean('share', true) !== true) throw new UserError('afkShareConfirm');
        if (sub === 'move') {
          const channel = await i.guild.channels.fetch(i.channelId, { force: true });
          actor = await authorize();
          if (
            !channel ||
            channel.id !== i.channelId ||
            channel.guildId !== i.guildId ||
            ![
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
            ].includes(channel.type) ||
            !channel.permissionsFor(actor)?.has(P.ViewChannel)
          )
            throw new UserError('afkMoveDenied');
          if (c.config.messageEventsEnabled !== true)
            throw new UserError('responderRuntimeDisabled');
          c.afk.move(i.guildId, i.user.id, i.channelId);
          text = t('afkMoved', { channel: i.channelId });
        } else {
          c.afk.updateReason(i.guildId, i.user.id, i.options.getString('reason', true));
          text = t('afkReasonSaved');
        }
      }
    } else if (sub === 'set') {
      if (c.config.messageEventsEnabled !== true) throw new UserError('responderRuntimeDisabled');
      if (i.options.getBoolean('share', true) !== true) throw new UserError('afkShareConfirm');
      c.afk.set(i.guildId, i.user.id, i.channelId, i.options.getString('reason', true));
      text = t('afkSaved');
    } else if (sub === 'clear') {
      c.afk.clear(i.guildId, i.user.id);
      text = t('afkCleared');
    } else if (sub === 'status') {
      const row = c.afk.get(i.guildId, i.user.id);
      text = row
        ? t('afkOwnStatus', { channel: row.channel_id, reason: row.reason })
        : t('afkEmpty');
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
