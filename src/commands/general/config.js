import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
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
    let description;
    if (sub === 'language') {
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
