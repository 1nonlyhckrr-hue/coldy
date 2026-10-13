import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { validateWelcomeAsset } from './welcomeAssets.js';
// /welcome copy: read one message (text and first embed) and turn it into the welcome or goodbye
// template of this server. Placeholders from other bots are mapped to Emika's four.
export const LINK =
  /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/;
const MAP = {
  '{user}': [
    'user',
    'user.mention',
    'mention',
    'member',
    'member.mention',
    'user.ping',
    'ping',
    'usermention',
  ],
  '{username}': [
    'username',
    'user.name',
    'user.username',
    'member.name',
    'name',
    'user.tag',
    'usertag',
    'user.displayname',
    'member.displayname',
  ],
  '{server}': ['server', 'guild', 'server.name', 'guild.name', 'servername', 'guildname'],
  '{count}': [
    'count',
    'membercount',
    'member.count',
    'members',
    'server.members',
    'guild.members',
    'server.membercount',
    'guild.membercount',
    'server.member_count',
    'guild.member_count',
    'membercount.ordinal',
  ],
};
const LOOKUP = new Map(Object.entries(MAP).flatMap(([to, names]) => names.map((n) => [n, to])));
const PLACEHOLDER = /\{\{\s*([a-z_.]+)\s*\}\}|\{\s*([a-z_.]+)\s*\}|%([a-z_.]+)%|<([a-z_.]+)>/gi;
/** Maps known placeholders; leaves unknown ones as written and lists them. */
export function mapPlaceholders(text) {
  const unknown = new Set();
  const out = String(text ?? '').replace(PLACEHOLDER, (all, a, b, p, d) => {
    const name = (a ?? b ?? p ?? d).toLowerCase();
    const to = LOOKUP.get(name);
    if (to) return to;
    if (d !== undefined) return all;
    unknown.add(all);
    return all;
  });
  return { text: out.replace(/@(everyone|here)/g, '@\u200b$1'), unknown: [...unknown] };
}
/** Returns the fields that can be saved plus notes about what was dropped. */
export function convertMessage(msg, kind) {
  const embed = msg.embeds?.[0];
  const parts = [];
  if (msg.content) parts.push(msg.content);
  if (embed?.description) parts.push(embed.description);
  for (const f of embed?.fields ?? []) parts.push(`${f.name}: ${f.value}`);
  const joined = mapPlaceholders(parts.join('\n').trim());
  const unknown = new Set(joined.unknown);
  const set = {};
  const notes = [];
  if (!joined.text) throw new UserError('wcEmpty');
  const text = joined.text.slice(0, 1800);
  if (joined.text.length > 1800) notes.push('truncated');
  const goodbye = kind === 'goodbye';
  set[goodbye ? 'goodbyeMessage' : 'message'] = text;
  set[goodbye ? 'goodbyeCustom' : 'messageCustom'] = true;
  if (embed?.title) {
    const t = mapPlaceholders(embed.title);
    t.unknown.forEach((u) => unknown.add(u));
    const title = t.text
      .replace(/[\u0000-\u001f\u007f@]/gu, '')
      .trim()
      .slice(0, 120);
    if (title) set[goodbye ? 'goodbyeTitle' : 'title'] = title;
  }
  if (embed?.color != null && embed.color >= 0 && embed.color <= 0xffffff) set.color = embed.color;
  const asset = (url, field) => {
    if (!url) return;
    try {
      set[goodbye ? 'goodbye' + field[0].toUpperCase() + field.slice(1) : field] =
        validateWelcomeAsset(url);
      if (/[?&]ex=/.test(url)) notes.push('expiring');
    } catch {
      notes.push('badAsset');
    }
  };
  asset(embed?.image?.url ?? msg.attachments?.first?.()?.url, 'image');
  asset(embed?.thumbnail?.url, 'thumbnail');
  return { set, unknown: [...unknown], notes: [...new Set(notes)] };
}
/** Loads the message behind a link, only when the bot and the runner can both read that channel. */
export async function loadLinkedMessage(i, link) {
  const m = LINK.exec(String(link ?? '').trim());
  if (!m) throw new UserError('wcBadLink');
  const [, gid, cid, mid] = m;
  const g = i.client.guilds.cache.get(gid);
  const ch = g?.channels.cache.get(cid);
  const need = [P.ViewChannel, P.ReadMessageHistory];
  if (!g || !ch?.messages) throw new UserError('wcNoAccess');
  const [bot, who] = await Promise.all([
    g.members.fetchMe().catch(() => null),
    gid === i.guildId ? i.member : g.members.fetch(i.user.id).catch(() => null),
  ]);
  if (!bot || !who || !ch.permissionsFor(bot)?.has(need) || !ch.permissionsFor(who)?.has(need))
    throw new UserError('wcNoAccess');
  const msg = await ch.messages.fetch(mid).catch(() => null);
  if (!msg) throw new UserError('wcNoAccess');
  return msg;
}
