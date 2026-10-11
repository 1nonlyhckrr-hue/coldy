import { translate } from '../services/localization.js';
import { EmbedBuilder } from 'discord.js';
export const LUNA_COLOR = 0x9b87f5;
const styles = {
  error: { title: 'Luna | Unable to complete', color: 0xed6a78 },
  success: { title: 'Luna | Complete', color: 0x74c69d },
  info: { title: 'Luna', color: LUNA_COLOR },
};
export function lunaEmbed({
  title,
  description,
  kind = 'info',
  fields = [],
  timestamp = false,
  locale = 'en',
  color,
  image,
  thumbnail,
} = {}) {
  const style = styles[kind] ?? styles.info;
  const embed = new EmbedBuilder()
    .setColor(color ?? style.color)
    .setTitle(
      (title ?? translate(locale, kind === 'error' ? 'embedErrorTitle' : 'embedInfoTitle')).slice(
        0,
        256,
      ),
    )
    .setFooter({ text: translate(locale, 'embedFooter') });
  if (description) embed.setDescription(description.slice(0, 4096));
  if (fields.length)
    embed.addFields(
      fields.slice(0, 25).map((f) => ({
        name: f.name.slice(0, 256),
        value: f.value.slice(0, 1024),
        inline: !!f.inline,
      })),
    );
  if (image) embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (timestamp) embed.setTimestamp();
  return embed;
}
export function lunaPayload(
  payload,
  { title, kind = 'info', timestamp = false, locale = 'en', color, image, thumbnail } = {},
) {
  if (typeof payload === 'string') payload = { content: payload };
  const { content, ...rest } = payload;
  if (!content) return rest;
  return {
    ...rest,
    embeds: [
      lunaEmbed({ title, description: content, kind, timestamp, locale, color, image, thumbnail }),
      ...(rest.embeds ?? []),
    ],
  };
}
