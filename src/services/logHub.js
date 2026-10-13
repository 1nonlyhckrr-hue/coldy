import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
// /logs: optional log channels per kind (mod actions, messages, joins, voice, roles, channels).
// Nothing is logged until a channel is set for that kind. Message content is only ever shown for
// messages Emika still has in cache; the log text is cut to a safe length.
export const LOG_KINDS = ['mod', 'msg', 'join', 'vc', 'role', 'channel'];
const FEATURE = 'logs';
const clip = (s, n = 700) => {
  const t = String(s ?? '').replace(/@(everyone|here)/g, '@\u200b$1');
  return t.length > n ? t.slice(0, n) + '...' : t;
};
export class LogHub {
  constructor(c) {
    this.c = c;
  }
  channelId(guildId, kind) {
    return this.c.features.get(guildId, FEATURE, 'config', {})[kind] ?? null;
  }
  set(guildId, kind, channelId) {
    const cfg = this.c.features.get(guildId, FEATURE, 'config', {});
    if (channelId) cfg[kind] = channelId;
    else delete cfg[kind];
    this.c.features.set(guildId, FEATURE, 'config', cfg);
    return cfg;
  }
  config(guildId) {
    return this.c.features.get(guildId, FEATURE, 'config', {});
  }
  /** Sends one localized line to the channel set for this kind. Returns false when not set or unavailable. */
  async send(guild, kind, key, params = {}) {
    const id = this.channelId(guild.id, kind);
    if (!id) return false;
    try {
      const channel = await validateOutputChannel(guild, id);
      const c = this.c;
      await channel.send(
        lunaPayload(
          {
            content: c.localization.t(guild.id, key, params).slice(0, 1900),
            allowedMentions: { parse: [] },
          },
          { locale: c.localization.locale(guild.id) },
        ),
      );
      return true;
    } catch {
      return false;
    }
  }
  mod(guild, e) {
    return this.send(guild, 'mod', 'lgMod', {
      actor: `<@${e.actor}>`,
      action: e.action,
      target: `<@${e.target}>`,
      reason: clip(e.reason, 300) || '-',
      caseId: e.caseId ?? '-',
    });
  }
}
/** All gateway handlers of /logs. Each is a no-op for a kind without a channel. */
export function createLogHandlers(c) {
  const hub = c.logHub;
  const guard =
    (fn) =>
    async (...a) => {
      try {
        await fn(...a);
      } catch {
        c.logger?.warn?.({ kind: 'log_hub' }, 'Log delivery unavailable');
      }
    };
  return {
    messageDelete: guard(async (m) => {
      if (!m.guild || m.author?.bot || !hub.channelId(m.guild.id, 'msg')) return;
      await hub.send(m.guild, 'msg', 'lgMsgDelete', {
        user: m.author ? `<@${m.author.id}>` : '?',
        channel: `<#${m.channelId}>`,
        content: clip(m.content) || '-',
      });
    }),
    messageUpdate: guard(async (before, after) => {
      if (!after.guild || after.author?.bot || !hub.channelId(after.guild.id, 'msg')) return;
      if (before.content == null || before.content === after.content) return;
      await hub.send(after.guild, 'msg', 'lgMsgEdit', {
        user: `<@${after.author?.id}>`,
        channel: `<#${after.channelId}>`,
        before: clip(before.content, 450),
        after: clip(after.content, 450),
      });
    }),
    memberAdd: guard(async (m) => {
      const days = Math.floor((Date.now() - m.user.createdTimestamp) / 86400000);
      await hub.send(m.guild, 'join', 'lgJoin', { user: `<@${m.id}>`, days });
    }),
    memberRemove: guard(async (m) => {
      await hub.send(m.guild, 'join', 'lgLeave', { user: `<@${m.id}>` });
    }),
    voice: guard(async (before, after) => {
      const guild = after.guild ?? before.guild;
      if (!guild || before.channelId === after.channelId || !hub.channelId(guild.id, 'vc')) return;
      const user = `<@${after.id ?? before.id}>`;
      if (!before.channelId)
        await hub.send(guild, 'vc', 'lgVcJoin', { user, channel: `<#${after.channelId}>` });
      else if (!after.channelId)
        await hub.send(guild, 'vc', 'lgVcLeave', { user, channel: `<#${before.channelId}>` });
      else
        await hub.send(guild, 'vc', 'lgVcMove', {
          user,
          from: `<#${before.channelId}>`,
          to: `<#${after.channelId}>`,
        });
    }),
    memberUpdate: guard(async (before, after) => {
      if (!hub.channelId(after.guild.id, 'role')) return;
      const had = new Set(before.roles.cache.keys()),
        has = new Set(after.roles.cache.keys());
      const added = [...has].filter((r) => !had.has(r)),
        removed = [...had].filter((r) => !has.has(r));
      const list = (a) => a.map((r) => `<@&${r}>`).join(' ');
      if (added.length)
        await hub.send(after.guild, 'role', 'lgRoleAdd', {
          user: `<@${after.id}>`,
          roles: list(added),
        });
      if (removed.length)
        await hub.send(after.guild, 'role', 'lgRoleRemove', {
          user: `<@${after.id}>`,
          roles: list(removed),
        });
    }),
    channel: guard(async (kind, ch, before) => {
      if (!ch.guild || !hub.channelId(ch.guild.id, 'channel')) return;
      if (kind === 'update' && before?.name === ch.name && before?.parentId === ch.parentId) return;
      await hub.send(ch.guild, 'channel', 'lgChan_' + kind, {
        name: clip(ch.name, 100),
        id: ch.id,
        old: clip(before?.name, 100),
      });
    }),
  };
}
