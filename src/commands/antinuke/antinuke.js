import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Opt-in audit burst alerts; no automatic punishment or rollback.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('enable')
      .setDescription('Enable alert-only detection for supported audit actions.')
      .addChannelOption((o) =>
        o.setName('channel').setDescription('Moderator alert channel').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('disable').setDescription('Stop alert-only audit monitoring.'))
  .addSubcommand((s) =>
    s
      .setName('threshold')
      .setDescription('Set mixed-action count and observation window.')
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('2-20 actions')
          .setMinValue(2)
          .setMaxValue(20)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('10-300 seconds')
          .setMinValue(10)
          .setMaxValue(300)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('trust')
      .setDescription('Exempt a current member from audit alerts only.')
      .addUserOption((o) =>
        o.setName('member').setDescription('Current server member').setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('trusted').setDescription('Alert exemption').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show alert settings and limitations.'))
  .addSubcommand((s) =>
    s.setName('incidents').setDescription('Show20 recent stored audit burst alerts.'),
  );
export default {
  category: 'antinuke',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (!actor.permissions.has(P.ManageGuild)) throw new UserError('userPermission');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      locale = c.localization.locale(i.guildId),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'enable') {
      if (!c.config.auditEventsEnabled) throw new UserError('antinukeRuntimeDisabled');
      const bot = await i.guild.members.fetchMe({ force: true });
      if (!bot.permissions.has(P.ViewAuditLog)) throw new UserError('antinukeBotPermission');
      const channel = await validateOutputChannel(
        i.guild,
        i.options.getChannel('channel', true).id,
      );
      c.antinuke.patch(i.guildId, { enabled: true, channelId: channel.id });
      text = t('antinukeEnabled');
    } else if (sub === 'disable') {
      c.antinuke.patch(i.guildId, { enabled: false });
      text = t('antinukeDisabled');
    } else if (sub === 'threshold') {
      c.antinuke.patch(i.guildId, {
        threshold: i.options.getInteger('count', true),
        windowSeconds: i.options.getInteger('seconds', true),
      });
      text = t('antinukeSaved');
    } else if (sub === 'trust') {
      const selected = i.options.getUser('member', true),
        trusted = i.options.getBoolean('trusted', true);
      if (trusted) {
        const member = await i.guild.members.fetch({ user: selected.id, force: true });
        if (!member || member.id !== selected.id) throw new UserError('antinukeUserInvalid');
      }
      c.antinuke.trust(i.guildId, selected.id, trusted);
      text = t('antinukeSaved');
    } else if (sub === 'config') {
      const cfg = c.antinuke.get(i.guildId);
      text = t('antinukeConfig', {
        status: t(cfg.enabled ? 'enabled' : 'disabled'),
        count: cfg.threshold,
        window: cfg.windowSeconds,
        channel: cfg.channelId ?? '-',
        trusted: cfg.trustedUsers.join(', ') || '-',
      });
    } else if (sub === 'incidents') {
      const rows = c.antinuke.incidents(i.guildId);
      text =
        t('antinukeIncidents') +
        '\n' +
        (rows.map((r) => `#${r.id} | ${r.actor_id} | ${r.event_count} | ${r.status}`).join('\n') ||
          t('antinukeEmpty'));
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
