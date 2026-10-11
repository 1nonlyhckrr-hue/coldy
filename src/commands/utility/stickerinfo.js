import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const formats = { 1: 'PNG', 2: 'APNG', 3: 'Lottie JSON', 4: 'GIF' };
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('stickerinfo')
    .setDescription('Read current server sticker metadata,no uploader or file download.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('sticker-id')
        .setDescription('Sticker ID in this server')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    ),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = i.options.getString('sticker-id', true);
    if (!/^\d{17,20}$/.test(id)) throw new UserError('stickerInfoInvalid');
    const sticker = await i.guild.stickers.fetch(id, { force: true });
    if (
      !sticker ||
      sticker.id !== id ||
      sticker.guildId !== i.guildId ||
      sticker.type !== 2 ||
      typeof sticker.name !== 'string' ||
      !formats[sticker.format] ||
      (sticker.available !== null &&
        sticker.available !== undefined &&
        typeof sticker.available !== 'boolean')
    )
      throw new UserError('stickerInfoInvalid');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      text = t('stickerInfoValue', {
        name: escapeMarkdown(sticker.name),
        id,
        format: formats[sticker.format],
        available: t(
          sticker.available === true
            ? 'enabled'
            : sticker.available === false
              ? 'disabled'
              : 'stickerAvailableUnknown',
        ),
      });
    await i.editReply(
      lunaPayload(
        { content: text, allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
