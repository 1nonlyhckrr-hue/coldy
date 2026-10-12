import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
// Panic mode. Only ever runs when an admin uses /lockdown; nothing here is automatic.
const TEXT_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);
const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
const TEXT_FLAGS = ['SendMessages', 'SendMessagesInThreads'];
const VOICE_FLAGS = ['Connect'];
export function lockdownFlags(channel) {
  if (TEXT_TYPES.has(channel.type)) return TEXT_FLAGS;
  if (VOICE_TYPES.has(channel.type)) return VOICE_FLAGS;
  return [];
}
/** Exact three-state value of each flag in the @everyone overwrite: true allow, false deny, null unset. */
export function readOverwrite(channel, everyoneId, flags) {
  const o = channel.permissionOverwrites?.cache?.get?.(everyoneId),
    prev = {};
  for (const f of flags)
    prev[f] = o?.allow?.has?.(P[f]) ? true : o?.deny?.has?.(P[f]) ? false : null;
  return prev;
}
export class Lockdown {
  constructor(db) {
    this.db = db;
  }
  get(guildId) {
    const r = this.db.prepare('SELECT * FROM lockdown_state WHERE guild_id=?').get(guildId);
    return r ? { startedAt: r.started_at, channels: JSON.parse(r.snapshot_json) } : null;
  }
  save(guildId, channels) {
    this.db
      .prepare('INSERT INTO lockdown_state VALUES(?,?,?)')
      .run(guildId, Date.now(), JSON.stringify(channels));
  }
  clear(guildId) {
    this.db.prepare('DELETE FROM lockdown_state WHERE guild_id=?').run(guildId);
  }
}
/** Saves the previous overwrites first, then denies the flags for @everyone. Re-run safe: refuses while active. */
export async function startLockdown(guild, store) {
  if (store.get(guild.id)) throw new UserError('lockdownActive');
  await guild.channels.fetch();
  const snapshot = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread?.() || !ch.permissionOverwrites?.edit) continue;
    const flags = lockdownFlags(ch);
    if (flags.length) snapshot.push({ id: ch.id, prev: readOverwrite(ch, guild.id, flags) });
  }
  store.save(guild.id, snapshot);
  let locked = 0,
    failed = 0;
  for (const s of snapshot) {
    const ch = guild.channels.cache.get(s.id),
      edit = Object.fromEntries(Object.keys(s.prev).map((f) => [f, false]));
    try {
      await ch.permissionOverwrites.edit(guild.id, edit, { reason: 'Emika lockdown' });
      locked++;
    } catch {
      failed++;
    }
  }
  return { locked, failed };
}
/** Puts each touched flag back to exactly its saved allow/deny/unset value. */
export async function endLockdown(guild, store) {
  const state = store.get(guild.id);
  if (!state) throw new UserError('lockdownNotActive');
  await guild.channels.fetch();
  let restored = 0,
    failed = 0,
    gone = 0;
  for (const s of state.channels) {
    const ch = guild.channels.cache.get(s.id);
    if (!ch) {
      gone++;
      continue;
    }
    try {
      await ch.permissionOverwrites.edit(guild.id, s.prev, { reason: 'Emika unlockdown' });
      restored++;
    } catch {
      failed++;
    }
  }
  // Keep the record if anything failed so /unlockdown can be run again.
  if (!failed) store.clear(guild.id);
  return { restored, failed, gone };
}
