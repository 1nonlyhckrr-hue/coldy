import { UserError } from '../utils/errors.js';
// One small keyed JSON store for the per-server state of the opt-in moderation tools (lock states,
// notes, watches, sticky messages and similar). A row is (guild, feature, key) -> JSON value.
export class FeatureStore {
  constructor(db) {
    this.db = db;
  }
  get(guildId, feature, key, fallback = null) {
    const r = this.db
      .prepare('SELECT value_json FROM feature_state WHERE guild_id=? AND feature=? AND key=?')
      .get(guildId, feature, key);
    return r ? JSON.parse(r.value_json) : fallback;
  }
  set(guildId, feature, key, value) {
    const json = JSON.stringify(value);
    if (json.length > 20000) throw new UserError('toolTooLarge');
    this.db
      .prepare(
        'INSERT INTO feature_state VALUES(?,?,?,?,?) ON CONFLICT(guild_id,feature,key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',
      )
      .run(guildId, feature, key, json, Date.now());
    return value;
  }
  del(guildId, feature, key) {
    return (
      this.db
        .prepare('DELETE FROM feature_state WHERE guild_id=? AND feature=? AND key=?')
        .run(guildId, feature, key).changes > 0
    );
  }
  /** Newest-updated first. The prefix is matched literally. */
  list(guildId, feature, prefix = '', limit = 100) {
    return this.db
      .prepare(
        'SELECT key,value_json,updated_at FROM feature_state WHERE guild_id=? AND feature=? AND substr(key,1,?)=? ORDER BY updated_at DESC,key LIMIT ?',
      )
      .all(guildId, feature, prefix.length, prefix, limit)
      .map((r) => ({ key: r.key, value: JSON.parse(r.value_json), at: r.updated_at }));
  }
  count(guildId, feature, prefix = '') {
    return this.db
      .prepare(
        'SELECT count(*) n FROM feature_state WHERE guild_id=? AND feature=? AND substr(key,1,?)=?',
      )
      .get(guildId, feature, prefix.length, prefix).n;
  }
  /** Settings object for a feature, with defaults filled in. */
  config(guildId, feature, defaults) {
    return { ...defaults, ...this.get(guildId, feature, 'config', {}) };
  }
  setConfig(guildId, feature, defaults, changes) {
    const next = { ...this.config(guildId, feature, defaults), ...changes };
    this.set(guildId, feature, 'config', next);
    return next;
  }
  /** Removes every row of one server (used when the bot leaves or the owner resets). */
  eraseGuild(guildId) {
    return this.db.prepare('DELETE FROM feature_state WHERE guild_id=?').run(guildId).changes;
  }
}
