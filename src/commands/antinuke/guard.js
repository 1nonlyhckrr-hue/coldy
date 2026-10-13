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
  .addSubcommand((s) =>
    s
      .setName('permalert')
      .setDescription('Act when an untrusted user gives a role dangerous permissions.')
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('off, alert only, or remove the added permissions and alert')
          .setRequired(true)
          .addChoices(
            { name: 'off', value: 'off' },
            { name: 'alert', value: 'alert' },
            { name: 'strip', value: 'strip' },
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('botadd')
      .setDescription('Act when an untrusted user adds a bot. Trusted users may add any bot.')
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('off, alert only, or kick the new bot and alert')
          .addChoices(
            { name: 'off', value: 'off' },
            { name: 'alert', value: 'alert' },
            { name: 'kick', value: 'kick' },
          ),
      )
      .addUserOption((o) => o.setName('bot').setDescription('A bot to allow or stop allowing'))
      .addBooleanOption((o) =>
        o.setName('allowed').setDescription('true = never act on this bot, false = remove it'),
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
    if (sub === 'permalert')
      c.guard.patch(i.guildId, { permAlert: { mode: i.options.getString('mode', true) } });
    if (sub === 'botadd') {
      const mode = i.options.getString('mode'),
        bot = i.options.getUser('bot'),
        allowed = i.options.getBoolean('allowed');
      if (bot && !bot.bot) throw new UserError('guardNotBot');
      if (bot && allowed === null) throw new UserError('guardAllowedMissing');
      const cur = c.guard.get(i.guildId).botAdd.allow;
      const allow = bot
        ? allowed
          ? [...new Set([...cur, bot.id])].slice(0, 25)
          : cur.filter((x) => x !== bot.id)
        : cur;
      c.guard.patch(i.guildId, { botAdd: { ...(mode ? { mode } : {}), allow } });
    }
    const cfg = c.guard.get(i.guildId),
      ch = c.antinuke.get(i.guildId).channelId;
    await i.editReply(
      lunaPayload(
        {
          content: t('guardConfig', {
            channel: ch ? `<#${ch}>` : t('guardNoChannel'),
            webhook: cfg.webhook.mode,
            botadd: cfg.botAdd.mode,
            allowed: cfg.botAdd.allow.map((x) => `<@${x}>`).join(' ') || '-',
            permalert: cfg.permAlert.mode,
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
