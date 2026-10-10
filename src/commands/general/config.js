import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { lunaEmbed } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View per-server setup and set Luna language.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
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
    const sub = i.options.getSubcommand();
    let description;
    if (sub === 'language') {
      const language = c.guildConfig.setLanguage(i.guildId, i.options.getString('locale', true));
      description = c.localization.t(i.guildId, 'languageSaved', { language });
    } else {
      const cfg = c.guildConfig.get(i.guildId);
      const status = (value) => c.localization.t(i.guildId, value ? 'enabled' : 'disabled');
      description = c.localization.t(i.guildId, 'configSummary', {
        language: cfg.language,
        welcome: status(cfg.welcome.enabled),
        goodbye: status(cfg.welcome.goodbyeEnabled),
        logging: status(cfg.logging.enabled),
        memberEvents: status(c.config.memberEventsEnabled),
      });
    }
    await i.reply({
      embeds: [
        lunaEmbed({
          title: c.localization.t(i.guildId, 'configTitle'),
          description,
          locale: c.localization.locale(i.guildId),
        }),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
