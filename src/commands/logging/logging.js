import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('logging')
  .setDescription('Configure Luna case and opt-in metadata event logs.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('channel')
      .setDescription('Choose the server log channel.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Log destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('enable').setDescription('Enable case logs after configuring a channel.'),
  )
  .addSubcommand((s) =>
    s.setName('disable').setDescription('Disable delivery without deleting config.'),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show case-log settings.'))
  .addSubcommand((s) =>
    s
      .setName('event')
      .setDescription('Enable/disable one metadata event, no message content.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Event kind')
          .addChoices(
            ...[
              'memberjoin',
              'memberleave',
              'rolecreate',
              'roledelete',
              'roleupdate',
              'channelcreate',
              'channeldelete',
              'channelupdate',
            ].map((value) => ({ name: value, value })),
          )
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Send this event metadata').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('test').setDescription('Send one test log to the configured channel.'),
  );
export default {
  category: 'logging',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    const locale = c.guildConfig.get(i.guildId).language;
    const t = (key, params) => translate(locale, key, params);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
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
    const sub = i.options.getSubcommand();
    let text;
    if (sub === 'channel') {
      const id = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, id);
      await authorize();
      c.guildConfig.patch(i.guildId, 'logging', { channelId: id });
      text = t('logChannelSaved');
    }
    if (sub === 'enable') {
      const s = c.guildConfig.get(i.guildId).logging;
      if (!s.channelId) throw new UserError('logChannelRequired');
      await validateOutputChannel(i.guild, s.channelId);
      if (c.guildConfig.get(i.guildId).logging.channelId !== s.channelId)
        throw new UserError('logChannelRequired');
      await authorize();
      if (c.guildConfig.get(i.guildId).logging.channelId !== s.channelId)
        throw new UserError('logChannelRequired');
      c.guildConfig.patch(i.guildId, 'logging', { enabled: true });
      text = t('logsEnabled');
    }
    if (sub === 'disable') {
      c.guildConfig.patch(i.guildId, 'logging', { enabled: false });
      text = t('logsDisabled');
    }
    if (sub === 'config') {
      const s = c.guildConfig.get(i.guildId).logging;
      text =
        t('logConfig', {
          status: t(s.enabled ? 'enabled' : 'disabled'),
          channel: s.channelId ?? t('notSet'),
        }) +
        '\n' +
        t('logEventList', { events: s.events.join(', ') || '-' });
    }
    if (sub === 'event') {
      const kind = i.options.getString('kind', true);
      if (
        ![
          'memberjoin',
          'memberleave',
          'rolecreate',
          'roledelete',
          'roleupdate',
          'channelcreate',
          'channeldelete',
          'channelupdate',
        ].includes(kind)
      )
        throw new UserError('logEventInvalid');
      if (
        kind.startsWith('member') &&
        i.options.getBoolean('enabled', true) &&
        !c.config.memberEventsEnabled
      )
        throw new UserError('logMemberRuntime');
      const events = new Set(c.guildConfig.get(i.guildId).logging.events);
      if (i.options.getBoolean('enabled', true)) events.add(kind);
      else events.delete(kind);
      c.guildConfig.patch(i.guildId, 'logging', { events: [...events] });
      text = t('logEventSaved');
    }
    if (sub === 'test') {
      const result = await c.serverLogs.emit(
        i.guild,
        { kind: 'test', actorId: i.user.id },
        authorize,
      );
      text = t(result.sent ? 'logTestSent' : 'logTestNotSent');
    }
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
