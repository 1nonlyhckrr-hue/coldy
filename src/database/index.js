import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`);
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get()) {
      db.exec(`CREATE TABLE guild_settings(guild_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
      CREATE TABLE moderation_cases(id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, target_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX cases_guild_target ON moderation_cases(guild_id, target_id, created_at);
      CREATE TABLE scheduled_jobs(id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')));
      CREATE INDEX jobs_due ON scheduled_jobs(status, due_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (1, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()) {
      db.exec(`ALTER TABLE moderation_cases ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
        ALTER TABLE moderation_cases ADD COLUMN interaction_id TEXT;
        CREATE UNIQUE INDEX cases_interaction ON moderation_cases(interaction_id) WHERE interaction_id IS NOT NULL;
        CREATE TABLE warnings(id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, target_id TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, cleared_at INTEGER);
        CREATE INDEX warnings_member ON warnings(guild_id, target_id, cleared_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (2, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 3').get()) {
      db.exec(`CREATE TABLE role_panels(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,role_id TEXT NOT NULL,label TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','disabled','uncertain','failed')),interaction_id TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX panels_message ON role_panels(message_id) WHERE message_id IS NOT NULL;`);
      db.prepare('INSERT INTO schema_migrations VALUES (3, ?)').run(Date.now());
    }
  })();
  return db;
}
export class GuildSettings {
  constructor(db) { this.db = db; }
  get(guildId) { const row = this.db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id = ?').get(guildId); return row ? JSON.parse(row.settings_json) : {}; }
  set(guildId, value) { this.db.prepare(`INSERT INTO guild_settings VALUES(?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at`).run(guildId, JSON.stringify(value), Date.now()); }
  patch(guildId, changes) { return this.db.transaction(() => { const merged = {...this.get(guildId), ...changes}; this.set(guildId, merged); return merged; })(); }
}
