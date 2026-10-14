import { renderTemplate } from './memberTemplate.js';
export { renderTemplate } from './memberTemplate.js';
import { z } from 'zod';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { translate } from './localization.js';
import { validateWelcomeAsset } from './welcomeAssets.js';
import { UserError } from '../utils/errors.js';
const id = z.string().regex(/^\d{17,20}$/);
const message = z.string().min(1).max(1800);
const asset = z.string().superRefine((value, ctx) => {
  try {
    validateWelcomeAsset(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid welcome asset' });
  }
});
export const guildConfigSchema = z
  .object({
    language: z.enum(['en', 'hi', 'hinglish']).default('en'),
    logging: z
      .object({
        events: z
          .array(
            z.enum([
              'memberjoin',
              'memberleave',
              'rolecreate',
              'roledelete',
              'roleupdate',
              'channelcreate',
              'channeldelete',
              'channelupdate',
            ]),
          )
          .max(8)
          .default([]),
        enabled: z.boolean().default(false),
        channelId: id.optional(),
      })
      .strict()
      .default({ enabled: false }),
    welcome: z
      .object({
        enabled: z.boolean().default(false),
        channelId: id.optional(),
        goodbyeChannelId: id.optional(),
        title: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^\u0000-\u001f\u007f@]+$/u)
          .optional(),
        mentionMember: z.boolean().default(true),
        goodbyeTitle: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^\u0000-\u001f\u007f@]+$/u)
          .optional(),
        image: asset.optional(),
        thumbnail: asset.optional(),
        goodbyeImage: asset.optional(),
        goodbyeThumbnail: asset.optional(),
        color: z.number().int().min(0).max(0xffffff).optional(),
        messageCustom: z.boolean().optional(),
        goodbyeCustom: z.boolean().optional(),
        message: message.default('Welcome {user} to {server}!'),
        goodbyeEnabled: z.boolean().default(false),
        goodbyeMessage: message.default('Goodbye {username}.'),
      })
      .strict()
      .default({
        enabled: false,
        message: 'Welcome {user} to {server}!',
        goodbyeEnabled: false,
        goodbyeMessage: 'Goodbye {username}.',
        mentionMember: true,
      }),
  })
  .strict();
export class GuildConfig {
  constructor(settings) {
    this.settings = settings;
  }
  get(guildId) {
    return guildConfigSchema.parse(this.settings.get(guildId));
  }
  patch(guildId, section, changes) {
    if (!['logging', 'welcome'].includes(section)) throw new UserError('configSectionUnknown');
    // Validate inside repository transaction so read/merge/write is atomic.
    return this.settings.db.transaction(() => {
      const current = this.get(guildId);
      const updated = guildConfigSchema.parse({
        ...current,
        [section]: { ...current[section], ...changes },
      });
      this.settings.set(guildId, updated);
      return updated[section];
    })();
  }
  pauseDelivery(guildId) {
    return this.settings.db.transaction(() => {
      const current = this.get(guildId);
      const next = guildConfigSchema.parse({
        ...current,
        welcome: { ...current.welcome, enabled: false, goodbyeEnabled: false },
        logging: { ...current.logging, enabled: false },
      });
      this.settings.set(guildId, next);
      return next;
    })();
  }
  resetDelivery(guildId) {
    return this.settings.db.transaction(() => {
      const current = this.get(guildId),
        defaults = guildConfigSchema.parse({});
      const next = { ...defaults, language: current.language };
      this.settings.set(guildId, next);
      return next;
    })();
  }
  setLanguage(guildId, language) {
    return this.settings.db.transaction(() => {
      const updated = guildConfigSchema.parse({ ...this.get(guildId), language });
      this.settings.set(guildId, updated);
      return language;
    })();
  }
  reset(guildId, section) {
    const defaults = guildConfigSchema.parse({});
    return this.patch(guildId, section, { ...defaults[section], channelId: undefined });
  }
}
export async function validateOutputChannel(guild, channelId) {
  let channel;
  try {
    channel = await guild.channels.fetch(channelId, { force: true });
  } catch {
    throw new UserError('channelFetchFailed');
  }
  if (
    !channel ||
    channel.id !== channelId ||
    channel.guildId !== guild.id ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  )
    throw new UserError('channelTypeInvalid');
  const bot = await guild.members.fetchMe({ force: true });
  if (
    !guild.client?.user?.id ||
    bot?.id !== guild.client.user.id ||
    bot.guild?.id !== guild.id ||
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])
  )
    throw new UserError('channelPermissionMissing');
  return channel;
}

export function renderGuildTemplate(settings, kind, member, locale = 'en') {
  const goodbye = kind === 'goodbye';
  const template = goodbye ? settings.goodbyeMessage : settings.message;
  const custom = goodbye ? settings.goodbyeCustom : settings.messageCustom;
  const originalDefault = goodbye ? 'Goodbye {username}.' : 'Welcome {user} to {server}!';
  // Legacy custom templates remain verbatim. New custom flags preserve intentional default-like text too.
  if (custom === true || (custom === undefined && template !== originalDefault))
    return renderTemplate(template, member);
  const vars = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: member.guild.name,
    count: String(member.guild.memberCount),
  };
  return translate(locale, goodbye ? 'defaultGoodbye' : 'defaultWelcome', vars).slice(0, 1900);
}
