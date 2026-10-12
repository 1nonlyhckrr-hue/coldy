import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
  escapeMarkdown,
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
      .setDescription(
        'List latest100 stored records,2 complete prizes/page,no live delivery claim.',
      )
      .addIntegerOption((o) =>
        o
          .setName('page')
          .setDescription('Page1-50,latest100 records')
          .setMinValue(1)
          .setMaxValue(50),
      ),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show giveaway limits and policies.'));
for (const sub of ['inspect', 'cancel', 'forgetentries'])
  data.addSubcommand((s) => {
    s.setName(sub)
      .setDescription(
        sub === 'inspect'
          ? 'Private stored prize/state/entrycount,no entrantIDs/live readiness.'
          : sub === 'cancel'
            ? 'Confirmed stop stored activegiveaway,no native announcement/button edit.'
            : 'Confirmed erase ended/cancelled entrantIDs;future rerolls lose candidates.',
      )
      .addIntegerOption(idOption);
    if (sub !== 'inspect')
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stored stop/entry erasure;native messages untouched')
          .setRequired(true),
      );
    return s;
  });
data.addSubcommand((s) =>
  s
    .setName('export')
    .setDescription(
      'Private latest100 stored giveaway prize/schedule/binding records,no entrant/winner IDs.',
    ),
);
for (const name of ['cancelall', 'forgetfinishedentries'])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(
        name === 'cancelall'
          ? 'Cancel all active giveaways in storage only;no native message edits or announcements.'
          : 'Erase entrant IDs for ended/cancelled giveaways;winner history/native messages kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm this server-wide stored giveaway change')
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription(
      'Private storedgiveawaystate/retained-entry counts,no entrant/winner identities.',
    ),
);
for (const sub of ['channelrecords', 'cancelchannel'])
  data.addSubcommand((s) => {
    s.setName(sub)
      .setDescription(
        sub === 'channelrecords'
          ? 'Private latest100metadata for exactstoredchannelID,total/truncated,no entrant IDs.'
          : 'Confirmedcancel onlyactivegiveaways in exactstoredchannel,no native announcements/deletes.',
      )
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact17-20digit storedchannelID,deleted resources allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      );
    if (sub === 'cancelchannel')
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription(
            'Confirm stopping activegiveaways here,entries/history/native messages kept',
          )
          .setRequired(true),
      );
    return s;
  });
export default {
  category: 'giveaway',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (key, p) => translate(locale, key, p);
    let content, files;
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
    if (sub === 'summary') {
      const r = c.giveaways.summary(i.guildId);
      content =
        t('giveawaySummary', { entries: r.retainedEntries }) +
        '\n' +
        (r.states.map((v) => `${v.status}: ${v.count}`).join('\n') || '0');
    }
    if (sub === 'channelrecords') {
      const report = c.giveaways.channelRecords(i.guildId, i.options.getString('channel-id', true));
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'luna-channel-giveaway-records.json',
        }),
      ];
      content = t('giveawayRecordsExported', { count: report.records.length, total: report.total });
    }
    if (sub === 'cancelchannel') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('giveawayStoredConfirm');
      content = t('giveawayChannelCancelled', {
        count: c.giveaways.cancelChannel(i.guildId, i.options.getString('channel-id', true)),
      });
    }
    if (sub === 'export') {
      const report = c.giveaways.exportRecords(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'luna-giveaway-records.json',
        }),
      ];
      content = t('giveawayRecordsExported', { count: report.records.length, total: report.total });
    }
    if (['cancelall', 'forgetfinishedentries'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('giveawayStoredConfirm');
      const count =
        sub === 'cancelall'
          ? c.giveaways.cancelAllActive(i.guildId)
          : c.giveaways.forgetFinishedEntries(i.guildId);
      content = t(sub === 'cancelall' ? 'giveawayAllCancelled' : 'giveawayFinishedForgotten', {
        count,
      });
    }

    if (sub === 'inspect') {
      const r = c.giveaways.inspect(i.options.getInteger('id', true), i.guildId);
      content = t('giveawayInspectValue', {
        ...r,
        prize: escapeMarkdown(r.prize.replace(/[\u0000-\u001f\u007f]/gu, ' ')),
        iso: new Date(r.endsAt).toISOString(),
      });
    }
    if (['cancel', 'forgetentries'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('giveawayStoredConfirm');
      const id = i.options.getInteger('id', true);
      if (sub === 'cancel') {
        c.giveaways.cancelActive(id, i.guildId);
        content = t('giveawayCancelledStored', { id });
      } else
        content = t('giveawayEntriesForgotten', {
          count: c.giveaways.forgetEntries(id, i.guildId),
        });
    }
    if (
      ![
        'summary',
        'channelrecords',
        'cancelchannel',
        'start',
        'end',
        'reroll',
        'list',
        'config',
        'inspect',
        'cancel',
        'forgetentries',
        'export',
        'cancelall',
        'forgetfinishedentries',
      ].includes(sub)
    )
      throw new UserError('unknownCommand');
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
      const { rows, pages, page } = c.giveaways.listPage(
        i.guildId,
        i.options.getInteger('page') ?? 1,
      );
      content =
        t('giveawayList', { page, pages }) +
        '\n' +
        t('giveawayStoredNotice') +
        '\n' +
        (rows
          .map(
            (g) =>
              `#${g.id} | ${g.status} | ${escapeMarkdown(g.prize.replace(/[\x00-\x1f\x7f]/g, ' '))}`,
          )
          .join('\n') || t('giveawayEmpty'));
    }
    if (sub === 'config') content = t('giveawayConfig');
    await i.editReply(
      lunaPayload(
        { content, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
