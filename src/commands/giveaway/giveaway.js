import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { createGiveaway } from '../../services/giveawayDelivery.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const idOption = (o) =>
  o.setName('id').setDescription('Giveaway record ID').setMinValue(1).setRequired(true);
const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Manage persistent button-entry giveaways.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('start')
      .setDescription('Create a giveaway with checked eligibility.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addStringOption((o) =>
        o
          .setName('prize')
          .setDescription('Prize description; Luna does not transfer prizes')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(250),
      )
      .addIntegerOption((o) =>
        o
          .setName('minutes')
          .setDescription('Duration: 1 minute to 30 days')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(43200),
      )
      .addIntegerOption((o) =>
        o
          .setName('winners')
          .setDescription('Maximum winners')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20),
      )
      .addRoleOption((o) =>
        o.setName('required-role').setDescription('Optional role required to enter and win'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('end')
      .setDescription('End and publish a stored draw, or retry publishing it.')
      .addIntegerOption(idOption),
  )
  .addSubcommand((s) =>
    s
      .setName('reroll')
      .setDescription('Draw again, excluding the immediately previous winners.')
      .addIntegerOption(idOption),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('List recent giveaway records.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show giveaway limits and policies.'));
export default {
  category: 'giveaway',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (key, p) => translate(locale, key, p);
    let content;
    // Re-fetch moderator permissions for state changes, including manual draws.
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
    if (sub === 'start') {
      const id = await createGiveaway(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        prize: i.options.getString('prize', true),
        durationMs: i.options.getInteger('minutes', true) * 60000,
        winnerCount: i.options.getInteger('winners', true),
        ...(i.options.getRole('required-role')
          ? { requiredRoleId: i.options.getRole('required-role').id }
          : {}),
      });
      content = t('giveawayCreated', { id });
    }
    if (['end', 'reroll'].includes(sub)) {
      const g = await c.giveawayRunner.finish(i.options.getInteger('id', true), i.guildId, {
        reroll: sub === 'reroll',
        authorize,
      });
      content = t('giveawayEnded', { id: g.id, draw: g.draw_version });
    }
    if (sub === 'list') {
      const rows = c.giveaways.list(i.guildId),
        pages = Math.max(1, Math.ceil(rows.length / 10)),
        page = i.options.getInteger('page') ?? 1;
      if (page > pages) throw new UserError('responderPageInvalid', { pages });
      content =
        t('giveawayList', { page, pages }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map((g) => `#${g.id} | ${g.status} | ${g.prize}`)
          .join('\n') || t('giveawayEmpty'));
    }
    if (sub === 'config') content = t('giveawayConfig');
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
