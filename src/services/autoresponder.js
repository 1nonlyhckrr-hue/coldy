import { z } from 'zod';
import { UserError } from '../utils/errors.js';
const input = z
  .object({
    trigger: z.string().trim().min(1).max(100),
    response: z.string().min(1).max(1800),
    mode: z.enum(['exact', 'keyword']).default('exact'),
    cooldownSeconds: z.number().int().min(10).max(3600).default(60),
  })
  .strict();
export function normalizeTrigger(text) {
  return text.normalize('NFKC').toLocaleLowerCase('en').trim().replace(/\s+/gu, ' ');
}
function validatedTrigger(value) {
  const trigger = normalizeTrigger(input.shape.trigger.parse(value));
  if (!trigger || trigger.length > 100 || /[\u0000-\u001f\u007f]/u.test(trigger))
    throw new UserError('responderInvalidTrigger');
  return trigger;
}
export function matchesTrigger(content, trigger, mode) {
  const text = normalizeTrigger(content),
    needle = normalizeTrigger(trigger);
  if (mode === 'exact') return text === needle;
  // No owner-supplied regular expressions. Match a literal phrase with Unicode word boundaries.
  let at = text.indexOf(needle);
  while (at !== -1) {
    const before = at === 0 ? '' : Array.from(text.slice(0, at)).at(-1);
    const after = Array.from(text.slice(at + needle.length))[0] ?? '';
    if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after)) return true;
    at = text.indexOf(needle, at + 1);
  }
  return false;
}
export class Autoresponders {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  list(guildId, { enabled = null } = {}) {
    if (enabled !== null && typeof enabled !== 'boolean')
      throw new UserError('responderFilterInvalid');
    return this.db
      .prepare(
        'SELECT * FROM autoresponders WHERE guild_id=? AND (? IS NULL OR enabled=?) ORDER BY id',
      )
      .all(
        guildId,
        enabled === null ? null : Number(enabled),
        enabled === null ? null : Number(enabled),
      );
  }
  stats(guildId) {
    return {
      rules: this.db
        .prepare(
          'SELECT enabled,mode,count(*) AS count FROM autoresponders WHERE guild_id=? GROUP BY enabled,mode ORDER BY enabled,mode',
        )
        .all(guildId),
      deliveries: this.db
        .prepare(
          'SELECT status,count(*) AS count FROM autoresponder_deliveries WHERE guild_id=? GROUP BY status ORDER BY status',
        )
        .all(guildId),
    };
  }
  create(guildId, value) {
    const v = input.parse(value),
      trigger = validatedTrigger(v.trigger);
    return this.db.transaction(() => {
      if (this.list(guildId).length >= 50) throw new UserError('responderLimit');
      if (this.find(guildId, trigger)) throw new UserError('responderExists');
      const r = this.db
        .prepare(
          'INSERT INTO autoresponders(guild_id,trigger,mode,response,cooldown_seconds,created_at) VALUES(?,?,?,?,?,?)',
        )
        .run(guildId, trigger, v.mode, v.response, v.cooldownSeconds, this.now());
      return Number(r.lastInsertRowid);
    })();
  }
  find(guildId, trigger) {
    return this.db
      .prepare('SELECT * FROM autoresponders WHERE guild_id=? AND trigger=?')
      .get(guildId, normalizeTrigger(trigger));
  }
  rename(guildId, trigger, newTrigger) {
    const target = validatedTrigger(newTrigger);
    return this.db.transaction(() => {
      const row = this.find(guildId, trigger);
      if (!row) throw new UserError('responderNotFound');
      const exists = this.find(guildId, target);
      if (exists && exists.id !== row.id) throw new UserError('responderExists');
      const result = this.db
        .prepare('UPDATE autoresponders SET trigger=? WHERE id=? AND guild_id=? AND trigger=?')
        .run(target, row.id, guildId, row.trigger);
      if (result.changes !== 1) throw new UserError('responderNotFound');
    })();
  }
  edit(guildId, trigger, response) {
    const valid = input.shape.response.parse(response);
    const result = this.db
      .prepare('UPDATE autoresponders SET response=? WHERE guild_id=? AND trigger=?')
      .run(valid, guildId, normalizeTrigger(trigger));
    if (!result.changes) throw new UserError('responderNotFound');
  }
  setMode(guildId, trigger, mode) {
    const value = input.shape.mode.parse(mode);
    const result = this.db
      .prepare('UPDATE autoresponders SET mode=? WHERE guild_id=? AND trigger=?')
      .run(value, guildId, normalizeTrigger(trigger));
    if (result.changes !== 1) throw new UserError('responderNotFound');
  }
  setCooldown(guildId, trigger, seconds) {
    const value = input.shape.cooldownSeconds.parse(seconds);
    const result = this.db
      .prepare('UPDATE autoresponders SET cooldown_seconds=? WHERE guild_id=? AND trigger=?')
      .run(value, guildId, normalizeTrigger(trigger));
    if (result.changes !== 1) throw new UserError('responderNotFound');
  }
  setEnabled(guildId, trigger, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid responder enabled state');
    const result = this.db
      .prepare('UPDATE autoresponders SET enabled=? WHERE guild_id=? AND trigger=?')
      .run(Number(enabled), guildId, normalizeTrigger(trigger));
    if (!result.changes) throw new UserError('responderNotFound');
  }
  clone(guildId, trigger, newTrigger) {
    return this.db.transaction(() => {
      const row = this.find(guildId, trigger);
      if (!row) throw new UserError('responderNotFound');
      const id = this.create(guildId, {
        trigger: newTrigger,
        response: row.response,
        mode: row.mode,
        cooldownSeconds: row.cooldown_seconds,
      });
      this.db
        .prepare('UPDATE autoresponders SET enabled=0 WHERE id=? AND guild_id=?')
        .run(id, guildId);
      return id;
    })();
  }
  exportRules(guildId) {
    return this.list(guildId).map((r) => ({
      trigger: r.trigger,
      response: r.response,
      mode: r.mode,
      cooldownSeconds: r.cooldown_seconds,
    }));
  }
  importRules(guildId, text) {
    if (typeof text !== 'string' || text.length > 4000)
      throw new UserError('responderImportInvalid');
    let values;
    try {
      values = z.array(input).min(1).max(10).parse(JSON.parse(text));
    } catch {
      throw new UserError('responderImportInvalid');
    }
    return this.db.transaction(() => {
      const ids = values.map((value) => {
        const id = this.create(guildId, value);
        this.db
          .prepare('UPDATE autoresponders SET enabled=0 WHERE id=? AND guild_id=?')
          .run(id, guildId);
        return id;
      });
      return ids.length;
    })();
  }
  replaceRules(guildId, text) {
    if (typeof text !== 'string' || text.length > 4000)
      throw new UserError('responderImportInvalid');
    let values;
    try {
      values = z.array(input).min(1).max(10).parse(JSON.parse(text));
    } catch {
      throw new UserError('responderImportInvalid');
    }
    const triggers = values.map((v) => validatedTrigger(v.trigger));
    if (new Set(triggers).size !== triggers.length) throw new UserError('responderExists');
    return this.db.transaction(() => {
      const rows = triggers.map((t) => this.find(guildId, t));
      if (rows.some((r) => !r)) throw new UserError('responderNotFound');
      values.forEach((v, n) => {
        const r = rows[n],
          result = this.db
            .prepare(
              'UPDATE autoresponders SET response=?,mode=?,cooldown_seconds=?,enabled=0 WHERE id=? AND guild_id=? AND trigger=?',
            )
            .run(v.response, v.mode, v.cooldownSeconds, r.id, guildId, r.trigger);
        if (result.changes !== 1) throw new UserError('responderNotFound');
      });
      return rows.length;
    })();
  }
  deletePaused(guildId) {
    return this.db.prepare('DELETE FROM autoresponders WHERE guild_id=? AND enabled=0').run(guildId)
      .changes;
  }
  cooldownAll(guildId, seconds) {
    const v = input.shape.cooldownSeconds.parse(seconds);
    return this.db
      .prepare(
        'UPDATE autoresponders SET cooldown_seconds=? WHERE guild_id=? AND cooldown_seconds<>?',
      )
      .run(v, guildId, v).changes;
  }
  dryRun(guildId, content) {
    if (typeof content !== 'string' || !content.trim() || content.length > 1800)
      throw new UserError('responderDryInvalid');
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new UserError('responderDryInvalid');
    const matches = this.list(guildId)
      .filter((r) => matchesTrigger(content, r.trigger, r.mode))
      .sort((a, b) => (a.mode === 'exact' ? 0 : 1) - (b.mode === 'exact' ? 0 : 1) || a.id - b.id)
      .map((r) => ({
        id: r.id,
        mode: r.mode,
        state:
          r.enabled !== 1
            ? 'paused'
            : now - r.last_sent_at < r.cooldown_seconds * 1000
              ? 'cooldown'
              : 'eligible',
      }));
    return { matches, chosen: matches.find((r) => r.state === 'eligible')?.id ?? null };
  }
  deleteAll(guildId) {
    return this.db.prepare('DELETE FROM autoresponders WHERE guild_id=?').run(guildId).changes;
  }
  disableAll(guildId) {
    return this.db
      .prepare('UPDATE autoresponders SET enabled=0 WHERE guild_id=? AND enabled=1')
      .run(guildId).changes;
  }
  delete(guildId, trigger) {
    const result = this.db
      .prepare('DELETE FROM autoresponders WHERE guild_id=? AND trigger=?')
      .run(guildId, normalizeTrigger(trigger));
    if (!result.changes) throw new UserError('responderNotFound');
  }
  eligible(guildId, messageId, content) {
    if (
      this.db
        .prepare('SELECT message_id FROM autoresponder_deliveries WHERE message_id=?')
        .get(messageId)
    )
      return false;
    const now = this.now();
    return this.list(guildId).some(
      (rule) =>
        rule.enabled === 1 &&
        matchesTrigger(content, rule.trigger, rule.mode) &&
        now - rule.last_sent_at >= rule.cooldown_seconds * 1000,
    );
  }
  claim(guildId, messageId, content) {
    return this.db.transaction(() => {
      if (
        this.db
          .prepare('SELECT message_id FROM autoresponder_deliveries WHERE message_id=?')
          .get(messageId)
      )
        return null;
      const now = this.now();
      const rules = this.list(guildId).sort(
        (a, b) => (a.mode === 'exact' ? 0 : 1) - (b.mode === 'exact' ? 0 : 1) || a.id - b.id,
      );
      for (const rule of rules) {
        if (
          rule.enabled !== 1 ||
          !matchesTrigger(content, rule.trigger, rule.mode) ||
          now - rule.last_sent_at < rule.cooldown_seconds * 1000
        )
          continue;
        this.db
          .prepare('INSERT INTO autoresponder_deliveries VALUES(?,?,?,?,?)')
          .run(messageId, guildId, rule.id, 'reserved', now);
        this.db.prepare('UPDATE autoresponders SET last_sent_at=? WHERE id=?').run(now, rule.id);
        return rule;
      }
      return null;
    })();
  }
  finish(messageId, status) {
    if (!['sent', 'uncertain'].includes(status))
      throw new Error('Invalid responder delivery status');
    const result = this.db
      .prepare(
        "UPDATE autoresponder_deliveries SET status=? WHERE message_id=? AND status='reserved'",
      )
      .run(status, messageId);
    if (result.changes !== 1) throw new Error('Responder delivery not reserved');
  }
  recover() {
    this.db
      .prepare("UPDATE autoresponder_deliveries SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup() {
    this.db
      .prepare('DELETE FROM autoresponder_deliveries WHERE created_at<?')
      .run(this.now() - 30 * 24 * 3600 * 1000);
  }
}
