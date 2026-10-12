import { ActivityType } from 'discord.js';
// The bot presence shown in every server. Stored in SQLite so it survives restarts. Nothing is set
// until an owner or delegate runs /activity.
export const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  streaming: ActivityType.Streaming,
};
const STREAM_URL = /^https:\/\/(www\.)?(twitch\.tv|youtube\.com)\/[^\s]{1,150}$/i;
export function validStreamUrl(url) {
  return STREAM_URL.test(url);
}
export class BotActivity {
  constructor(db) {
    this.db = db;
  }
  get() {
    return this.db.prepare('SELECT type,text,url FROM bot_activity WHERE id=1').get() ?? null;
  }
  set(type, text, url = null) {
    if (!(type in ACTIVITY_TYPES) || typeof text !== 'string' || !text.trim() || text.length > 128)
      throw new RangeError('invalid activity');
    if (type === 'streaming' && !validStreamUrl(url)) throw new RangeError('invalid stream url');
    this.db
      .prepare('INSERT OR REPLACE INTO bot_activity VALUES(1,?,?,?)')
      .run(type, text.trim(), type === 'streaming' ? url : null);
  }
  clear() {
    return this.db.prepare('DELETE FROM bot_activity WHERE id=1').run().changes;
  }
  /** Applies the saved presence (or clears it) on the connected client. */
  apply(client) {
    const a = this.get();
    client.user?.setPresence({
      activities: a
        ? [{ name: a.text, type: ACTIVITY_TYPES[a.type], ...(a.url ? { url: a.url } : {}) }]
        : [],
    });
    return a;
  }
}
