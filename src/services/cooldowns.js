export class Cooldowns {
  constructor(now = Date.now, maxEntries = 10000) {
    if (
      typeof now !== 'function' ||
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      maxEntries > 100000
    )
      throw new TypeError('Invalid cooldown configuration');
    this.entries = new Map();
    this.now = now;
    this.maxEntries = maxEntries;
  }
  acquire(key, durationMs) {
    if (
      typeof key !== 'string' ||
      !key ||
      key.length > 500 ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 1 ||
      durationMs > 86400000
    )
      throw new TypeError('Invalid cooldown request');
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + durationMs))
      throw new TypeError('Invalid cooldown clock');
    for (const [k, until] of this.entries) if (until <= now) this.entries.delete(k);
    const until = this.entries.get(key);
    if (until > now) return until - now;
    // Never evict a live guard to make room for another key.
    if (this.entries.size >= this.maxEntries) {
      let first = Infinity;
      for (const expiry of this.entries.values()) first = Math.min(first, expiry);
      return Math.max(1, first - now);
    }
    this.entries.set(key, now + durationMs);
    return 0;
  }
}
