import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { isBotOwner } from '../../services/securityAccess.js';
import { validStreamUrl } from '../../services/botActivity.js';
const data = new SlashCommandBuilder()
  .setName('activity')
  .setDescription('Bot owner only: set or clear the bot status shown in all servers.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Set the bot activity.')
      .addStringOption((o) =>
        o
          .setName('type')
          .setDescription('Activity type')
          .setRequired(true)
          .addChoices(
            { name: 'playing', value: 'playing' },
            { name: 'watching', value: 'watching' },
            { name: 'listening', value: 'listening' },
            { name: 'competing', value: 'competing' },
            { name: 'streaming', value: 'streaming' },
          ),
      )
      .addStringOption((o) =>
        o.setName('text').setDescription('Status text').setRequired(true).setMaxLength(128),
      )
      .addStringOption((o) =>
        o
          .setName('url')
          .setDescription('Twitch or YouTube link, needed for streaming')
          .setMaxLength(200),
      ),
  )
  .addSubcommand((s) => s.setName('clear').setDescription('Remove the custom activity.'))
  .addSubcommand((s) => s.setName('show').setDescription('Show the saved activity.'));
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    // The presence is global, so server Administrators are not enough: owner or delegate only.
    if (
      !isBotOwner(c, i.user.id) &&
      !(i.guildId && c.securityAccess.delegated(i.guildId, i.user.id, 'activity'))
    )
      throw new UserError('activityDenied');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'set') {
      const type = i.options.getString('type', true),
        body = i.options.getString('text', true).trim(),
        url = i.options.getString('url');
      if (!body) throw new UserError('activityInvalid');
      if (type === 'streaming' && !validStreamUrl(url ?? '')) throw new UserError('activityUrl');
      c.botActivity.set(type, body, url);
      c.botActivity.apply(i.client);
      text = t('activitySet', { type, text: body });
    } else if (sub === 'clear') {
      c.botActivity.clear();
      c.botActivity.apply(i.client);
      text = t('activityCleared');
    } else {
      const a = c.botActivity.get();
      text = a ? t('activityShow', { type: a.type, text: a.text }) : t('activityNone');
    }
    await i.editReply(
      lunaPayload(
        { content: text, allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
