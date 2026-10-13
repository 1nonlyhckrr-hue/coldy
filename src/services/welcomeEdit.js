import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { UserError, handleInteractionError } from '../utils/errors.js';
// /welcome edit: a pop-up form pre-filled with the current welcome or goodbye text.
export const PREFIX = 'welcomeEdit';
export const MAX = 1800;
const KINDS = ['welcome', 'goodbye'];
export function currentText(settings, kind) {
  return kind === 'goodbye' ? settings.goodbyeMessage : settings.message;
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
    .setTitle(t('welcomeEditTitle').slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
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
      c.guildConfig.patch(
        i.guildId,
        'welcome',
        kind === 'goodbye'
          ? { goodbyeMessage: text, goodbyeCustom: true }
          : { message: text, messageCustom: true },
      );
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
