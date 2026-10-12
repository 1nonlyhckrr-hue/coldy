import {
  AttachmentBuilder,
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaEmbed } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View per-server setup and set Emika language.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription(
        'Private stored language/welcome/logging JSON, includes templates/channel IDs, no token/runtime.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('pause')
      .setDescription(
        'Stop welcome/goodbye/logging delivery; keep destination/templates/options/language.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stopping all three configured delivery streams')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resetdelivery')
      .setDescription(
        'Stop and forget welcome/goodbye/logging settings; keep language/other modules/history.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription(
            'Confirm forgetting all configured destinations/templates/styles/log event choices',
          )
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('view').setDescription('View this server configuration.'))
  .addSubcommand((s) =>
    s
      .setName('language')
      .setDescription('Set English, Hindi or Hinglish for this server.')
      .addStringOption((o) =>
        o
          .setName('locale')
          .setDescription('Language')
          .setRequired(true)
          .addChoices(
            { name: 'English', value: 'en' },
            { name: 'हिन्दी', value: 'hi' },
            { name: 'Hinglish', value: 'hinglish' },
          ),
      ),
  );
export default {
  category: 'general',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions?.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    const sub = i.options.getSubcommand();
    let description, files;
    if (sub === 'export') {
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify(c.guildConfig.get(i.guildId), null, 2) + '\n', 'utf8'),
          { name: 'emika-guild-delivery-config.json' },
        ),
      ];
      description = c.localization.t(i.guildId, 'configExported');
    } else if (sub === 'pause' || sub === 'resetdelivery') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('configDeliveryConfirm');
      if (sub === 'pause') c.guildConfig.pauseDelivery(i.guildId);
      else c.guildConfig.resetDelivery(i.guildId);
      description = c.localization.t(
        i.guildId,
        sub === 'pause' ? 'configDeliveryPaused' : 'configDeliveryReset',
      );
    } else if (sub === 'language') {
      const language = c.guildConfig.setLanguage(i.guildId, i.options.getString('locale', true));
      description = c.localization.t(i.guildId, 'languageSaved', { language });
    } else if (sub === 'view') {
      const cfg = c.guildConfig.get(i.guildId);
      const status = (value) => c.localization.t(i.guildId, value ? 'enabled' : 'disabled');
      description = c.localization.t(i.guildId, 'configSummary', {
        language: cfg.language,
        welcome: status(cfg.welcome.enabled),
        goodbye: status(cfg.welcome.goodbyeEnabled),
        logging: status(cfg.logging.enabled),
        memberEvents: status(c.config.memberEventsEnabled),
      });
    } else throw new UserError('unknownCommand');
    await i.editReply({
      ...(files ? { files } : {}),
      embeds: [
        lunaEmbed({
          title: c.localization.t(i.guildId, 'configTitle'),
          description,
          locale: c.localization.locale(i.guildId),
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};
