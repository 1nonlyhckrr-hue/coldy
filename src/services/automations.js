import { z } from 'zod';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
const schema = z
  .object({
    guildId: z.string().min(1),
    channelId: z.string().regex(/^\d{17,20}$/),
    body: z.string().min(1).max(1800),
    dueAt: z.number().int(),
    repeatMs: z
      .number()
      .int()
      .min(600000)
      .max(30 * 86400000)
      .optional(),
    interactionId: z.string().min(1),
  })
  .strict();
export function parseScheduledTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value ?? ''))
    throw new UserError('automationTimeFormat');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new UserError('automationTimeFormat');
  const local = value.slice(0, 19),
    normalized = new Date(Date.parse(local + 'Z')).toISOString().slice(0, 19);
  if (local !== normalized) throw new UserError('automationTimeFormat');
  return time;
}
export class MessageSchedules {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  create(input) {
    const v = schema.parse(input);
    if (v.dueAt < this.now() + 60000 || v.dueAt > this.now() + 365 * 86400000)
      throw new UserError('automationTimeBounds');
    return this.db.transaction(() => {
      if (
        this.db
          .prepare(
            "SELECT count(*) n FROM message_schedules WHERE guild_id=? AND status IN ('pending','sending','uncertain')",
          )
          .get(v.guildId).n >= 25
      )
        throw new UserError('automationLimit');
      return Number(
        this.db
          .prepare(
            "INSERT INTO message_schedules(guild_id,channel_id,body,due_at,repeat_ms,status,interaction_id,created_at) VALUES(?,?,?,?,?,'pending',?,?)",
          )
          .run(
            v.guildId,
            v.channelId,
            v.body,
            v.dueAt,
            v.repeatMs ?? null,
            v.interactionId,
            this.now(),
          ).lastInsertRowid,
      );
    })();
  }
  get(id, guildId) {
    return this.db
      .prepare('SELECT * FROM message_schedules WHERE id=? AND guild_id=?')
      .get(id, guildId);
  }
  list(guildId) {
    return this.db
      .prepare('SELECT * FROM message_schedules WHERE guild_id=? ORDER BY id DESC LIMIT 100')
      .all(guildId);
  }
  upcoming(guildId, page = 1, { recurring = null } = {}) {
    if (!Number.isInteger(page) || page < 1 || page > 3)
      throw new UserError('automationQueuePageInvalid');
    if (recurring !== null && typeof recurring !== 'boolean')
      throw new UserError('automationQueueFilterInvalid');
    return this.db
      .prepare(
        "SELECT id,channel_id,due_at,repeat_ms FROM message_schedules WHERE guild_id=? AND status='pending' AND (? IS NULL OR (repeat_ms IS NOT NULL)=?) ORDER BY due_at,id LIMIT 10 OFFSET ?",
      )
      .all(
        guildId,
        recurring === null ? null : Number(recurring),
        recurring === null ? null : Number(recurring),
        (page - 1) * 10,
      );
  }
  overview(guildId) {
    return this.db
      .prepare(
        "SELECT status,count(*) AS count,min(CASE WHEN status='pending' THEN due_at END) AS next_due FROM message_schedules WHERE guild_id=? GROUP BY status ORDER BY status",
      )
      .all(guildId);
  }
  claim() {
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT * FROM message_schedules WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 1",
        )
        .get(this.now());
      if (!row) return null;
      this.db
        .prepare("UPDATE message_schedules SET status='sending' WHERE id=? AND status='pending'")
        .run(row.id);
      return row;
    })();
  }
  finish(id, success) {
    if (typeof success !== 'boolean') throw new TypeError('Invalid schedule outcome');
    return this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM message_schedules WHERE id=? AND status='sending'")
        .get(id);
      if (!row) throw new Error('Schedule not sending');
      const next =
        success && row.repeat_ms
          ? row.due_at +
            Math.max(1, Math.floor((this.now() - row.due_at) / row.repeat_ms) + 1) * row.repeat_ms
          : row.due_at;
      const result = this.db
        .prepare("UPDATE message_schedules SET status=?,due_at=? WHERE id=? AND status='sending'")
        .run(!success ? 'uncertain' : row.repeat_ms ? 'pending' : 'done', next, id);
      if (result.changes !== 1) throw new Error('Schedule outcome not stored');
    })();
  }
  cancel(id, guildId) {
    const r = this.db
      .prepare(
        "UPDATE message_schedules SET status='cancelled' WHERE id=? AND guild_id=? AND status IN ('pending','uncertain')",
      )
      .run(id, guildId);
    if (!r.changes) throw new UserError('automationCancelInvalid');
  }
  cancelPending(guildId) {
    if (typeof guildId !== 'string' || !guildId) throw new TypeError('Invalid guild identity');
    return this.db
      .prepare(
        "UPDATE message_schedules SET status='cancelled' WHERE guild_id=? AND status='pending'",
      )
      .run(guildId).changes;
  }
  reschedulePending(id, guildId, dueAt) {
    if (
      !Number.isInteger(dueAt) ||
      dueAt < this.now() + 60000 ||
      dueAt > this.now() + 365 * 86400000
    )
      throw new UserError('automationTimeBounds');
    const result = this.db
      .prepare(
        "UPDATE message_schedules SET due_at=? WHERE id=? AND guild_id=? AND status='pending'",
      )
      .run(dueAt, id, guildId);
    if (result.changes !== 1) throw new UserError('automationEditInvalid');
  }
  repeatPending(id, guildId, repeatMs) {
    if (repeatMs !== null) schema.shape.repeatMs.parse(repeatMs);
    const result = this.db
      .prepare(
        "UPDATE message_schedules SET repeat_ms=? WHERE id=? AND guild_id=? AND status='pending'",
      )
      .run(repeatMs, id, guildId);
    if (result.changes !== 1) throw new UserError('automationEditInvalid');
  }
  destinationPending(snapshot, channelId) {
    schema.shape.channelId.parse(channelId);
    if (snapshot?.status !== 'pending') throw new UserError('automationEditInvalid');
    const result = this.db
      .prepare(
        "UPDATE message_schedules SET channel_id=? WHERE id=? AND guild_id=? AND status='pending' AND channel_id=? AND body=? AND due_at=? AND repeat_ms IS ? AND interaction_id=?",
      )
      .run(
        channelId,
        snapshot.id,
        snapshot.guild_id,
        snapshot.channel_id,
        snapshot.body,
        snapshot.due_at,
        snapshot.repeat_ms,
        snapshot.interaction_id,
      );
    if (result.changes !== 1) throw new UserError('automationEditInvalid');
  }
  shiftPending(id, guildId, minutes) {
    if (!Number.isSafeInteger(minutes) || minutes === 0 || Math.abs(minutes) > 525600)
      throw new UserError('automationShiftInvalid');
    const row = this.get(id, guildId);
    if (row?.status !== 'pending') throw new UserError('automationEditInvalid');
    const dueAt = row.due_at + minutes * 60000;
    this.reschedulePending(id, guildId, dueAt);
    return dueAt;
  }
  clonePending(snapshot, { dueAt, interactionId }) {
    return this.db.transaction(() => {
      const row = this.get(snapshot?.id, snapshot?.guild_id);
      if (
        !row ||
        row.status !== 'pending' ||
        ['channel_id', 'body', 'due_at', 'repeat_ms', 'interaction_id'].some(
          (k) => row[k] !== snapshot[k],
        )
      )
        throw new UserError('automationEditInvalid');
      return this.create({
        guildId: row.guild_id,
        channelId: row.channel_id,
        body: row.body,
        dueAt,
        interactionId,
      });
    })();
  }
  scopedPending(guildId, channelId, action) {
    schema.shape.channelId.parse(channelId);
    if (!['cancel', 'stoprepeats', 'erasefinished'].includes(action))
      throw new UserError('automationEditInvalid');
    const sql =
      action === 'cancel'
        ? "UPDATE message_schedules SET status='cancelled' WHERE guild_id=? AND channel_id=? AND status='pending'"
        : action === 'stoprepeats'
          ? "UPDATE message_schedules SET repeat_ms=NULL WHERE guild_id=? AND channel_id=? AND status='pending' AND repeat_ms IS NOT NULL"
          : "UPDATE message_schedules SET body='[erased]' WHERE guild_id=? AND channel_id=? AND status IN ('done','cancelled') AND body!='[erased]'";
    return this.db.prepare(sql).run(guildId, channelId).changes;
  }
  channelRecords(guildId, channelId) {
    schema.shape.channelId.parse(channelId);
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM message_schedules WHERE guild_id=? AND channel_id=?')
        .get(guildId, channelId).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id AS channelId,due_at AS dueAt,repeat_ms AS repeatMs,status FROM message_schedules WHERE guild_id=? AND channel_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId, channelId);
      return { total, truncated: total > records.length, records };
    })();
  }
  exportMetadata(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM message_schedules WHERE guild_id=?')
        .get(guildId).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id AS channelId,due_at AS dueAt,repeat_ms AS repeatMs,status FROM message_schedules WHERE guild_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId);
      return { total, truncated: total > records.length, records };
    })();
  }
  cancelChannelPending(guildId, channelId) {
    schema.shape.channelId.parse(channelId);
    return this.db
      .prepare(
        "UPDATE message_schedules SET status='cancelled' WHERE guild_id=? AND channel_id=? AND status='pending'",
      )
      .run(guildId, channelId).changes;
  }
  exportRecords(guildId) {
    return this.list(guildId).map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      body: r.body,
      dueAt: r.due_at,
      repeatMs: r.repeat_ms,
      status: r.status,
    }));
  }
  editPending(id, guildId, body) {
    schema.shape.body.parse(body);
    const result = this.db
      .prepare("UPDATE message_schedules SET body=? WHERE id=? AND guild_id=? AND status='pending'")
      .run(body, id, guildId);
    if (result.changes !== 1) throw new UserError('automationEditInvalid');
  }
  forget(id, guildId) {
    const result = this.db
      .prepare(
        "UPDATE message_schedules SET body='[erased]' WHERE id=? AND guild_id=? AND status IN ('done','cancelled')",
      )
      .run(id, guildId);
    if (!result.changes) throw new UserError('automationForgetInvalid');
  }
  stopRepeats(guildId) {
    return this.db
      .prepare(
        "UPDATE message_schedules SET repeat_ms=NULL WHERE guild_id=? AND status='pending' AND repeat_ms IS NOT NULL",
      )
      .run(guildId).changes;
  }
  forgetFinished(guildId) {
    return this.db
      .prepare(
        "UPDATE message_schedules SET body='[erased]' WHERE guild_id=? AND status IN ('done','cancelled') AND body!='[erased]'",
      )
      .run(guildId).changes;
  }
  clearFinished(guildId) {
    return this.db
      .prepare("DELETE FROM message_schedules WHERE guild_id=? AND status IN ('done','cancelled')")
      .run(guildId).changes;
  }
  recover() {
    this.db.prepare("UPDATE message_schedules SET status='uncertain' WHERE status='sending'").run();
  }
}
export class AutomationRunner {
  constructor(context, client) {
    this.context = context;
    this.client = client;
    this.busy = false;
    this.timer = null;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let n = 0; n < 10; n++) {
        let job;
        try {
          job = this.context.messageSchedules.claim();
        } catch {
          this.context.logger.warn('Schedule storage unavailable');
          break;
        }
        if (!job) break;
        let success = false;
        try {
          const guild = await this.client.guilds.fetch({ guild: job.guild_id, force: true });
          if (guild?.id !== job.guild_id) throw new UserError('channelTypeInvalid');
          const channel = await validateOutputChannel(guild, job.channel_id),
            locale = this.context.guildConfig.get(job.guild_id).language;
          // Recovery or another worker may invalidate this reservation during native lookup.
          const current = this.context.messageSchedules.get(job.id, job.guild_id);
          if (
            !current ||
            current.status !== 'sending' ||
            ['guild_id', 'channel_id', 'body', 'due_at', 'repeat_ms', 'interaction_id'].some(
              (key) => current[key] !== job[key],
            )
          )
            throw new Error('Schedule reservation changed before delivery');
          const sent = await channel.send(
            lunaPayload({ content: job.body, allowedMentions: { parse: [] } }, { locale }),
          );
          if (typeof sent?.id !== 'string' || !sent.id.trim())
            throw new Error('Missing accepted schedule message identity');
          success = true;
        } catch {
          this.context.logger.warn(
            { scheduleId: job.id },
            'Scheduled send uncertain; no automatic retry',
          );
        }
        try {
          this.context.messageSchedules.finish(job.id, success);
        } catch {
          this.context.logger.warn(
            { scheduleId: job.id },
            'Schedule outcome could not be stored; reserved job will not resend',
          );
        }
      }
    } finally {
      this.busy = false;
    }
  }
  start() {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
