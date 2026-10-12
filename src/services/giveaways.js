import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { UserError } from '../utils/errors.js';
const snowflake = z.string().regex(/^\d{17,20}$/);
const schema = z
  .object({
    guildId: z.string().min(1),
    channelId: snowflake,
    prize: z.string().trim().min(1).max(250),
    winnerCount: z.number().int().min(1).max(20),
    requiredRoleId: snowflake.optional(),
    durationMs: z
      .number()
      .int()
      .min(60000)
      .max(30 * 86400000),
    interactionId: z.string().min(1),
  })
  .strict();
export function sampleWinners(candidates, count, random = randomInt) {
  if (
    !Array.isArray(candidates) ||
    candidates.some((id) => typeof id !== 'string' || !id) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20 ||
    typeof random !== 'function'
  )
    throw new TypeError('Invalid giveaway sampling input');
  const values = [...new Set(candidates)];
  for (let n = values.length - 1; n > 0; n--) {
    const swap = random(n + 1);
    if (!Number.isInteger(swap) || swap < 0 || swap > n) throw new Error('Invalid random source');
    [values[n], values[swap]] = [values[swap], values[n]];
  }
  return values.slice(0, count);
}
export class Giveaways {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  summary(guildId) {
    return {
      states: this.db
        .prepare(
          'SELECT status,COUNT(*) count FROM giveaways WHERE guild_id=? GROUP BY status ORDER BY status',
        )
        .all(guildId),
      retainedEntries: this.db
        .prepare(
          'SELECT COUNT(*) n FROM giveaway_entries e JOIN giveaways g ON g.id=e.giveaway_id WHERE g.guild_id=?',
        )
        .get(guildId).n,
    };
  }
  channelRecords(guildId, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new UserError('giveawayNotFound');
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM giveaways WHERE guild_id=? AND channel_id=?')
        .get(guildId, channelId).n;
      const records = this.db
        .prepare(
          'SELECT id,prize,status,channel_id,message_id,ends_at,winner_count,required_role_id FROM giveaways WHERE guild_id=? AND channel_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId, channelId);
      return { total, truncated: total > records.length, records };
    })();
  }
  cancelChannel(guildId, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new UserError('giveawayNotFound');
    return this.db
      .prepare(
        "UPDATE giveaways SET status='cancelled' WHERE guild_id=? AND channel_id=? AND status='active'",
      )
      .run(guildId, channelId).changes;
  }
  reserve(input) {
    const v = schema.parse(input);
    return this.db.transaction(() => {
      if (
        this.db
          .prepare(
            "SELECT count(*) n FROM giveaways WHERE guild_id=? AND status IN ('pending','active','ending','uncertain')",
          )
          .get(v.guildId).n >= 20
      )
        throw new UserError('giveawayLimit');
      const r = this.db
        .prepare(
          "INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,required_role_id,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)",
        )
        .run(
          v.guildId,
          v.channelId,
          v.prize,
          v.winnerCount,
          v.requiredRoleId ?? null,
          this.now() + v.durationMs,
          v.interactionId,
          this.now(),
        );
      return Number(r.lastInsertRowid);
    })();
  }
  get(id, guildId) {
    return this.db.prepare('SELECT * FROM giveaways WHERE id=? AND guild_id=?').get(id, guildId);
  }
  activate(id, messageId) {
    if (typeof messageId !== 'string' || !messageId.trim())
      throw new TypeError('Missing giveaway message identity');
    const result = this.db
      .prepare("UPDATE giveaways SET message_id=?,status='active' WHERE id=? AND status='pending'")
      .run(messageId, id);
    if (result.changes !== 1) throw new Error('Giveaway reservation not pending');
  }
  uncertain(id) {
    this.db
      .prepare("UPDATE giveaways SET status='uncertain' WHERE id=? AND status='pending'")
      .run(id);
  }
  list(guildId) {
    return this.db
      .prepare('SELECT * FROM giveaways WHERE guild_id=? ORDER BY id DESC LIMIT 100')
      .all(guildId);
  }
  listPage(guildId, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 50)
      throw new UserError('responderPageInvalid', { pages: 50 });
    const rows = this.list(guildId),
      pages = Math.max(1, Math.ceil(rows.length / 2));
    if (page > pages) throw new UserError('responderPageInvalid', { pages });
    return { rows: rows.slice((page - 1) * 2, page * 2), pages, total: rows.length, page };
  }
  inspect(id, guildId) {
    const row = this.get(id, guildId);
    if (!row) throw new UserError('giveawayNotFound');
    return {
      id: row.id,
      prize: row.prize,
      status: row.status,
      channelId: row.channel_id,
      endsAt: row.ends_at,
      winnerCount: row.winner_count,
      drawVersion: row.draw_version,
      entries: this.db
        .prepare('SELECT count(*) n FROM giveaway_entries WHERE giveaway_id=?')
        .get(id).n,
    };
  }
  cancelAllActive(guildId) {
    return this.db
      .prepare("UPDATE giveaways SET status='cancelled' WHERE guild_id=? AND status='active'")
      .run(guildId).changes;
  }
  forgetFinishedEntries(guildId) {
    return this.db
      .prepare(
        "DELETE FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id=? AND status IN ('ended','cancelled'))",
      )
      .run(guildId).changes;
  }
  exportRecords(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT count(*) n FROM giveaways WHERE guild_id=?')
        .get(guildId).n;
      const rows = this.list(guildId).map((r) => ({
        id: r.id,
        prize: r.prize,
        status: r.status,
        channelId: r.channel_id,
        messageId: r.message_id,
        endsAt: r.ends_at,
        winnerCount: r.winner_count,
        requiredRoleId: r.required_role_id,
      }));
      return { total, truncated: total > rows.length, records: rows };
    })();
  }
  cancelActive(id, guildId) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('giveawayNotFound');
    const r = this.db
      .prepare(
        "UPDATE giveaways SET status='cancelled' WHERE id=? AND guild_id=? AND status='active'",
      )
      .run(id, guildId);
    if (r.changes !== 1) throw new UserError('giveawayCancelInvalid');
  }
  forgetEntries(id, guildId) {
    return this.db.transaction(() => {
      const row = this.get(id, guildId);
      if (!row || !['ended', 'cancelled'].includes(row.status))
        throw new UserError('giveawayForgetInvalid');
      return this.db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id=?').run(id).changes;
    })();
  }
  due() {
    return this.db
      .prepare(
        "SELECT * FROM giveaways WHERE (status='active' AND ends_at<=?) OR status='ending' ORDER BY ends_at LIMIT 20",
      )
      .all(this.now());
  }
  entries(id) {
    return this.db
      .prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id=? ORDER BY user_id')
      .all(id)
      .map((r) => r.user_id);
  }
  enter(id, guildId, userId) {
    return this.db.transaction(() => {
      const g = this.get(id, guildId);
      if (!g || g.status !== 'active' || g.ends_at <= this.now())
        throw new UserError('giveawayNotActive');
      if (!/^\d{17,20}$/.test(userId)) throw new UserError('giveawayUserInvalid');
      if (
        this.entries(id).length >= 1000 &&
        !this.db
          .prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id=? AND user_id=?')
          .get(id, userId)
      )
        throw new UserError('giveawayEntryLimit');
      return (
        this.db
          .prepare('INSERT OR IGNORE INTO giveaway_entries VALUES(?,?,?)')
          .run(id, userId, this.now()).changes === 1
      );
    })();
  }
  leave(id, guildId, userId) {
    if (!/^\d{17,20}$/.test(userId)) throw new UserError('giveawayUserInvalid');
    return this.db.transaction(() => {
      const g = this.get(id, guildId);
      if (!g || g.status !== 'active' || g.ends_at <= this.now())
        throw new UserError('giveawayNotActive');
      return (
        this.db
          .prepare('DELETE FROM giveaway_entries WHERE giveaway_id=? AND user_id=?')
          .run(id, userId).changes === 1
      );
    })();
  }
  draw(id, guildId, eligible, { reroll = false, random = randomInt } = {}) {
    if (
      typeof reroll !== 'boolean' ||
      !Array.isArray(eligible) ||
      eligible.some((user) => typeof user !== 'string' || !user)
    )
      throw new UserError('giveawayDrawInvalid');
    return this.db.transaction(() => {
      const g = this.get(id, guildId);
      if (!g) throw new UserError('giveawayNotFound');
      if (g.status === 'ending') return g;
      if ((reroll && g.status !== 'ended') || (!reroll && g.status !== 'active'))
        throw new UserError('giveawayDrawInvalid');
      const registered = new Set(this.entries(id));
      const previous = new Set(reroll ? JSON.parse(g.winners_json) : []);
      const candidates = eligible.filter((user) => registered.has(user) && !previous.has(user));
      const winners = sampleWinners(candidates, g.winner_count, random);
      this.db
        .prepare(
          "UPDATE giveaways SET winners_json=?,status='ending',draw_version=draw_version+1 WHERE id=?",
        )
        .run(JSON.stringify(winners), id);
      return this.get(id, guildId);
    })();
  }
  endPublished(id, version) {
    this.db
      .prepare(
        "UPDATE giveaways SET status='ended' WHERE id=? AND status='ending' AND draw_version=?",
      )
      .run(id, version);
  }
  recover() {
    this.db.prepare("UPDATE giveaways SET status='uncertain' WHERE status='pending'").run();
  }
}
