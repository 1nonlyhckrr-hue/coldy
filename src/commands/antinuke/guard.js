import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
const data = new SlashCommandBuilder()
  .setName('guard')
  .setDescription('Opt-in server guards that watch the audit log (all off by default).')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('webhook')
      .setDescription('Act when an untrusted user creates a webhook.')
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('off, alert only, or delete the webhook and alert')
          .setRequired(true)
          .addChoices(
            { name: 'off', value: 'off' },
            { name: 'alert', value: 'alert' },
            { name: 'delete', value: 'delete' },
          ),
      ),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show all guard settings.'));
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'guard');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    if (sub !== 'config' && c.config.auditEventsEnabled !== true)
      throw new UserError('guardRuntimeDisabled');
    if (sub === 'webhook')
      c.guard.patch(i.guildId, { webhook: { mode: i.options.getString('mode', true) } });
    const cfg = c.guard.get(i.guildId),
      ch = c.antinuke.get(i.guildId).channelId;
    await i.editReply(
      lunaPayload(
        {
          content: t('guardConfig', {
            channel: ch ? `<#${ch}>` : t('guardNoChannel'),
            webhook: cfg.webhook.mode,
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
