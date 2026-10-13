import { lunaPayload } from '../utils/embeds.js';
// /snipe: remembers the last deleted and edited message per channel (memory only, never saved to disk)
// and reports ghost pings. Off by default per server; nothing is cached while it is off.
export const SNIPE = { enabled: false, ghostping: false };
const KEEP_MS = 3600000,
  MAX_CHANNELS = 500;
const clip = (s, n = 1500) => {
  const t = String(s ?? '').replace(/@(everyone|here)/g, '@\u200b$1');
  return t.length > n ? t.slice(0, n) + '...' : t;
};
export const snipeConfig = (c, g) => c.features.config(g, 'snipe', SNIPE);
export class SnipeCache {
  constructor(now = Date.now) {
    this.now = now;
    this.deleted = new Map();
    this.edited = new Map();
  }
  put(map, channelId, entry) {
    map.delete(channelId);
    map.set(channelId, { ...entry, at: this.now() });
    while (map.size > MAX_CHANNELS) map.delete(map.keys().next().value);
  }
  get(map, channelId) {
    const e = map.get(channelId);
    if (!e) return null;
    if (this.now() - e.at > KEEP_MS) {
      map.delete(channelId);
      return null;
    }
    return e;
  }
  lastDeleted(channelId) {
    return this.get(this.deleted, channelId);
  }
  lastEdited(channelId) {
    return this.get(this.edited, channelId);
  }
  forgetGuild(guildId) {
    for (const m of [this.deleted, this.edited])
      for (const [k, v] of m) if (v.guildId === guildId) m.delete(k);
  }
}
export function mentionedOf(m) {
  const users = [...(m.mentions?.users?.keys?.() ?? [])].filter((id) => id !== m.author?.id),
    roles = [...(m.mentions?.roles?.keys?.() ?? [])];
  return { users, roles, everyone: m.mentions?.everyone === true };
}
export function createSnipeHandlers(c) {
  const guard =
    (fn) =>
    async (...a) => {
      try {
        await fn(...a);
      } catch {
        c.logger?.warn?.({ kind: 'snipe' }, 'Snipe action unavailable');
      }
    };
  return {
    delete: guard(async (m) => {
      if (!m.guild || m.author?.bot) return;
      const cfg = snipeConfig(c, m.guild.id);
      if (!cfg.enabled && !cfg.ghostping) return;
      if (m.partial || !m.author) return;
      if (cfg.enabled && (m.content || m.attachments?.size))
        c.snipe.put(c.snipe.deleted, m.channelId, {
          guildId: m.guild.id,
          authorId: m.author.id,
          content: clip(m.content),
          files: m.attachments?.size ?? 0,
        });
      if (!cfg.ghostping) return;
      const who = mentionedOf(m);
      if (!who.users.length && !who.roles.length && !who.everyone) return;
      if (Date.now() - m.createdTimestamp > 120000) return;
      const list = [
        ...who.users.map((id) => `<@${id}>`),
        ...who.roles.map((id) => `<@&${id}>`),
        ...(who.everyone ? ['@\u200beveryone'] : []),
      ]
        .slice(0, 15)
        .join(' ');
      await m.channel.send(
        lunaPayload(
          {
            content: c.localization.t(m.guild.id, 'snGhost', { user: `<@${m.author.id}>`, list }),
            allowedMentions: { parse: [] },
          },
          { locale: c.localization.locale(m.guild.id) },
        ),
      );
    }),
    update: guard(async (before, after) => {
      const m = after.guild ? after : before;
      if (!m.guild || before.partial || before.author?.bot || !snipeConfig(c, m.guild.id).enabled)
        return;
      if (before.content === after.content || !before.content) return;
      c.snipe.put(c.snipe.edited, m.channelId, {
        guildId: m.guild.id,
        authorId: before.author.id,
        content: clip(before.content),
        now: clip(after.content),
      });
    }),
  };
}
