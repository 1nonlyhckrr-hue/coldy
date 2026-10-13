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
  .addSubcommand((s) =>
    s
      .setName('vanity')
      .setDescription('Alert when an untrusted user changes the server vanity URL.')
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Turn the vanity alert on or off').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('prune')
      .setDescription('Alert on member prunes and bursts of kicks/bans by untrusted users.')
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Turn prune and burst alerts on or off')
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('Removals that count as a burst, 2-50 (default 5)')
          .setMinValue(2)
          .setMaxValue(50),
      )
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('Burst window, 10-600 (default 60)')
          .setMinValue(10)
          .setMaxValue(600),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('autolockdown')
      .setDescription('Run a server lockdown automatically when antinuke quarantines someone.')
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Turn auto lockdown on or off').setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('minutes')
          .setDescription(
            'Unlock automatically after this many minutes, 0 = stay locked (default 15)',
          )
          .setMinValue(0)
          .setMaxValue(1440),
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
    if (sub === 'vanity')
      c.guard.patch(i.guildId, { vanity: { enabled: i.options.getBoolean('enabled', true) } });
    if (sub === 'prune') {
      const count = i.options.getInteger('count'),
        seconds = i.options.getInteger('seconds');
      c.guard.patch(i.guildId, {
        prune: {
          enabled: i.options.getBoolean('enabled', true),
          ...(count ? { threshold: count } : {}),
          ...(seconds ? { windowSeconds: seconds } : {}),
        },
      });
    }
    if (sub === 'autolockdown') {
      const minutes = i.options.getInteger('minutes');
      c.guard.patch(i.guildId, {
        autoLockdown: {
          enabled: i.options.getBoolean('enabled', true),
          ...(minutes !== null ? { minutes } : {}),
        },
      });
    }
    const cfg = c.guard.get(i.guildId),
      ch = c.antinuke.get(i.guildId).channelId;
    await i.editReply(
      lunaPayload(
        {
          content: t('guardConfig', {
            channel: ch ? `<#${ch}>` : t('guardNoChannel'),
            webhook: cfg.webhook.mode,
            autolockdown: cfg.autoLockdown.enabled
              ? `${cfg.autoLockdown.minutes || '-'} min`
              : t('disabled'),
            prune: cfg.prune.enabled
              ? `${cfg.prune.threshold}/${cfg.prune.windowSeconds}s`
              : t('disabled'),
            vanity: t(cfg.vanity.enabled ? 'enabled' : 'disabled'),
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
