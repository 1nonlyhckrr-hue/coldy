import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import {
  panelPayload,
  setupUnverified,
  validateVerifiedRole,
} from '../../services/verification.js';
const data = new SlashCommandBuilder()
  .setName('verification')
  .setDescription(
    'New-member verification: unverified members only see the verify channel (default off).',
  )
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription(
        'Turn on verification, hide other channels from new members and post the panel.',
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel for the verify button')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addRoleOption((o) => o.setName('role').setDescription('Role given when verified (optional)'))
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('challenge = pick the right picture (default), button = one click')
          .addChoices(
            { name: 'challenge', value: 'challenge' },
            { name: 'button', value: 'button' },
          ),
      )
      .addBooleanOption((o) =>
        o.setName('kick-on-fail').setDescription('Kick after too many wrong answers (default no)'),
      )
      .addIntegerOption((o) =>
        o
          .setName('attempts')
          .setDescription('Wrong answers allowed, 1-10 (default 3)')
          .setMinValue(1)
          .setMaxValue(10),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disable')
      .setDescription('Turn verification off (roles and channel hiding are kept).'),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show the current settings.'));
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'verification');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'setup') {
      if (c.config.memberEventsEnabled !== true) throw new UserError('verifyRuntimeDisabled');
      const bot = await i.guild.members.fetchMe({ force: true });
      if (!bot.permissions?.has([P.ManageRoles, P.ManageChannels]))
        throw new UserError('botPermission');
      const channel = await i.guild.channels.fetch(i.options.getChannel('channel', true).id, {
        force: true,
      });
      if (channel?.type !== ChannelType.GuildText) throw new UserError('channelTypeInvalid');
      const chosen = i.options.getRole('role');
      if (chosen)
        validateVerifiedRole(await i.guild.roles.fetch(chosen.id, { force: true }), bot, i.guild);
      const current = c.verification.get(i.guildId);
      const { role, hidden, failed } = await setupUnverified(i.guild, current, channel);
      const kick = i.options.getBoolean('kick-on-fail');
      const mode = i.options.getString('mode');
      const attempts = i.options.getInteger('attempts');
      c.verification.patch(i.guildId, {
        enabled: true,
        channelId: channel.id,
        unverifiedRoleId: role.id,
        ...(chosen ? { roleId: chosen.id } : {}),
        ...(mode ? { mode } : {}),
        ...(kick !== null ? { kickOnFail: kick } : {}),
        ...(attempts ? { maxAttempts: attempts } : {}),
      });
      await channel.send(panelPayload(c, i.guildId));
      text = t('verifySetupDone', { channel: channel.id, hidden, failed });
    } else if (sub === 'disable') {
      c.verification.patch(i.guildId, { enabled: false });
      text = t('verifyDisabled');
    } else {
      const cfg = c.verification.get(i.guildId);
      text = t('verifyConfig', {
        status: t(cfg.enabled ? 'enabled' : 'disabled'),
        channel: cfg.channelId ? `<#${cfg.channelId}>` : '-',
        role: cfg.roleId ? `<@&${cfg.roleId}>` : '-',
        unverified: cfg.unverifiedRoleId ? `<@&${cfg.unverifiedRoleId}>` : '-',
        mode: cfg.mode,
        kick: t(cfg.kickOnFail ? 'enabled' : 'disabled'),
        attempts: cfg.maxAttempts,
      });
    }
    await i.editReply(
      lunaPayload(
        { content: text, allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
