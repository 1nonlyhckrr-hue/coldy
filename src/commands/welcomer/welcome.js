import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { validateOutputChannel, renderGuildTemplate } from '../../services/guildConfig.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Configure welcome and goodbye messages.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('channel')
      .setDescription('Choose the destination.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('message')
      .setDescription('Set welcome template.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Supports {user}, {username}, {server}, {count}')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1800),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('goodbye')
      .setDescription('Set goodbye template and enable or disable it.')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true))
      .addStringOption((o) =>
        o.setName('text').setDescription('Goodbye template').setMinLength(1).setMaxLength(1800),
      ),
  )
  .addSubcommand((s) => s.setName('enable').setDescription('Enable welcome messages.'))
  .addSubcommand((s) => s.setName('disable').setDescription('Disable welcome messages.'))
  .addSubcommand((s) => s.setName('config').setDescription('Show current settings.'))
  .addSubcommand((s) => s.setName('test').setDescription('Send one welcome message for yourself.'));
export default {
  category: 'welcomer',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    const locale = c.guildConfig.get(i.guildId).language;
    const t = (key, params) => translate(locale, key, params);
    const status = (v) => t(v ? 'enabled' : 'disabled');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();
    let text;
    if (sub === 'channel') {
      const id = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, id);
      c.guildConfig.patch(i.guildId, 'welcome', { channelId: id });
      text = t('welcomeChannelSaved');
    }
    if (sub === 'message') {
      c.guildConfig.patch(i.guildId, 'welcome', {
        message: i.options.getString('text', true),
        messageCustom: true,
      });
      text = t('welcomeTemplateSaved');
    }
    if (sub === 'goodbye') {
      const enabled = i.options.getBoolean('enabled', true);
      const template = i.options.getString('text');
      if (enabled && !c.config.memberEventsEnabled) throw new UserError('memberEventsDisabled');
      const s = c.guildConfig.get(i.guildId).welcome;
      if (enabled) {
        if (!s.channelId) throw new UserError('welcomeChannelRequired');
        await validateOutputChannel(i.guild, s.channelId);
      }
      c.guildConfig.patch(i.guildId, 'welcome', {
        goodbyeEnabled: enabled,
        ...(template ? { goodbyeMessage: template, goodbyeCustom: true } : {}),
      });
      text = t('goodbyeSaved');
    }
    if (sub === 'enable') {
      if (!c.config.memberEventsEnabled) throw new UserError('memberEventsDisabled');
      const s = c.guildConfig.get(i.guildId).welcome;
      if (!s.channelId) throw new UserError('welcomeChannelRequired');
      await validateOutputChannel(i.guild, s.channelId);
      c.guildConfig.patch(i.guildId, 'welcome', { enabled: true });
      text = t('welcomeEnabled');
    }
    if (sub === 'disable') {
      c.guildConfig.patch(i.guildId, 'welcome', { enabled: false });
      text = t('welcomeDisabled');
    }
    if (sub === 'config') {
      const s = c.guildConfig.get(i.guildId).welcome;
      text = t('welcomeConfig', {
        welcome: status(s.enabled),
        goodbye: status(s.goodbyeEnabled),
        channel: s.channelId ?? t('notSet'),
        events: status(c.config.memberEventsEnabled),
      });
    }
    if (sub === 'test') {
      const s = c.guildConfig.get(i.guildId).welcome;
      if (!s.channelId) throw new UserError('welcomeChannelRequired');
      const channel = await validateOutputChannel(i.guild, s.channelId);
      const member = await i.guild.members.fetch({ user: i.user.id, force: true });
      await channel.send(
        lunaPayload(
          {
            content: renderGuildTemplate(s, 'welcome', member, locale),
            allowedMentions: { parse: [], users: [i.user.id] },
          },
          { locale },
        ),
      );
      text = t('welcomeTestSent');
    }
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
