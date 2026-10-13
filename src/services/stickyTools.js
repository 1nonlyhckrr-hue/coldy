import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
// /sticky: a message Emika re-posts at the bottom of a channel every N messages.
// /muterole: one Muted role with Send/React/Speak denied in every channel.
// dmwarn: optional DM to a member when they are warned. All off until a mod sets them up.
const MAX_STICKY = 20;
export class Sticky {
  constructor(c) {
    this.c = c;
    this.count = new Map();
    this.busy = new Set();
  }
  get(g, ch) {
    return this.c.features.get(g, 'sticky', ch);
  }
  set(g, ch, text, every) {
    if (!this.get(g, ch) && this.c.features.count(g, 'sticky', '') >= MAX_STICKY)
      throw new UserError('stLimit');
    this.c.features.set(g, 'sticky', ch, { text, every, last: null });
    this.count.delete(ch);
  }
  remove(g, ch) {
    this.count.delete(ch);
    return this.c.features.del(g, 'sticky', ch);
  }
  list(g) {
    return this.c.features
      .list(g, 'sticky', '', MAX_STICKY)
      .map((r) => ({ ch: r.key, ...r.value }));
  }
}
export function createStickyHandler(c) {
  return async (m) => {
    try {
      if (!m.guild || m.author?.bot) return;
      const s = c.sticky.get(m.guild.id, m.channelId);
      if (!s || c.sticky.busy.has(m.channelId)) return;
      const n = (c.sticky.count.get(m.channelId) ?? 0) + 1;
      if (n < s.every) return c.sticky.count.set(m.channelId, n);
      c.sticky.count.set(m.channelId, 0);
      c.sticky.busy.add(m.channelId);
      try {
        if (s.last) await m.channel.messages.delete(s.last).catch(() => {});
        const sent = await m.channel.send(
          lunaPayload(
            { content: s.text, allowedMentions: { parse: [] } },
            { locale: c.localization.locale(m.guild.id) },
          ),
        );
        c.features.set(m.guild.id, 'sticky', m.channelId, { ...s, last: sent.id });
      } finally {
        c.sticky.busy.delete(m.channelId);
      }
    } catch {
      c.logger?.warn?.({ kind: 'sticky' }, 'Sticky unavailable');
    }
  };
}
export const DMWARN = { enabled: false };
export async function dmWarn(c, guild, targetId, reason, byId) {
  try {
    if (!c.features.config(guild.id, 'dmwarn', DMWARN).enabled) return false;
    const u = await guild.client.users.fetch(targetId);
    await u.send({
      content: c.localization.t(guild.id, 'dwMessage', {
        server: guild.name,
        reason: String(reason || '-').slice(0, 500),
        by: byId ? `<@${byId}>` : '-',
      }),
      allowedMentions: { parse: [] },
    });
    return true;
  } catch {
    return false;
  }
}
export const MUTE = { roleId: null };
export async function setupMuteRole(c, guild, { pace = 200, sleep }) {
  let role = guild.roles.cache.find((r) => r.name === 'Muted' && !r.managed);
  const existed = !!role;
  role ??= await guild.roles.create({
    name: 'Muted',
    permissions: [],
    reason: 'Emika muterole setup',
  });
  c.features.setConfig(guild.id, 'muterole', MUTE, { roleId: role.id });
  let done = 0,
    failed = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread?.() || !ch.permissionOverwrites) continue;
    try {
      await ch.permissionOverwrites.edit(
        role,
        {
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: false,
          Speak: false,
          CreatePublicThreads: false,
        },
        { reason: 'Emika muterole setup' },
      );
      done++;
    } catch {
      failed++;
    }
    await sleep(pace);
  }
  return { role, existed, done, failed };
}
