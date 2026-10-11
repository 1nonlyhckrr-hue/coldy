import {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import {
  openPrivateVoice,
  editPrivateVoice,
  reconcilePrivateVoice,
} from '../../services/voiceMaster.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('voicemaster')
  .setDescription('Owner-only private temporary voice channels; explicit creation.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription('Manage Channels: set private voice creation category.')
      .addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('Server category')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('config').setDescription('Show configured private channel category and limits.'),
  )
  .addSubcommand((s) =>
    s
      .setName('status')
      .setDescription(
        'Privately inspect your stored voice ownership record,not live channel state.',
      ),
  )
  .addSubcommand((s) =>
    s.setName('open').setDescription('Create your own private standard voice channel.'),
  )
  .addSubcommand((s) =>
    s
      .setName('rename')
      .setDescription('Rename your own tracked private channel.')
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('Channel name')
          .setMinLength(1)
          .setMaxLength(80)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('limit')
      .setDescription('Set your channel capacity; access stays private.')
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('1-99 members')
          .setMinValue(1)
          .setMaxValue(99)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('lock')
      .setDescription('Empty tracked channel: restore owner-only view/connect access.'),
  )
  .addSubcommand((s) =>
    s
      .setName('unlock')
      .setDescription('Empty tracked channel: explicitly allow all server members view/connect.')
      .addBooleanOption((o) =>
        o
          .setName('share')
          .setDescription('Confirm everyone in server may see/join this channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reconcile')
      .setDescription('Recheck your recorded channel, safely repair stored ownership state.')
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm repair from observed current recorded channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('close').setDescription('Delete only your tracked empty private channel.'),
  );
export default {
  category: 'voicemaster',
  data,
  cooldownMs: 10000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.localization.locale(i.guildId),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    let text;
    if (sub === 'setup') {
      if (i.guild?.id !== i.guildId) throw new UserError('userPermission');
      const selected = i.options.getChannel('category', true).id;
      const category = await i.guild.channels.fetch(selected, { force: true });
      const [actor, bot] = await Promise.all([
        i.guild.members.fetch({ user: i.user.id, force: true }),
        i.guild.members.fetchMe({ force: true }),
      ]);
      if (
        actor?.id !== i.user.id ||
        actor.guild?.id !== i.guildId ||
        !actor.permissions?.has(P.ManageChannels)
      )
        throw new UserError('userPermission');
      if (!i.client?.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
        throw new UserError('vmBotPermission');
      if (
        !category ||
        category.id !== selected ||
        category.guildId !== i.guildId ||
        category.type !== ChannelType.GuildCategory
      )
        throw new UserError('vmCategoryInvalid');
      if (!category.permissionsFor(bot)?.has([P.ViewChannel, P.ManageChannels, P.Connect]))
        throw new UserError('vmBotPermission');
      c.voiceMaster.setup(i.guildId, category.id);
      text = t('vmSetup');
    } else if (sub === 'config') {
      text = t('vmConfig', { category: c.voiceMaster.config(i.guildId)?.category_id ?? '-' });
    } else if (sub === 'status') {
      if (i.guild?.id !== i.guildId) throw new UserError('customMemberMissing');
      const row = c.voiceMaster.owned(i.guildId, i.user.id);
      text = row
        ? t('vmStoredRecord', {
            id: row.id,
            channel: row.channel_id ?? t('vmStoredNoChannel'),
            state: t('vmStoredState_' + row.status),
          })
        : t('vmStoredNone');
    } else if (sub === 'reconcile') {
      const r = await reconcilePrivateVoice(i, c, {
        confirm: i.options.getBoolean('confirm', true),
      });
      text = t(r.status === 'active' ? 'vmRepairActive' : 'vmRepairClosed', {
        id: r.caseId,
        channel: r.channelId,
      });
    } else if (sub === 'open') {
      const r = await openPrivateVoice(i, c);
      text = t('vmOpened', { id: r.id, channel: r.channelId });
    } else if (['rename', 'limit', 'close', 'lock', 'unlock'].includes(sub)) {
      const id = await editPrivateVoice(i, c, {
        action: sub,
        share: sub === 'unlock' ? i.options.getBoolean('share', true) : undefined,
        name: sub === 'rename' ? i.options.getString('name', true) : undefined,
        limit: sub === 'limit' ? i.options.getInteger('count', true) : undefined,
      });
      text = t(sub === 'unlock' ? 'vmUnlocked' : sub === 'lock' ? 'vmLocked' : 'vmEdited', { id });
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
