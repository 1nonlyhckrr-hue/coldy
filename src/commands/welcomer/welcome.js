import { exportWelcome, importWelcome, resetWelcome } from '../../services/welcomeLibrary.js';
import { validateWelcomeAsset, welcomeStyle } from '../../services/welcomeAssets.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  AttachmentBuilder,
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
  .addSubcommand((s) =>
    s
      .setName('title')
      .setDescription('Set static welcome/goodbye title;omit text to restore Emika title.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Message type')
          .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'goodbye', value: 'goodbye' })
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Static title1-120chars,no @ or line breaks;omit to reset')
          .setMinLength(1)
          .setMaxLength(120),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('color')
      .setDescription('Set welcome/goodbye embed color,or reset to Emika default.')
      .addStringOption((o) =>
        o
          .setName('hex')
          .setDescription('Six hex digits,example 9B87F5;omit to reset')
          .setMinLength(6)
          .setMaxLength(7),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resettemplate')
      .setDescription('Restore one localized default template,leaving delivery settings unchanged.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Template to restore')
          .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'goodbye', value: 'goodbye' })
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm replacing this stored custom template')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('mentions')
      .setDescription(
        'Choose whether welcome delivery may ping only the arriving member;goodbye never.',
      )
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Allow only arriving-member mention').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clearchannel')
      .setDescription('Disable welcome/goodbye and remove stored destination;templates kept.')
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stopping both and clearing destination')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('image')
      .setDescription('Set HTTPS embed image for welcome/goodbye;omit URL to clear.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Message kind')
          .setRequired(true)
          .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'goodbye', value: 'goodbye' }),
      )
      .addStringOption((o) =>
        o
          .setName('url')
          .setDescription('Public HTTPS image URL;Discord fetches it,no private links')
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('thumbnail')
      .setDescription('Set HTTPS embed thumbnail for welcome/goodbye;omit URL to clear.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Message kind')
          .setRequired(true)
          .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'goodbye', value: 'goodbye' }),
      )
      .addStringOption((o) =>
        o
          .setName('url')
          .setDescription('Public HTTPS image URL;Discord fetches it,no private links')
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resetstyle')
      .setDescription('Clear welcome/goodbye titles/images/thumbnails/shared color;templates kept.')
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm resetting both message styles')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription(
        'Private welcome/goodbye template/style JSON;no channel IDs or enable flags.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('import')
      .setDescription(
        'Replace template/style library from JSON,disable both sends,keep destination.',
      )
      .addStringOption((o) =>
        o
          .setName('json')
          .setDescription('Strict portable library object,4000characters max')
          .setMinLength(2)
          .setMaxLength(4000)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm replacing templates/styles and disabling delivery')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription(
        'Restore defaults,stop both message types,forget destination and all style/template settings.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm forgetting all welcome/goodbye settings')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('enable').setDescription('Enable welcome messages.'))
  .addSubcommand((s) => s.setName('disable').setDescription('Disable welcome messages.'))
  .addSubcommand((s) => s.setName('config').setDescription('Show current settings.'))
  .addSubcommand((s) => s.setName('test').setDescription('Send one welcome message for yourself.'))
  .addSubcommand((s) =>
    s
      .setName('preview')
      .setDescription('Privately preview current welcome/goodbye template for yourself.')
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Template')
          .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'goodbye', value: 'goodbye' })
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('pauseboth')
    .setDescription('Stop welcome and goodbye delivery;all templates/styles/channel/history kept.')
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm stopping both welcome/goodbye delivery')
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportconfig')
    .setDescription(
      'Private complete stored welcome/goodbye config including destination,not runtime/history.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('clearassets')
    .setDescription(
      'Clear welcome or goodbye image/thumbnail only;title/color/template/delivery kept.',
    )
    .addStringOption((o) =>
      o
        .setName('kind')
        .setDescription('Asset pair to clear')
        .addChoices({ name: 'Welcome', value: 'welcome' }, { name: 'Goodbye', value: 'goodbye' })
        .setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm forgetting both image and thumbnail for this kind')
        .setRequired(true),
    ),
);
export default {
  category: 'welcomer',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    const locale = c.guildConfig.get(i.guildId).language;
    const t = (key, params) => translate(locale, key, params);
    const status = (v) => t(v ? 'enabled' : 'disabled');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const authorize = async () => {
      const member = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        i.guild.id !== i.guildId ||
        member?.id !== i.user.id ||
        member.guild?.id !== i.guildId ||
        !member.permissions?.has(P.ManageGuild)
      )
        throw new UserError('userPermission');
      return member;
    };
    const actor = await authorize();
    const sub = i.options.getSubcommand();
    let text, files;
    if (sub === 'exportconfig') {
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify(c.guildConfig.get(i.guildId).welcome, null, 2) + '\n', 'utf8'),
          { name: 'emika-welcome-config.json' },
        ),
      ];
      text = t('welcomeFullConfigExport');
    }
    if (sub === 'pauseboth' || sub === 'clearassets') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeLibraryConfirm');
      if (sub === 'pauseboth')
        c.guildConfig.patch(i.guildId, 'welcome', { enabled: false, goodbyeEnabled: false });
      else {
        const kind = i.options.getString('kind', true);
        if (!['welcome', 'goodbye'].includes(kind)) throw new UserError('unknownCommand');
        c.guildConfig.patch(
          i.guildId,
          'welcome',
          kind === 'welcome'
            ? { image: undefined, thumbnail: undefined }
            : { goodbyeImage: undefined, goodbyeThumbnail: undefined },
        );
      }
      text = t(sub === 'pauseboth' ? 'welcomeBothPaused' : 'welcomeAssetsCleared');
    }
    if (sub === 'export') {
      files = [
        new AttachmentBuilder(
          Buffer.from(
            JSON.stringify(exportWelcome(c.guildConfig, i.guildId), null, 2) + '\n',
            'utf8',
          ),
          { name: 'emika-welcome-library.json' },
        ),
      ];
      text = t('welcomeLibraryExported');
    }
    if (sub === 'import') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeLibraryConfirm');
      importWelcome(c.guildConfig, i.guildId, i.options.getString('json', true));
      text = t('welcomeLibraryImported');
    }
    if (sub === 'reset') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeLibraryConfirm');
      resetWelcome(c.guildConfig, i.guildId);
      text = t('welcomeLibraryReset');
    }
    if (['image', 'thumbnail'].includes(sub)) {
      const kind = i.options.getString('kind', true),
        url = i.options.getString('url');
      if (!['welcome', 'goodbye'].includes(kind)) throw new UserError('unknownCommand');
      if (url !== null) validateWelcomeAsset(url);
      const key = kind === 'welcome' ? sub : 'goodbye' + (sub === 'image' ? 'Image' : 'Thumbnail');
      c.guildConfig.patch(i.guildId, 'welcome', { [key]: url === null ? undefined : url });
      text = t('welcomeAssetSaved');
    }
    if (sub === 'resetstyle') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeStyleConfirm');
      c.guildConfig.patch(i.guildId, 'welcome', {
        title: undefined,
        goodbyeTitle: undefined,
        color: undefined,
        image: undefined,
        thumbnail: undefined,
        goodbyeImage: undefined,
        goodbyeThumbnail: undefined,
      });
      text = t('welcomeStyleReset');
    }
    if (sub === 'channel') {
      const id = i.options.getChannel('channel', true).id;
      await validateOutputChannel(i.guild, id);
      await authorize();
      c.guildConfig.patch(i.guildId, 'welcome', { channelId: id });
      text = t('welcomeChannelSaved');
    }
    if (sub === 'resettemplate') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeResetConfirm');
      const kind = i.options.getString('kind', true);
      if (!['welcome', 'goodbye'].includes(kind)) throw new UserError('unknownCommand');
      c.guildConfig.patch(
        i.guildId,
        'welcome',
        kind === 'welcome'
          ? { message: 'Welcome {user} to {server}!', messageCustom: false }
          : { goodbyeMessage: 'Goodbye {username}.', goodbyeCustom: false },
      );
      text = t('welcomeTemplateReset');
    }
    if (sub === 'title') {
      const kind = i.options.getString('kind', true),
        title = i.options.getString('text');
      if (!['welcome', 'goodbye'].includes(kind)) throw new UserError('unknownCommand');
      if (
        title !== null &&
        (typeof title !== 'string' ||
          !title.trim() ||
          title.length > 120 ||
          /[\u0000-\u001f\u007f@]/u.test(title))
      )
        throw new UserError('welcomeTitleInvalid');
      c.guildConfig.patch(i.guildId, 'welcome', {
        [kind === 'welcome' ? 'title' : 'goodbyeTitle']: title === null ? undefined : title,
      });
      text = t('welcomeTitleSaved');
    }
    if (sub === 'color') {
      const hex = i.options.getString('hex');
      if (hex !== null && !/^#?[0-9a-fA-F]{6}$/.test(hex))
        throw new UserError('welcomeColorInvalid');
      c.guildConfig.patch(i.guildId, 'welcome', {
        color: hex === null ? undefined : parseInt(hex.replace('#', ''), 16),
      });
      text = t('welcomeColorSaved');
    }
    if (sub === 'mentions') {
      const enabled = i.options.getBoolean('enabled', true);
      c.guildConfig.patch(i.guildId, 'welcome', { mentionMember: enabled });
      text = t('welcomeMentionSaved', { status: status(enabled) });
    }
    if (sub === 'clearchannel') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('welcomeClearConfirm');
      c.guildConfig.patch(i.guildId, 'welcome', {
        enabled: false,
        goodbyeEnabled: false,
        channelId: undefined,
      });
      text = t('welcomeChannelCleared');
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
        await authorize();
        if (c.guildConfig.get(i.guildId).welcome.channelId !== s.channelId)
          throw new UserError('welcomeChannelRequired');
        if (!c.config.memberEventsEnabled) throw new UserError('memberEventsDisabled');
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
      await authorize();
      if (c.guildConfig.get(i.guildId).welcome.channelId !== s.channelId)
        throw new UserError('welcomeChannelRequired');
      if (!c.config.memberEventsEnabled) throw new UserError('memberEventsDisabled');
      c.guildConfig.patch(i.guildId, 'welcome', { enabled: true });
      text = t('welcomeEnabled');
    }
    if (sub === 'disable') {
      c.guildConfig.patch(i.guildId, 'welcome', { enabled: false });
      text = t('welcomeDisabled');
    }
    if (sub === 'config') {
      const s = c.guildConfig.get(i.guildId).welcome;
      text =
        t('welcomeConfig', {
          welcome: status(s.enabled),
          goodbye: status(s.goodbyeEnabled),
          channel: s.channelId ?? t('notSet'),
          events: status(c.config.memberEventsEnabled),
        }) +
        '\n' +
        t('welcomeMentionConfig', { status: status(s.mentionMember) });
    }
    if (sub === 'preview') {
      const kind = i.options.getString('kind', true);
      if (!['welcome', 'goodbye'].includes(kind)) throw new UserError('unknownCommand');
      const latest = c.guildConfig.get(i.guildId);
      await i.editReply(
        lunaPayload(
          {
            content: renderGuildTemplate(latest.welcome, kind, actor, latest.language),
            allowedMentions: { parse: [] },
          },
          {
            locale: latest.language,
            ...welcomeStyle(latest.welcome, kind),
          },
        ),
      );
      return;
    }
    if (sub === 'test') {
      const s = c.guildConfig.get(i.guildId).welcome;
      if (!s.channelId) throw new UserError('welcomeChannelRequired');
      const channel = await validateOutputChannel(i.guild, s.channelId);
      const member = await authorize();
      const latest = c.guildConfig.get(i.guildId);
      if (latest.welcome.channelId !== s.channelId) throw new UserError('welcomeChannelRequired');
      await channel.send(
        lunaPayload(
          {
            content: renderGuildTemplate(latest.welcome, 'welcome', member, latest.language),
            allowedMentions: { parse: [], users: latest.welcome.mentionMember ? [i.user.id] : [] },
          },
          { locale: latest.language, ...welcomeStyle(latest.welcome, 'welcome') },
        ),
      );
      text = t('welcomeTestSent');
    }
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
