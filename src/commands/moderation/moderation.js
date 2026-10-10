import { previewPurge, confirmPurge } from '../../services/purge.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { moderate } from '../../services/moderation.js';
const actions = ['warn', 'warnings', 'clearwarns', 'timeout', 'untimeout', 'kick', 'ban', 'unban'];
const data = new SlashCommandBuilder()
  .setName('moderation')
  .setDescription('Moderation with current permissions, hierarchy and case tracking.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers,
  );
for (const action of actions)
  data.addSubcommand((s) => {
    s.setName(action).setDescription(`${action}: one member, checked and recorded.`);
    if (action === 'unban')
      s.addStringOption((o) =>
        o
          .setName('user-id')
          .setDescription('Banned Discord user ID')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20),
      );
    else
      s.addUserOption((o) => o.setName('member').setDescription('Target member').setRequired(true));
    if (action === 'timeout')
      s.addStringOption((o) =>
        o
          .setName('duration')
          .setDescription('1s to 28d, e.g. 30m or 1h')
          .setRequired(true)
          .setMaxLength(12),
      );
    if (action !== 'warnings')
      s.addStringOption((o) =>
        o.setName('reason').setDescription('Reason recorded in the case').setMaxLength(400),
      );
    return s;
  });
data.addSubcommand((s) =>
  s
    .setName('purgepreview')
    .setDescription('Preview exact IDs among up to 10 recent messages, no deletion.')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Text channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('count')
        .setDescription('Recent messages to inspect, skip pinned/system/older than13 days')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('purgeconfirm')
    .setDescription('Delete only your exact previewed IDs, expires in2 minutes.')
    .addIntegerOption((o) =>
      o.setName('plan-id').setDescription('Preview plan ID').setMinValue(1).setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm permanent deletion of the displayed exact IDs')
        .setRequired(true),
    ),
);
export default {
  category: 'moderation',
  data,
  cooldownMs: 5000,
  async execute(i, context) {
    const locale = context.localization?.locale(i.guildId) ?? 'en',
      t = (key, params) => translate(locale, key, params);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const action = i.options.getSubcommand();
    if (action === 'purgepreview' || action === 'purgeconfirm') {
      let content;
      if (action === 'purgepreview') {
        const r = await previewPurge(i, context, {
          channelId: i.options.getChannel('channel', true).id,
          count: i.options.getInteger('count', true),
        });
        content = t('purgePreview', {
          id: r.id,
          channel: r.channelId,
          count: r.ids.length,
          ids: r.ids.join(', '),
        });
      } else {
        const r = await confirmPurge(i, context, {
          id: i.options.getInteger('plan-id', true),
          confirm: i.options.getBoolean('confirm', true),
        });
        content = t('purgeComplete', { id: r.caseId, count: r.count });
      }
      await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
      return;
    }
    const result = await moderate(i, context, {
      action,
      targetId:
        action === 'unban'
          ? i.options.getString('user-id', true)
          : i.options.getUser('member', true).id,
      reason: action === 'warnings' ? undefined : i.options.getString('reason'),
      duration: action === 'timeout' ? i.options.getString('duration', true) : undefined,
    });
    if (result.id && context.serverLogs) {
      const delivered = await context.serverLogs.emit(i.guild, {
        kind: 'moderation',
        action,
        caseId: result.id,
        actorId: i.user.id,
        targetId:
          action === 'unban'
            ? i.options.getString('user-id', true)
            : i.options.getUser('member', true).id,
      });
      if (delivered.reason === 'unavailable') result.logUnavailable = true;
    }
    let content = result.warnings
      ? result.warnings.length
        ? result.warnings
            .map((w) => `#${w.id}: ${w.reason}`)
            .join('\n')
            .slice(0, 1900)
        : t('modNoWarnings')
      : t('modComplete', { action, id: result.id });
    if (result.count !== undefined) content += ' ' + t('modCleared', { count: result.count });
    if (result.logUnavailable) content += ' ' + t('modLogUnavailable');
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
