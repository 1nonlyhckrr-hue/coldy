import { UserError } from '../utils/errors.js';
// /watchlist: log everything a suspect member says (and their voice moves) to the modlog channel,
// and keep a member's nickname locked. Both are per-server, set by hand, and off for everyone else.
const clip = (s, n = 800) => {
  const t = String(s ?? '').replace(/@(everyone|here)/g, '@\u200b$1');
  return t.length > n ? t.slice(0, n) + '...' : t;
};
export class Watch {
  constructor(c) {
    this.c = c;
  }
  watched(guildId, userId) {
    return this.c.features.get(guildId, 'watch', 'user:' + userId);
  }
  add(guildId, userId, by) {
    if (!this.c.logHub.channelId(guildId, 'mod')) throw new UserError('wlNoModlog');
    if (this.c.features.count(guildId, 'watch', 'user:') >= 50 && !this.watched(guildId, userId))
      throw new UserError('wlLimit');
    this.c.features.set(guildId, 'watch', 'user:' + userId, { by, at: Date.now() });
  }
  remove(guildId, userId) {
    return this.c.features.del(guildId, 'watch', 'user:' + userId);
  }
  list(guildId) {
    return this.c.features.list(guildId, 'watch', 'user:', 50).map((r) => r.key.slice(5));
  }
  lockNick(guildId, userId, nick) {
    if (this.c.features.count(guildId, 'nicklock', '') >= 50 && !this.locked(guildId, userId))
      throw new UserError('wlLimit');
    this.c.features.set(guildId, 'nicklock', userId, { nick });
  }
  unlockNick(guildId, userId) {
    return this.c.features.del(guildId, 'nicklock', userId);
  }
  locked(guildId, userId) {
    return this.c.features.get(guildId, 'nicklock', userId);
  }
}
export function createWatchHandlers(c) {
  const w = c.watch,
    guard =
      (fn) =>
      async (...a) => {
        try {
          await fn(...a);
        } catch {
          c.logger?.warn?.({ kind: 'watch' }, 'Watch action unavailable');
        }
      };
  return {
    message: guard(async (m) => {
      if (!m.guild || !m.author || m.author.bot || !w.watched(m.guild.id, m.author.id)) return;
      await c.logHub.send(m.guild, 'mod', 'wlMessage', {
        user: `<@${m.author.id}>`,
        channel: `<#${m.channelId}>`,
        content: clip(m.content) || '-',
      });
    }),
    voice: guard(async (before, after) => {
      const guild = after.guild ?? before.guild;
      if (!guild || before.channelId === after.channelId) return;
      const id = after.id ?? before.id;
      if (!w.watched(guild.id, id)) return;
      await c.logHub.send(guild, 'mod', 'wlVoice', {
        user: `<@${id}>`,
        from: before.channelId ? `<#${before.channelId}>` : '-',
        to: after.channelId ? `<#${after.channelId}>` : '-',
      });
    }),
    nick: guard(async (before, after) => {
      const lock = w.locked(after.guild.id, after.id);
      if (!lock || (after.nickname ?? null) === lock.nick) return;
      await after.setNickname(lock.nick, 'Emika nicklock');
    }),
  };
}
