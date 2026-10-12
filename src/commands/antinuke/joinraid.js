import { SlashCommandBuilder, InteractionContextType, MessageFlags, ChannelType } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
const int = (o, name, desc, min, max) =>
  o.setName(name).setDescription(desc).setMinValue(min).setMaxValue(max);
const data = new SlashCommandBuilder()
  .setName('joinraid')
  .setDescription('Anti join-raid: act on new accounts when many join at once (default off).')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('enable')
      .setDescription('Turn on and set the limits.')
      .addIntegerOption((o) =>
        int(o, 'joins', 'Joins that count as a raid (2-50, default 5)', 2, 50),
      )
      .addIntegerOption((o) =>
        int(o, 'seconds', 'Within this many seconds (5-120, default 10)', 5, 120),
      )
      .addIntegerOption((o) =>
        int(o, 'min-age-days', 'Act on accounts younger than this (0-365, default 3)', 0, 365),
      )
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('What to do with them (default timeout)')
          .addChoices({ name: 'timeout', value: 'timeout' }, { name: 'kick', value: 'kick' }),
      )
      .addIntegerOption((o) =>
        int(o, 'timeout-minutes', 'Timeout length in minutes (1-1440, default 60)', 1, 1440),
      )
      .addChannelOption((o) =>
        o
          .setName('alert-channel')
          .setDescription('Where to post raid alerts')
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((s) => s.setName('disable').setDescription('Turn anti join-raid off.'))
  .addSubcommand((s) => s.setName('config').setDescription('Show the current settings.'));
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'joinraid');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    if (sub === 'enable') {
      if (c.config.memberEventsEnabled !== true) throw new UserError('joinRaidRuntimeDisabled');
      const o = i.options,
        changes = { enabled: true };
      for (const [opt, key] of [
        ['joins', 'joins'],
        ['seconds', 'seconds'],
        ['min-age-days', 'minAgeDays'],
        ['timeout-minutes', 'timeoutMinutes'],
      ]) {
        const v = o.getInteger(opt);
        if (v !== null && v !== undefined) changes[key] = v;
      }
      const action = o.getString('action');
      if (action) changes.action = action;
      const ch = o.getChannel('alert-channel');
      if (ch) changes.alertChannelId = ch.id;
      c.joinRaid.patch(i.guildId, changes);
    } else if (sub === 'disable') c.joinRaid.patch(i.guildId, { enabled: false });
    const cfg = c.joinRaid.get(i.guildId);
    await i.editReply(
      lunaPayload(
        {
          content: t('joinRaidConfig', {
            status: t(cfg.enabled ? 'enabled' : 'disabled'),
            joins: cfg.joins,
            seconds: cfg.seconds,
            age: cfg.minAgeDays,
            action: cfg.action,
            minutes: cfg.timeoutMinutes,
            channel: cfg.alertChannelId ? `<#${cfg.alertChannelId}>` : '-',
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
