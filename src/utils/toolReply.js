import { MessageFlags } from 'discord.js';
import { lunaPayload } from './embeds.js';
import { UserError } from './errors.js';
/** Shared helpers for the moderation tool commands. */
export const tr = (i, c) => (key, params) => c.localization.t(i.guildId, key, params);
export async function say(i, c, key, params = {}, extra = {}) {
  const content = tr(i, c)(key, params);
  return i.editReply(
    lunaPayload(
      { content: content.slice(0, 3900), allowedMentions: { parse: [] }, ...extra },
      { locale: c.localization.locale(i.guildId) },
    ),
  );
}
export const begin = (i) => i.deferReply({ flags: MessageFlags.Ephemeral });
/** Throws unless the runner holds the Discord permission right now (checked live, not cached). */
export function needPerm(i, perm) {
  if (!i.memberPermissions?.has(perm)) throw new UserError('userPermission');
}
export const SNOWFLAKE = /^\d{17,20}$/;
/** Pulls user IDs out of free text: raw IDs, <@id> mentions, separated by space/comma/newline. */
export function parseIds(text, max = 50) {
  const ids = [...new Set(String(text ?? '').match(/\d{17,20}/g) ?? [])];
  if (!ids.length) throw new UserError('toolNoIds');
  if (ids.length > max) throw new UserError('toolTooManyIds', { max });
  return ids;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
