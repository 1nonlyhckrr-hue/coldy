export class Cooldowns {
  constructor(now = Date.now, maxEntries = 10000) {
    this.entries = new Map();
    this.now = now;
    this.maxEntries = maxEntries;
  }
  acquire(key, durationMs) {
    const now = this.now();
    for (const [k, until] of this.entries) if (until <= now) this.entries.delete(k);
    const until = this.entries.get(key);
    if (until > now) return until - now;
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, now + durationMs);
    return 0;
  }
}
