import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('emojiinfo')
    .setDescription('Read one current server custom emoji,no uploader or role enumeration.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('emoji-id')
        .setDescription('Custom emoji ID in this server')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    ),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = i.options.getString('emoji-id', true);
    if (!/^\d{17,20}$/.test(id)) throw new UserError('emojiInfoInvalid');
    const emoji = await i.guild.emojis.fetch(id, { force: true });
    if (
      !emoji ||
      emoji.id !== id ||
      emoji.guild?.id !== i.guildId ||
      typeof emoji.name !== 'string' ||
      typeof emoji.animated !== 'boolean' ||
      typeof emoji.managed !== 'boolean'
    )
      throw new UserError('emojiInfoInvalid');
    const locale = c.localization.locale(i.guildId),
      url = emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png', size: 128 });
    if (typeof url !== 'string' || !url.startsWith('https://cdn.discordapp.com/'))
      throw new UserError('emojiInfoInvalid');
    const text = c.localization.t(i.guildId, 'emojiInfoValue', {
      name: escapeMarkdown(emoji.name),
      id,
      animated: c.localization.t(i.guildId, emoji.animated ? 'enabled' : 'disabled'),
      managed: c.localization.t(i.guildId, emoji.managed ? 'enabled' : 'disabled'),
      url,
    });
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
