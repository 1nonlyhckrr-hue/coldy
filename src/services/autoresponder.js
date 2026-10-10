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
  list(guildId) {
    return this.db
      .prepare('SELECT * FROM autoresponders WHERE guild_id=? ORDER BY id')
      .all(guildId);
  }
  create(guildId, value) {
    const v = input.parse(value),
      trigger = normalizeTrigger(v.trigger);
    if (!trigger) throw new UserError('responderInvalidTrigger');
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
  edit(guildId, trigger, response) {
    const valid = input.shape.response.parse(response);
    const result = this.db
      .prepare('UPDATE autoresponders SET response=? WHERE guild_id=? AND trigger=?')
      .run(valid, guildId, normalizeTrigger(trigger));
    if (!result.changes) throw new UserError('responderNotFound');
  }
  delete(guildId, trigger) {
    const result = this.db
      .prepare('DELETE FROM autoresponders WHERE guild_id=? AND trigger=?')
      .run(guildId, normalizeTrigger(trigger));
    if (!result.changes) throw new UserError('responderNotFound');
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
    this.db
      .prepare(
        "UPDATE autoresponder_deliveries SET status=? WHERE message_id=? AND status='reserved'",
      )
      .run(status, messageId);
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
