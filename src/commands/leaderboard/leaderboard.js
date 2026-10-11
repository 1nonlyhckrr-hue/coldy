import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const period = (o) =>
  o
    .setName('period')
    .setDescription('UTC calendar window')
    .addChoices(
      { name: 'Today (UTC)', value: 'today' },
      { name: 'Today + previous six UTC days', value: 'week' },
      { name: 'Retained 90 UTC days', value: 'retained' },
    );
const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Opt-in retained message counts, no message content.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s.setName('enable').setDescription('Manage Server: start counting future eligible messages.'),
  )
  .addSubcommand((s) =>
    s.setName('disable').setDescription('Manage Server: stop counting; keep stored counts.'),
  )
  .addSubcommand((s) =>
    s
      .setName('exclude')
      .setDescription('Manage Server: exclude/include a text channel or category.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel or category')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildCategory,
          )
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('excluded').setDescription('Exclude this channel/category').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('removeexclude')
      .setDescription(
        'Manage Server: remove one exact stored exclusion,including deleted channels.',
      )
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact excluded channel/category ID')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing this stored exclusion')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('config').setDescription('View tracking status and excluded IDs.'),
  )
  .addSubcommand((s) =>
    s
      .setName('position')
      .setDescription('Show only your retained message rank and count,UTC window.')
      .addStringOption(period),
  )
  .addSubcommand((s) =>
    s
      .setName('daily')
      .setDescription('Show only your retained daily message counts,ten UTC days per page.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-9,newest first').setMinValue(1).setMaxValue(9),
      ),
  )
  .addSubcommand((s) => s.setName('stats').setDescription('Show your own retained message counts.'))
  .addSubcommand((s) =>
    s
      .setName('top')
      .setDescription('Show retained message ranks, ten per page.')
      .addStringOption(period)
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page').setMinValue(1).setMaxValue(1000),
      ),
  )
  .addSubcommand((s) =>
    s.setName('optout').setDescription('Stop counting your future messages and erase your counts.'),
  )
  .addSubcommand((s) =>
    s.setName('optin').setDescription('Allow future counts when this server has tracking enabled.'),
  )
  .addSubcommand((s) =>
    s
      .setName('eraseuser')
      .setDescription('Manage Server: erase one user retained counts, not their preference.')
      .addUserOption((o) => o.setName('user').setDescription('User to erase').setRequired(true))
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm deletion of all this user retained counts here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('resetmine').setDescription('Delete only your retained message counts.'),
  );
export default {
  category: 'leaderboard',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p),
      locale = c.localization.locale(i.guildId);
    let text;
    if (['enable', 'disable', 'exclude', 'removeexclude', 'eraseuser'].includes(sub)) {
      const authorize = async () => {
        const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
        if (
          i.guild.id !== i.guildId ||
          actor?.id !== i.user.id ||
          actor.guild?.id !== i.guildId ||
          !actor.permissions?.has(P.ManageGuild)
        )
          throw new UserError('userPermission');
      };
      await authorize();
      if (sub === 'enable') {
        if (!c.config.messageEventsEnabled) throw new UserError('responderRuntimeDisabled');
        c.messageRanks.enable(i.guildId, true);
        text = t('rankEnabled');
      } else if (sub === 'disable') {
        c.messageRanks.enable(i.guildId, false);
        text = t('rankDisabled');
      } else if (sub === 'removeexclude') {
        if (i.options.getBoolean('confirm', true) !== true)
          throw new UserError('rankExcludeConfirm');
        const id = i.options.getString('channel-id', true);
        if (!/^\d{17,20}$/.test(id)) throw new UserError('rankChannelInvalid');
        const existed = c.messageRanks.config(i.guildId).excluded.includes(id);
        if (existed) c.messageRanks.exclude(i.guildId, id, false);
        text = t('rankExcludeRemoved', { count: existed ? 1 : 0 });
      } else if (sub === 'eraseuser') {
        if (i.options.getBoolean('confirm', true) !== true) throw new UserError('rankEraseConfirm');
        const user = i.options.getUser('user', true);
        if (!/^\d{17,20}$/.test(user.id)) throw new UserError('rankUserInvalid');
        const count = c.messageRanks.resetMine(i.guildId, user.id);
        text = t('rankUserErased', { user: user.id, count });
      } else {
        const selected = i.options.getChannel('channel', true),
          channel = await i.guild.channels.fetch(selected.id, { force: true });
        if (
          !channel ||
          channel.id !== selected.id ||
          channel.guildId !== i.guildId ||
          ![
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildCategory,
          ].includes(channel.type)
        )
          throw new UserError('rankChannelInvalid');
        await authorize();
        c.messageRanks.exclude(i.guildId, channel.id, i.options.getBoolean('excluded', true));
        text = t('rankSaved');
      }
    } else if (sub === 'config') {
      const cfg = c.messageRanks.config(i.guildId);
      text = t('rankConfig', {
        status: t(cfg.enabled ? 'enabled' : 'disabled'),
        excluded: cfg.excluded.join(', ') || '-',
      });
    } else if (sub === 'position') {
      const window = i.options.getString('period') ?? 'week';
      const r = c.messageRanks.position(i.guildId, i.user.id, window);
      text = t(r.position === null ? 'rankPositionEmpty' : 'rankPosition', {
        position: r.position,
        total: r.total,
        period: t('rankWindow_' + window),
      });
    } else if (sub === 'daily') {
      const page = i.options.getInteger('page') ?? 1;
      const rows = c.messageRanks.daily(i.guildId, i.user.id, page);
      text = t('rankDaily', { page }) + '\n' + rows.map((r) => `${r.day}: ${r.count}`).join('\n');
    } else if (sub === 'stats') {
      const counts = c.messageRanks.stats(i.guildId, i.user.id);
      text = t('rankStats', counts);
    } else if (sub === 'optout' || sub === 'optin') {
      c.messageRanks.privacy(i.guildId, i.user.id, sub === 'optout');
      text = t(sub === 'optout' ? 'rankOptedOut' : 'rankOptedIn');
    } else if (sub === 'resetmine') {
      c.messageRanks.resetMine(i.guildId, i.user.id);
      text = t('rankReset');
    } else if (sub === 'top') {
      const result = c.messageRanks.top(
        i.guildId,
        i.options.getString('period') ?? 'week',
        i.options.getInteger('page') ?? 1,
      );
      text =
        t('rankTop', { page: result.page, pages: result.pages }) +
        '\n' +
        (result.rows
          .map((r, n) => `${(result.page - 1) * 10 + n + 1}. ${r.user_id}: ${r.total}`)
          .join('\n') || t('rankEmpty'));
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
