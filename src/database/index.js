import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.transaction(() => {
    db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`,
    );
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
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 4').get()) {
      db.exec(`CREATE TABLE autoresponders(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,trigger TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('exact','keyword')),response TEXT NOT NULL,cooldown_seconds INTEGER NOT NULL,last_sent_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,UNIQUE(guild_id,trigger));
      CREATE TABLE autoresponder_deliveries(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,rule_id INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('reserved','sent','uncertain')),created_at INTEGER NOT NULL);
      CREATE INDEX autoresponders_guild ON autoresponders(guild_id);
      CREATE INDEX autoresponder_deliveries_age ON autoresponder_deliveries(created_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (4, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 5').get()) {
      db.exec(`CREATE TABLE giveaways(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,prize TEXT NOT NULL,winner_count INTEGER NOT NULL,required_role_id TEXT,ends_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','active','ending','ended','uncertain','cancelled')),winners_json TEXT NOT NULL DEFAULT '[]',draw_version INTEGER NOT NULL DEFAULT 0,interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX giveaway_messages ON giveaways(message_id) WHERE message_id IS NOT NULL;
      CREATE INDEX giveaways_due ON giveaways(status,ends_at);
      CREATE TABLE giveaway_entries(giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(giveaway_id,user_id));`);
      db.prepare('INSERT INTO schema_migrations VALUES (5, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 6').get()) {
      db.exec(`CREATE TABLE ticket_config(guild_id TEXT PRIMARY KEY,category_id TEXT NOT NULL,support_role_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE ticket_panels(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL CHECK(status IN ('pending','active','uncertain')),interaction_id TEXT NOT NULL UNIQUE);
      CREATE TABLE tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,support_role_id TEXT NOT NULL,channel_id TEXT UNIQUE,status TEXT NOT NULL CHECK(status IN ('creating','open','closing','closed','reopening','uncertain')),claimed_by TEXT,interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX tickets_owner_live ON tickets(guild_id,owner_id) WHERE status IN ('creating','open','closing','reopening','uncertain');
      CREATE TABLE ticket_transcripts(ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),body TEXT NOT NULL,message_count INTEGER NOT NULL,truncated INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
      db.prepare('INSERT INTO schema_migrations VALUES (6, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 7').get()) {
      db.exec(`CREATE TABLE message_schedules(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,body TEXT NOT NULL,due_at INTEGER NOT NULL,repeat_ms INTEGER,status TEXT NOT NULL CHECK(status IN ('pending','sending','done','cancelled','uncertain')),interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
      CREATE INDEX message_schedules_due ON message_schedules(status,due_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (7, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 8').get()) {
      db.exec(`CREATE TABLE automod_settings(guild_id TEXT PRIMARY KEY,settings_json TEXT NOT NULL);
      CREATE TABLE automod_incidents(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,rule TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('reserved','completed','uncertain','failed')),created_at INTEGER NOT NULL);
      CREATE INDEX automod_incidents_guild ON automod_incidents(guild_id,created_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (8, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 9').get()) {
      db.exec(
        `CREATE TABLE command_restrictions(guild_id TEXT NOT NULL,command_name TEXT NOT NULL,subject_kind TEXT NOT NULL CHECK(subject_kind IN ('user','role')),subject_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,command_name,subject_kind,subject_id));`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (9, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 10').get()) {
      db.exec(`CREATE TABLE custom_role_config(guild_id TEXT PRIMARY KEY,required_role_id TEXT);
      CREATE TABLE custom_role_mappings(guild_id TEXT NOT NULL,name TEXT NOT NULL,role_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,name),UNIQUE(guild_id,role_id));`);
      db.prepare('INSERT INTO schema_migrations VALUES (10, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 11').get()) {
      db.exec(`CREATE TABLE message_rank_config(guild_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,excluded_json TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE message_rank_daily(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,day TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id,day));
      CREATE INDEX message_rank_day ON message_rank_daily(day);
      CREATE TABLE message_rank_seen(message_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
      CREATE INDEX message_rank_seen_age ON message_rank_seen(created_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (11, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 12').get()) {
      db.exec(`CREATE TABLE antinuke_config(guild_id TEXT PRIMARY KEY,settings_json TEXT NOT NULL);
      CREATE TABLE antinuke_events(entry_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,action INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX antinuke_events_window ON antinuke_events(guild_id,actor_id,created_at);
      CREATE TABLE antinuke_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,action INTEGER NOT NULL,event_count INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('recorded','alerted','uncertain','unavailable')),created_at INTEGER NOT NULL);`);
      db.prepare('INSERT INTO schema_migrations VALUES (12, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 13').get()) {
      db.exec(`CREATE TABLE guild_tag_config(guild_id TEXT PRIMARY KEY,role_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE guild_tag_grants(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','granted','uncertain')),PRIMARY KEY(guild_id,user_id));`);
      db.prepare('INSERT INTO schema_migrations VALUES (13, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 14').get()) {
      db.exec(`CREATE TABLE voice_master_config(guild_id TEXT PRIMARY KEY,category_id TEXT NOT NULL);
      CREATE TABLE voice_master_channels(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,channel_id TEXT UNIQUE,status TEXT NOT NULL CHECK(status IN ('creating','active','deleting','closed','uncertain')),interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX voice_master_live_owner ON voice_master_channels(guild_id,owner_id) WHERE status!='closed';`);
      db.prepare('INSERT INTO schema_migrations VALUES (14, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 15').get()) {
      db.exec(`CREATE TABLE event_log_deliveries(event_key TEXT PRIMARY KEY,guild_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('reserved','sent','uncertain','unavailable')),created_at INTEGER NOT NULL);
      CREATE INDEX event_log_deliveries_age ON event_log_deliveries(created_at);`);
      db.prepare('INSERT INTO schema_migrations VALUES (15, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 16').get()) {
      db.exec(`CREATE TABLE role_panel_buttons(panel_id INTEGER NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,button_index INTEGER NOT NULL,role_id TEXT NOT NULL,label TEXT NOT NULL,PRIMARY KEY(panel_id,button_index),UNIQUE(panel_id,role_id));
      INSERT INTO role_panel_buttons SELECT id,0,role_id,label FROM role_panels;`);
      db.prepare('INSERT INTO schema_migrations VALUES (16, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 17').get()) {
      db.exec(
        `CREATE TABLE message_rank_privacy(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,opted_out INTEGER NOT NULL DEFAULT 1 CHECK(opted_out IN (0,1)),PRIMARY KEY(guild_id,user_id));`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (17, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 18').get()) {
      db.exec(
        `CREATE TABLE purge_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,channel_id TEXT NOT NULL,ids_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('preview','executing','completed','uncertain')),created_at INTEGER NOT NULL,interaction_id TEXT UNIQUE NOT NULL);`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (18, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 19').get()) {
      db.exec(
        `CREATE TABLE ticket_retention(guild_id TEXT PRIMARY KEY,days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 30));`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (19, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 20').get()) {
      db.exec(
        `CREATE TABLE native_polls(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL CHECK(status IN ('sending','sent','uncertain')),interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (20, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 21').get()) {
      db.exec(
        `CREATE TABLE afk_states(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id));CREATE TABLE afk_notices(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,created_at INTEGER NOT NULL);`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (21, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 22').get()) {
      db.exec(
        `ALTER TABLE voice_master_channels ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0 CHECK(public_access IN (0,1));`,
      );
      db.prepare('INSERT INTO schema_migrations VALUES (22, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 23').get()) {
      db.exec(`CREATE TABLE custom_role_creation_config(guild_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
        CREATE TABLE custom_created_roles(guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,role_id TEXT UNIQUE,name TEXT NOT NULL,color INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('creating','created','uncertain')),interaction_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,owner_id));`);
      db.prepare('INSERT INTO schema_migrations VALUES (23, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 24').get()) {
      db.exec(
        'ALTER TABLE autoresponders ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));',
      );
      db.prepare('INSERT INTO schema_migrations VALUES (24, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version = 25').get()) {
      db.exec(
        "CREATE TABLE role_click_receipts(interaction_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','uncertain')),created_at INTEGER NOT NULL);",
      );
      db.prepare('INSERT INTO schema_migrations VALUES (25, ?)').run(Date.now());
    }
    if (!db.prepare('SELECT version FROM schema_migrations WHERE version=26').get()) {
      db.exec(
        "ALTER TABLE role_click_receipts ADD COLUMN action TEXT NOT NULL DEFAULT 'unknown' CHECK(action IN ('unknown','add','remove'));",
      );
      db.prepare('INSERT INTO schema_migrations VALUES(26,?)').run(Date.now());
    }
  })();
  return db;
}
export class GuildSettings {
  constructor(db) {
    this.db = db;
  }
  get(guildId) {
    const row = this.db
      .prepare('SELECT settings_json FROM guild_settings WHERE guild_id = ?')
      .get(guildId);
    return row ? JSON.parse(row.settings_json) : {};
  }
  set(guildId, value) {
    this.db
      .prepare(
        `INSERT INTO guild_settings VALUES(?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at`,
      )
      .run(guildId, JSON.stringify(value), Date.now());
  }
  patch(guildId, changes) {
    return this.db.transaction(() => {
      const merged = { ...this.get(guildId), ...changes };
      this.set(guildId, merged);
      return merged;
    })();
  }
}
