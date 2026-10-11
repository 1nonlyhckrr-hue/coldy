import { UserError } from '../utils/errors.js';
const DAY = 86400000;
export const utcDay = (milliseconds) => new Date(milliseconds).toISOString().slice(0, 10);
export class MessageRanks {
  constructor(db) {
    this.db = db;
    this.lastCleanup = 0;
  }
  config(guildId) {
    const row = this.db
      .prepare('SELECT enabled,excluded_json FROM message_rank_config WHERE guild_id=?')
      .get(guildId);
    return { enabled: !!row?.enabled, excluded: row ? JSON.parse(row.excluded_json) : [] };
  }
  enable(guildId, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid tracking state');
    this.db
      .prepare(
        'INSERT INTO message_rank_config(guild_id,enabled) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled',
      )
      .run(guildId, enabled ? 1 : 0);
  }
  exclude(guildId, channelId, excluded) {
    if (!/^\d{17,20}$/.test(channelId) || typeof excluded !== 'boolean')
      throw new UserError('rankChannelInvalid');
    return this.db.transaction(() => {
      const cfg = this.config(guildId),
        set = new Set(cfg.excluded);
      if (excluded) set.add(channelId);
      else set.delete(channelId);
      if (set.size > 50) throw new UserError('rankExcludeLimit');
      this.db
        .prepare(
          'INSERT INTO message_rank_config VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET excluded_json=excluded.excluded_json',
        )
        .run(guildId, cfg.enabled ? 1 : 0, JSON.stringify([...set]));
    })();
  }
  clearExclusions(guildId) {
    return this.db.transaction(() => {
      const cfg = this.config(guildId);
      const count = cfg.excluded.length;
      this.db
        .prepare("UPDATE message_rank_config SET excluded_json='[]' WHERE guild_id=?")
        .run(guildId);
      return count;
    })();
  }
  resetPolicy(guildId) {
    this.db.prepare('DELETE FROM message_rank_config WHERE guild_id=?').run(guildId);
  }
  optedOut(guildId, userId) {
    return !!this.db
      .prepare('SELECT opted_out FROM message_rank_privacy WHERE guild_id=? AND user_id=?')
      .get(guildId, userId)?.opted_out;
  }
  privacy(guildId, userId, optedOut) {
    if (!/^\d{17,20}$/.test(userId) || typeof optedOut !== 'boolean')
      throw new UserError('rankUserInvalid');
    return this.db.transaction(() => {
      if (optedOut) {
        this.db
          .prepare(
            'INSERT INTO message_rank_privacy VALUES(?,?,1) ON CONFLICT(guild_id,user_id) DO UPDATE SET opted_out=1',
          )
          .run(guildId, userId);
        return this.resetMine(guildId, userId);
      }
      this.db
        .prepare('DELETE FROM message_rank_privacy WHERE guild_id=? AND user_id=?')
        .run(guildId, userId);
      return 0;
    })();
  }
  record(message, now = Date.now()) {
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !message.guildId ||
      !/^\d{17,20}$/.test(message.author?.id ?? '') ||
      message.author.bot !== false ||
      message.system ||
      message.webhookId ||
      !/^\d{17,20}$/.test(message.id) ||
      !Number.isFinite(message.createdTimestamp) ||
      message.createdTimestamp < now - 300000 ||
      message.createdTimestamp > now + 30000
    )
      return false;
    const cfg = this.config(message.guildId);
    if (
      this.optedOut(message.guildId, message.author.id) ||
      !cfg.enabled ||
      cfg.excluded.includes(message.channelId) ||
      cfg.excluded.includes(message.channel?.parentId) ||
      cfg.excluded.includes(message.channel?.parent?.parentId)
    )
      return false;
    if (now - this.lastCleanup > 3600000) {
      this.cleanup(now);
      this.lastCleanup = now;
    }
    return this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM message_rank_seen WHERE message_id=?').get(message.id))
        return false;
      const day = utcDay(message.createdTimestamp),
        row = this.db
          .prepare('SELECT count FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day=?')
          .get(message.guildId, message.author.id, day);
      // Bound storage growth and spam contribution. This is a message metric, never activity quality.
      if (
        !row &&
        this.db
          .prepare('SELECT count(*) n FROM message_rank_daily WHERE guild_id=? AND day=?')
          .get(message.guildId, day).n >= 10000
      )
        return false;
      if (row?.count >= 10000) return false;
      this.db.prepare('INSERT INTO message_rank_seen VALUES(?,?)').run(message.id, now);
      this.db
        .prepare(
          'INSERT INTO message_rank_daily VALUES(?,?,?,1) ON CONFLICT(guild_id,user_id,day) DO UPDATE SET count=count+1',
        )
        .run(message.guildId, message.author.id, day);
      return true;
    })();
  }
  cleanup(now = Date.now()) {
    return this.db.transaction(() => {
      this.db.prepare('DELETE FROM message_rank_seen WHERE created_at<?').run(now - 7 * DAY);
      this.db.prepare('DELETE FROM message_rank_daily WHERE day<?').run(utcDay(now - 89 * DAY));
    })();
  }
  since(period, now) {
    if (!['today', 'week', 'retained'].includes(period)) throw new UserError('rankPeriodInvalid');
    return utcDay(now - (period === 'week' ? 6 : period === 'retained' ? 89 : 0) * DAY);
  }
  top(guildId, period, page = 1, now = Date.now()) {
    const since = this.since(period, now);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000)
      throw new UserError('rankPageInvalid');
    const total = this.db
        .prepare(
          'SELECT count(DISTINCT user_id) n FROM message_rank_daily WHERE guild_id=? AND day>=? AND day<=?',
        )
        .get(guildId, since, utcDay(now)).n,
      pages = Math.max(1, Math.ceil(total / 10));
    if (page > pages) throw new UserError('rankPageInvalid');
    const rows = this.db
      .prepare(
        'SELECT user_id,SUM(count) total FROM message_rank_daily WHERE guild_id=? AND day>=? AND day<=? GROUP BY user_id ORDER BY total DESC,user_id ASC LIMIT 10 OFFSET ?',
      )
      .all(guildId, since, utcDay(now), (page - 1) * 10);
    return { rows, pages, page };
  }
  position(guildId, userId, period, now = Date.now()) {
    const since = this.since(period, now);
    const total = this.db
      .prepare(
        'SELECT COALESCE(SUM(count),0) total FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=? AND day<=?',
      )
      .get(guildId, userId, since, utcDay(now)).total;
    if (total === 0) return { position: null, total: 0 };
    const ahead = this.db
      .prepare(
        'SELECT count(*) n FROM (SELECT user_id,SUM(count) total FROM message_rank_daily WHERE guild_id=? AND day>=? AND day<=? GROUP BY user_id) WHERE total>? OR (total=? AND user_id<?)',
      )
      .get(guildId, since, utcDay(now), total, total, userId).n;
    return { position: ahead + 1, total };
  }
  stats(guildId, userId, now = Date.now()) {
    const result = {};
    for (const period of ['today', 'week', 'retained'])
      result[period] = this.db
        .prepare(
          'SELECT COALESCE(SUM(count),0) total FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=? AND day<=?',
        )
        .get(guildId, userId, this.since(period, now), utcDay(now)).total;
    return result;
  }
  daily(guildId, userId, page = 1, now = Date.now()) {
    if (!Number.isInteger(page) || page < 1 || page > 9) throw new UserError('rankPageInvalid');
    const anchor = Date.parse(utcDay(now) + 'T00:00:00Z'),
      days = Array.from({ length: 10 }, (_, n) => utcDay(anchor - ((page - 1) * 10 + n) * DAY));
    const rows = this.db
      .prepare(
        'SELECT day,count FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=? AND day<=? ORDER BY day DESC',
      )
      .all(guildId, userId, days.at(-1), days[0]);
    const counts = new Map(rows.map((r) => [r.day, r.count]));
    return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
  }
  activity(guildId, userId, now = Date.now()) {
    const today = utcDay(now),
      since = this.since('retained', now),
      rows = this.db
        .prepare(
          'SELECT day,count FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=? AND day<=? ORDER BY day',
        )
        .all(guildId, userId, since, today);
    let total = 0,
      activeDays = 0,
      longest = 0,
      streak = 0,
      previous = null,
      peakCount = 0,
      peakDay = null;
    for (const row of rows) {
      if (row.count <= 0) continue;
      total += row.count;
      activeDays++;
      const stamp = Date.parse(row.day + 'T00:00:00Z');
      streak = previous !== null && stamp - previous === DAY ? streak + 1 : 1;
      previous = stamp;
      longest = Math.max(longest, streak);
      if (row.count > peakCount) {
        peakCount = row.count;
        peakDay = row.day;
      }
    }
    return { total, activeDays, longest, peakCount, peakDay };
  }
  exportMine(guildId, userId, now = Date.now()) {
    return this.db
      .prepare(
        'SELECT day,count FROM message_rank_daily WHERE guild_id=? AND user_id=? AND day>=? AND day<=? ORDER BY day',
      )
      .all(guildId, userId, this.since('retained', now), utcDay(now));
  }
  overview(guildId, now = Date.now()) {
    return this.db
      .prepare(
        'SELECT count(DISTINCT user_id) AS contributors,COALESCE(sum(count),0) AS messages,count(DISTINCT day) AS days FROM message_rank_daily WHERE guild_id=? AND day>=? AND day<=?',
      )
      .get(guildId, this.since('retained', now), utcDay(now));
  }
  resetAll(guildId) {
    return this.db.prepare('DELETE FROM message_rank_daily WHERE guild_id=?').run(guildId).changes;
  }
  resetMine(guildId, userId) {
    return this.db
      .prepare('DELETE FROM message_rank_daily WHERE guild_id=? AND user_id=?')
      .run(guildId, userId).changes;
  }
}
export function createMessageRankHandler(c) {
  return (message) => {
    try {
      c.messageRanks.record(message);
    } catch {
      c.logger.warn({ kind: 'message_rank_storage' }, 'Message metric update unavailable');
    }
  };
}
