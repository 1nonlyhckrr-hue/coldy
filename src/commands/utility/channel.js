import { editEmptyVoiceChannel } from '../../services/voiceChannelEdits.js';
import { editTextChannel } from '../../services/channelEdits.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
  ChannelType,
} from 'discord.js';
import {
  CHANNEL_TYPES,
  currentChannelActor,
  readableChannel,
  inspectChannel,
} from '../../services/channelMetadata.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('channel')
  .setDescription('Read current visible channel metadata and your effective permissions.')
  .setContexts(InteractionContextType.Guild);
for (const sub of ['info', 'permissions'])
  data.addSubcommand((s) =>
    s
      .setName(sub)
      .setDescription(
        sub === 'info'
          ? 'Inspect visible server channel ID/type/position;no content or member enumeration.'
          : 'List your current effective channel permission flags;not other members.',
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Supported non-thread server channel;default current')
          .addChannelTypes(...CHANNEL_TYPES.keys()),
      )
      .addIntegerOption((o) =>
        o
          .setName('page')
          .setDescription('Permission page1-10;info only accepts1')
          .setMinValue(1)
          .setMaxValue(10),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('list')
    .setDescription('List only channels you can currently view;no threads,topics or member counts.')
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Page1-100,ten channels').setMinValue(1).setMaxValue(100),
    )
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Literal name substring1-80characters')
        .setMinLength(1)
        .setMaxLength(80),
    ),
);
for (const action of ['rename', 'topic', 'cleartopic'])
  data.addSubcommand((s) => {
    s.setName(action)
      .setDescription(
        'Confirmed one text-channel ' + action + ';currentchannel ManageChannels/case checks.',
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('One normal text channel,not threads/forums')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm changing native channel metadata')
          .setRequired(true),
      );
    if (action !== 'cleartopic')
      s.addStringOption((o) =>
        o
          .setName('text')
          .setDescription(
            action === 'rename'
              ? 'Lowercase letters,digits,_ or -,1-100characters'
              : 'Topic1-1024characters,no @ or controls;public channel metadata',
          )
          .setMinLength(1)
          .setMaxLength(action === 'rename' ? 100 : 1024)
          .setRequired(true),
      );
    return s;
  });
for (const action of ['voicelimit', 'voicebitrate', 'voiceregionauto'])
  data.addSubcommand((s) => {
    s.setName(action)
      .setDescription(
        'Confirmedempty normalvoicechannel setting,currentManageChannels+gatewayreadiness.',
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('One empty normalvoicechannel')
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm native emptyvoicechannel change')
          .setRequired(true),
      );
    if (action !== 'voiceregionauto')
      s.addIntegerOption((o) =>
        o
          .setName('value')
          .setDescription(
            action === 'voicelimit'
              ? 'Userlimit0-99;0unlimited'
              : 'Bitrate8-96kbps,no boost requirement',
          )
          .setMinValue(action === 'voicelimit' ? 0 : 8)
          .setMaxValue(action === 'voicelimit' ? 99 : 96)
          .setRequired(true),
      );
    return s;
  });
for (const action of ['threadarchive', 'threadslowmode', 'agerestrict'])
  data.addSubcommand((s) => {
    s.setName(action)
      .setDescription(
        action === 'agerestrict'
          ? 'Mark one text channel age-restricted;changes audience visibility,no removal here.'
          : action === 'threadarchive'
            ? 'Set auto-archive default for newly created text-channel threads;existing threads untouched.'
            : 'Set slowmode default for newly created text-channel threads;existing threads untouched.',
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('One normal text channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm this native setting and described audience/default change')
          .setRequired(true),
      );
    if (action === 'threadarchive')
      s.addIntegerOption((o) =>
        o
          .setName('value')
          .setDescription('Auto archive minutes for new threads')
          .addChoices(...[60, 1440, 4320, 10080].map((v) => ({ name: String(v), value: v })))
          .setRequired(true),
      );
    if (action === 'threadslowmode')
      s.addIntegerOption((o) =>
        o
          .setName('value')
          .setDescription('Slowmode seconds0-21600 for new threads')
          .setMinValue(0)
          .setMaxValue(21600)
          .setRequired(true),
      );
    return s;
  });
export default {
  category: 'utility',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      page = i.options.getInteger('page') ?? 1,
      locale = c.localization.locale(i.guildId),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100)
      throw new UserError('listPageInvalid');
    let text;
    if (['threadarchive', 'threadslowmode', 'agerestrict'].includes(sub)) {
      const r = await editTextChannel(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        action: sub,
        value: sub === 'agerestrict' ? undefined : i.options.getInteger('value', true),
        confirm: i.options.getBoolean('confirm', true),
      });
      text = t(r.changed ? 'channelDefaultsSaved' : 'channelEditNoop');
    } else if (['voicelimit', 'voicebitrate', 'voiceregionauto'].includes(sub)) {
      const r = await editEmptyVoiceChannel(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        action: sub,
        value: sub === 'voiceregionauto' ? undefined : i.options.getInteger('value', true),
        confirm: i.options.getBoolean('confirm', true),
      });
      text = t(r.changed ? 'voiceChannelSaved' : 'channelEditNoop');
    } else if (['rename', 'topic', 'cleartopic'].includes(sub)) {
      const r = await editTextChannel(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        action: sub,
        value: sub === 'cleartopic' ? undefined : i.options.getString('text', true),
        confirm: i.options.getBoolean('confirm', true),
      });
      text = t(r.changed ? 'channelEditSaved' : 'channelEditNoop');
    } else if (sub === 'list') {
      const search = i.options.getString('search');
      if (
        search !== null &&
        (typeof search !== 'string' ||
          !search.trim() ||
          search.length > 80 ||
          /[\u0000-\u001f\u007f]/u.test(search))
      )
        throw new UserError('listSearchInvalid');
      const channels = await i.guild.channels.fetch();
      const actor = await currentChannelActor(i);
      const rows = [...channels.values()]
        .filter((ch) => ch && CHANNEL_TYPES.has(ch.type))
        .filter((ch) => readableChannel(ch, i, actor))
        .filter(
          (ch) => search === null || ch.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));
      const pages = Math.max(1, Math.ceil(rows.length / 10));
      if (page > pages) throw new UserError('listPageInvalid');
      text =
        t('channelListHeader', { count: rows.length, page, pages }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map(
            (ch) =>
              `${escapeMarkdown(ch.name)} | ${ch.id} | ${t('channelType_' + CHANNEL_TYPES.get(ch.type))}`,
          )
          .join('\n') || t('listMetadataEmpty'));
    } else if (['info', 'permissions'].includes(sub)) {
      const id = i.options.getChannel('channel')?.id ?? i.channelId;
      const { channel, actor } = await inspectChannel(i, id);
      if (sub === 'info') {
        if (page !== 1) throw new UserError('listPageInvalid');
        text = t('channelInfo', {
          name: escapeMarkdown(channel.name),
          id: channel.id,
          type: t('channelType_' + CHANNEL_TYPES.get(channel.type)),
          position: channel.rawPosition,
        });
      } else {
        if (page > 10) throw new UserError('listPageInvalid');
        const permissions = channel.permissionsFor(actor);
        if (!permissions) throw new UserError('channelMetadataDenied');
        const flags = permissions.toArray().sort(),
          pages = Math.max(1, Math.ceil(flags.length / 10));
        if (page > pages) throw new UserError('listPageInvalid');
        text =
          t('channelPermissions', { id: channel.id, page, pages }) +
          '\n' +
          (flags.slice((page - 1) * 10, page * 10).join('\n') || '-');
      }
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
