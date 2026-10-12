import { randomUUID } from 'node:crypto';
import { ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
const DAY = 86400000;
export class VoiceRanks {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.sessions = new Map();
    this.active = new Set();
  }
  config(g) {
    return (
      this.db.prepare('SELECT enabled,revision FROM voice_rank_config WHERE guild_id=?').get(g) ?? {
        enabled: 0,
        revision: null,
      }
    );
  }
  enable(g, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid state');
    this.db
      .prepare(
        'INSERT INTO voice_rank_config VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision',
      )
      .run(g, Number(enabled), randomUUID());
    for (const [k, s] of this.sessions) if (s.guild.id === g) this.sessions.delete(k);
  }
  optedOut(g, u) {
    return !!this.db
      .prepare('SELECT user_id FROM voice_rank_privacy WHERE guild_id=? AND user_id=?')
      .get(g, u);
  }
  privacy(g, u, out) {
    if (!/^\d{17,20}$/.test(u) || typeof out !== 'boolean') throw new UserError('voiceRankInput');
    this.db.transaction(() => {
      if (out) {
        this.db.prepare('INSERT OR IGNORE INTO voice_rank_privacy VALUES(?,?)').run(g, u);
        this.resetMine(g, u);
      } else
        this.db.prepare('DELETE FROM voice_rank_privacy WHERE guild_id=? AND user_id=?').run(g, u);
    })();
  }
  resetMine(g, u) {
    this.sessions.delete(g + ':' + u);
    return this.db.prepare('DELETE FROM voice_rank_days WHERE guild_id=? AND user_id=?').run(g, u)
      .changes;
  }
  cleanup() {
    const cutoff = new Date(this.now() - 89 * DAY).toISOString().slice(0, 10);
    this.db.prepare('DELETE FROM voice_rank_days WHERE day<?').run(cutoff);
  }
  record(g, u, start, end) {
    if (
      ![start, end].every(Number.isSafeInteger) ||
      start < 0 ||
      end <= start ||
      end - start > 120000
    )
      throw new UserError('voiceRankInput');
    this.db.transaction(() => {
      let at = start;
      while (at < end) {
        const day = new Date(at).toISOString().slice(0, 10),
          next = Math.min(end, (Math.floor(at / DAY) + 1) * DAY);
        this.db
          .prepare(
            'INSERT INTO voice_rank_days VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id,day) DO UPDATE SET milliseconds=MIN(86400000,milliseconds+excluded.milliseconds)',
          )
          .run(g, u, day, next - at);
        at = next;
      }
    })();
  }
  stats(g, u) {
    this.cleanup();
    const today = new Date(this.now()).toISOString().slice(0, 10),
      week = new Date(this.now() - 6 * DAY).toISOString().slice(0, 10);
    return this.db
      .prepare(
        'SELECT COALESCE(SUM(milliseconds),0) retained,COALESCE(SUM(CASE WHEN day=? THEN milliseconds ELSE 0 END),0) today,COALESCE(SUM(CASE WHEN day>=? THEN milliseconds ELSE 0 END),0) week FROM voice_rank_days WHERE guild_id=? AND user_id=?',
      )
      .get(today, week, g, u);
  }
  top(g, period = 'week', page = 1) {
    if (
      !['today', 'week', 'retained'].includes(period) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000
    )
      throw new UserError('voiceRankInput');
    this.cleanup();
    const days = { today: 0, week: 6, retained: 89 },
      cutoff = new Date(this.now() - days[period] * DAY).toISOString().slice(0, 10);
    return this.db
      .prepare(
        'SELECT user_id,SUM(milliseconds) milliseconds FROM voice_rank_days WHERE guild_id=? AND day>=? GROUP BY user_id ORDER BY milliseconds DESC,user_id LIMIT 10 OFFSET ?',
      )
      .all(g, cutoff, (page - 1) * 10);
  }
}
async function snapshot(state) {
  const guild = state.guild;
  const [member, voice, channel] = await Promise.all([
    guild.members.fetch({ user: state.id, force: true }),
    guild.voiceStates.fetch(state.id, { force: true }),
    guild.channels.fetch(state.channelId, { force: true }),
  ]);
  if (
    member?.id !== state.id ||
    member.guild?.id !== guild.id ||
    member.user?.bot !== false ||
    voice?.id !== state.id ||
    voice.guild?.id !== guild.id ||
    voice.channelId !== state.channelId ||
    channel?.id !== state.channelId ||
    channel.guildId !== guild.id ||
    channel.type !== ChannelType.GuildVoice ||
    guild.afkChannelId === channel.id
  )
    throw new UserError('voiceRankUnavailable');
  return true;
}
export function createVoiceRankHandler(c) {
  return async (old, state) => {
    if (
      c.config.voiceEventsEnabled !== true ||
      !state?.guild ||
      old?.guild?.id !== state.guild.id ||
      old.id !== state.id ||
      !/^\d{17,20}$/.test(state.id)
    )
      return;
    const r = c.voiceRanks,
      key = state.guild.id + ':' + state.id;
    if (old.channelId === state.channelId) return;
    // Disconnection/move ends sampling without crediting an unobserved tail.
    r.sessions.delete(key);
    if (
      !/^\d{17,20}$/.test(state.channelId ?? '') ||
      !r.config(state.guild.id).enabled ||
      r.optedOut(state.guild.id, state.id)
    )
      return;
    if (
      r.sessions.size >= 1000 ||
      [...r.sessions.values()].filter((s) => s.guild.id === state.guild.id).length >= 100
    )
      return;
    const policy = r.config(state.guild.id);
    if (r.active.has(key)) return;
    r.active.add(key);
    try {
      await snapshot(state);
      if (
        c.config.voiceEventsEnabled !== true ||
        r.config(state.guild.id).revision !== policy.revision ||
        r.optedOut(state.guild.id, state.id)
      )
        return;
      if (
        r.sessions.size >= 1000 ||
        [...r.sessions.values()].filter((s) => s.guild.id === state.guild.id).length >= 100
      )
        return;
      r.sessions.set(key, {
        guild: state.guild,
        id: state.id,
        channelId: state.channelId,
        at: r.now(),
        revision: policy.revision,
      });
    } catch {
    } finally {
      r.active.delete(key);
    }
  };
}
export async function sampleVoiceRanks(c) {
  const r = c.voiceRanks;
  for (const [key, s] of [...r.sessions]) {
    if (r.active.has(key)) continue;
    r.active.add(key);
    try {
      if (
        c.config.voiceEventsEnabled !== true ||
        !r.config(s.guild.id).enabled ||
        r.config(s.guild.id).revision !== s.revision ||
        r.optedOut(s.guild.id, s.id)
      ) {
        r.sessions.delete(key);
        continue;
      }
      const before = r.now();
      await snapshot(s);
      const end = r.now();
      if (
        r.sessions.get(key) !== s ||
        c.config.voiceEventsEnabled !== true ||
        r.config(s.guild.id).revision !== s.revision ||
        r.optedOut(s.guild.id, s.id)
      )
        continue;
      if (before >= s.at && end > s.at && end - s.at <= 120000 && end - before <= 10000)
        r.record(s.guild.id, s.id, s.at, end);
      s.at = end;
    } catch {
      r.sessions.delete(key);
    } finally {
      r.active.delete(key);
    }
  }
  r.cleanup();
}
