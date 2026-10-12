import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('enlarge')
    .setDescription(
      'Private high-resolution current guild custom emoji image;no foreign emoji/Unicode rendering.',
    )
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('emoji-id')
        .setDescription('Current custom emoji ID in this guild')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
    ),
  async execute(i, c) {
    const id = i.options.getString('emoji-id', true);
    if (!/^\d{17,20}$/.test(id) || i.guild?.id !== i.guildId)
      throw new UserError('emojiInfoInvalid');
    const emoji = await i.guild.emojis.fetch(id, { force: true });
    if (emoji?.id !== id || emoji.guild?.id !== i.guildId || typeof emoji.animated !== 'boolean')
      throw new UserError('emojiInfoInvalid');
    const url = emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png', size: 4096 });
    if (typeof url !== 'string') throw new UserError('emojiInfoInvalid');
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'cdn.discordapp.com' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname != '/emojis/' + id + (emoji.animated ? '.gif' : '.png')
    )
      throw new UserError('emojiInfoInvalid');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'enlargeResult'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale, image: url },
      ),
    );
  },
};
