import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { translate } from './localization.js';
import { validateWelcomeAsset } from './welcomeAssets.js';
import { lunaPayload } from '../utils/embeds.js';
import { UserError, handleInteractionError } from '../utils/errors.js';
// /welcome edit: a pop-up form pre-filled with the current welcome or goodbye text.
export const PREFIX = 'welcomeEdit';
export const MAX = 1800;
const KINDS = ['welcome', 'goodbye'];
export function currentText(settings, kind) {
  return kind === 'goodbye' ? settings.goodbyeMessage : settings.message;
}
export function currentImage(settings, kind) {
  return (kind === 'goodbye' ? settings.goodbyeImage : settings.image) ?? '';
}
export function buildModal(kind, userId, settings, locale) {
  if (!KINDS.includes(kind)) throw new UserError('unknownCommand');
  const t = (k) => translate(locale, k);
  const input = new TextInputBuilder()
    .setCustomId('text')
    .setLabel(
      t(kind === 'goodbye' ? 'welcomeEditLabelGoodbye' : 'welcomeEditLabelWelcome').slice(0, 45),
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(MAX)
    .setValue(currentText(settings, kind).slice(0, MAX));
  return new ModalBuilder()
    .setCustomId(`${PREFIX}:${kind}:${userId}`)
    .setTitle(t(kind === 'goodbye' ? 'goodbyeEditTitle' : 'welcomeEditTitle').slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(input),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('image')
          .setLabel(t('welcomeEditLabelImage').slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
          .setValue(currentImage(settings, kind).slice(0, 1000)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel(t('welcomeEditLabelTitle').slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(120)
          .setValue((kind === 'goodbye' ? settings.goodbyeTitle : settings.title) ?? ''),
      ),
    );
}
export function createWelcomeEditHandler(c) {
  return async (i) => {
    if (!i.isModalSubmit?.() || !i.customId.startsWith(PREFIX + ':')) return;
    try {
      const [, kind, userId] = i.customId.split(':');
      if (!KINDS.includes(kind) || userId !== i.user.id || !i.guildId)
        throw new UserError('unknownCommand');
      const member = await i.guild.members
        .fetch({ user: i.user.id, force: true })
        .catch(() => null);
      if (!member?.permissions?.has(P.ManageGuild)) throw new UserError('userPermission');
      const text = String(i.fields.getTextInputValue('text') ?? '').trim();
      if (!text || text.length > MAX) throw new UserError('welcomeEditInvalid');
      let rawTitle;
      try {
        rawTitle = i.fields.getTextInputValue('title');
      } catch {
        rawTitle = undefined;
      }
      rawTitle = typeof rawTitle === 'string' ? rawTitle.trim() : undefined;
      if (rawTitle && (rawTitle.length > 120 || /[\u0000-\u001f\u007f@]/u.test(rawTitle)))
        throw new UserError('welcomeTitleInvalid');
      const title =
        rawTitle === undefined
          ? {}
          : { [kind === 'goodbye' ? 'goodbyeTitle' : 'title']: rawTitle || undefined };
      let rawImage;
      try {
        rawImage = i.fields.getTextInputValue('image');
      } catch {
        rawImage = undefined; // a form opened before this field existed
      }
      rawImage = typeof rawImage === 'string' ? rawImage.trim() : undefined;
      const imageKey = kind === 'goodbye' ? 'goodbyeImage' : 'image';
      const image =
        rawImage === undefined
          ? {}
          : { [imageKey]: rawImage ? validateWelcomeAsset(rawImage) : undefined };
      c.guildConfig.patch(i.guildId, 'welcome', {
        ...(kind === 'goodbye'
          ? { goodbyeMessage: text, goodbyeCustom: true }
          : { message: text, messageCustom: true }),
        ...image,
        ...title,
      });
      const locale = c.guildConfig.get(i.guildId).language;
      await i.reply(
        lunaPayload(
          {
            content: translate(
              locale,
              kind === 'goodbye' ? 'welcomeEditSavedGoodbye' : 'welcomeTemplateSaved',
            ),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
          { locale },
        ),
      );
    } catch (error) {
      await handleInteractionError(error, i, c.logger, c.localization);
    }
  };
}
