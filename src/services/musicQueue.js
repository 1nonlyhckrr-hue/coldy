import { randomUUID, randomInt } from 'node:crypto';
import { UserError } from '../utils/errors.js';
export class MusicQueues {
  constructor(adapter, catalog, { maxGuilds = 100, maxTracks = 50, logger } = {}) {
    this.adapter = adapter;
    this.catalog = new Map(catalog.map((item) => [item.id, item]));
    this.maxGuilds = maxGuilds;
    this.maxTracks = maxTracks;
    this.logger = logger;
    this.sessions = new Map();
    this.active = new Set();
  }
  async locked(guildId, fn) {
    if (this.active.has(guildId)) throw new UserError('musicBusy');
    this.active.add(guildId);
    try {
      return await fn();
    } finally {
      this.active.delete(guildId);
    }
  }
  snapshot(guildId) {
    const s = this.sessions.get(guildId);
    if (!s) return null;
    return {
      channelId: s.channelId,
      paused: s.paused,
      keepConnected: s.keepConnected,
      status: s.status,
      current: s.current
        ? { id: s.current.item.id, title: s.current.item.title, author: s.current.item.author }
        : null,
      queue: s.queue.map((t) => ({ id: t.item.id, title: t.item.title, author: t.item.author })),
    };
  }
  async enqueue(guildId, channelId, catalogId, requesterId) {
    const item = this.catalog.get(catalogId);
    if (!item) throw new UserError('musicCatalogMissing');
    return this.enqueueItem(guildId, channelId, item, requesterId);
  }
  async enqueueItem(guildId, channelId, item, requesterId, { beforeEffect } = {}) {
    return this.locked(guildId, async () => {
      let s = this.sessions.get(guildId);
      if (s && s.channelId !== channelId) throw new UserError('musicDifferentChannel');
      if (s?.status === 'uncertain') throw new UserError('musicUncertain');
      if (s && s.queue.length + (s.current ? 1 : 0) >= this.maxTracks)
        throw new UserError('musicQueueFull');
      if (!s) {
        if (this.sessions.size >= this.maxGuilds) throw new UserError('musicGuildLimit');
        s = {
          channelId,
          queue: [],
          current: null,
          paused: false,
          keepConnected: false,
          status: 'joining',
        };
        this.sessions.set(guildId, s);
      }
      let resolved;
      try {
        resolved = await this.adapter.resolve(item);
      } catch {
        if (s.status === 'joining') this.sessions.delete(guildId);
        throw new UserError('musicLoadFailed');
      }
      if (!resolved || typeof resolved.encoded !== 'string' || !resolved.encoded) {
        if (s.status === 'joining') this.sessions.delete(guildId);
        throw new UserError('musicLoadFailed');
      }
      if (beforeEffect) {
        try {
          await beforeEffect();
        } catch (error) {
          if (s.status === 'joining') this.sessions.delete(guildId);
          throw error;
        }
      }
      if (s.status === 'joining') {
        try {
          await this.adapter.join(guildId, channelId);
          s.status = 'ready';
        } catch {
          s.status = 'uncertain';
          throw new UserError('musicUncertain');
        }
      }
      if (beforeEffect && !s.current) {
        try {
          await beforeEffect();
        } catch (error) {
          // A join may already exist; preserve it frozen for explicit stop, never auto play.
          s.status = 'uncertain';
          throw error;
        }
      }
      const track = {
        item: resolved.item ?? item,
        encoded: resolved.encoded,
        requesterId,
        eventId: randomUUID(),
      };
      s.queue.push(track);
      if (!s.current) await this.advance(guildId, s);
      return this.snapshot(guildId);
    });
  }
  async advance(guildId, s) {
    const track = s.queue.shift();
    if (!track) {
      s.current = null;
      s.status = 'idle';
      if (!s.keepConnected) {
        try {
          await this.adapter.leave(guildId);
          this.sessions.delete(guildId);
        } catch {
          s.status = 'uncertain';
        }
      }
      return;
    }
    // Store current state before effect; don't repeat an uncertain play.
    s.current = track;
    s.status = 'playing';
    s.paused = false;
    try {
      await this.adapter.play(guildId, track.encoded, track.eventId);
    } catch {
      s.status = 'uncertain';
      throw new UserError('musicUncertain');
    }
  }
  async ended(guildId, eventId, reason) {
    const current = this.sessions.get(guildId)?.current;
    // Expected stop acknowledgement during an explicit skip is not a second advance.
    if (current?.eventId === eventId && current.skipRequested && reason === 'stopped') return false;
    try {
      return await this.locked(guildId, async () => {
        const s = this.sessions.get(guildId);
        if (!s || !s.current || s.current.eventId !== eventId || s.status === 'uncertain')
          return false;
        if (reason === 'finished') {
          s.current = null;
          await this.advance(guildId, s);
          return true;
        }
        // Provider/load/voice failure must not trigger queue cascading or infinite retries.
        s.status = 'uncertain';
        return true;
      });
    } catch {
      const s = this.sessions.get(guildId);
      if (s) s.status = 'uncertain';
      this.logger?.warn(
        { guildId, kind: 'music_event' },
        'Music event needs review; no automatic retry',
      );
      return false;
    }
  }
  async skip(guildId, { beforeEffect } = {}) {
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s?.current) throw new UserError('musicNoTrack');
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      const track = s.current;
      if (beforeEffect) await beforeEffect();
      track.skipRequested = true;
      try {
        await this.adapter.stopTrack(guildId);
      } catch {
        s.status = 'uncertain';
        throw new UserError('musicUncertain');
      }
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      if (beforeEffect) {
        try {
          await beforeEffect();
        } catch (error) {
          s.status = 'uncertain';
          throw error;
        }
      }
      s.current = null;
      await this.advance(guildId, s);
      return this.snapshot(guildId);
    });
  }
  async editQueue(guildId, action, position, random = randomInt) {
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s) throw new UserError('musicNoSession');
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      if (action === 'remove') {
        if (!Number.isInteger(position) || position < 1 || position > s.queue.length)
          throw new UserError('musicQueuePosition');
        s.queue.splice(position - 1, 1);
      } else if (action === 'clear') s.queue = [];
      else if (action === 'shuffle') {
        // Build separately. A bad RNG cannot partially rewrite a session.
        const shuffled = [...s.queue];
        for (let n = shuffled.length - 1; n > 0; n--) {
          const k = random(n + 1);
          if (!Number.isInteger(k) || k < 0 || k > n) throw new TypeError('Invalid shuffle RNG');
          [shuffled[n], shuffled[k]] = [shuffled[k], shuffled[n]];
        }
        s.queue = shuffled;
      } else throw new TypeError('Invalid queue action');
      return this.snapshot(guildId);
    });
  }
  async moveQueued(guildId, from, to, { beforeEffect } = {}) {
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s) throw new UserError('musicNoSession');
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 1 ||
        to < 1 ||
        from > s.queue.length ||
        to > s.queue.length
      )
        throw new UserError('musicQueuePosition');
      const revision = s.queue.map((r) => r.eventId).join('|');
      if (beforeEffect) await beforeEffect();
      if (
        this.sessions.get(guildId) !== s ||
        s.status === 'uncertain' ||
        s.queue.map((r) => r.eventId).join('|') !== revision
      )
        throw new UserError('musicUncertain');
      const reordered = [...s.queue];
      const [track] = reordered.splice(from - 1, 1);
      reordered.splice(to - 1, 0, track);
      s.queue = reordered;
      return this.snapshot(guildId);
    });
  }
  async pause(guildId, paused) {
    if (typeof paused !== 'boolean') throw new TypeError('Invalid pause state');
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s?.current) throw new UserError('musicNoTrack');
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      try {
        await this.adapter.pause(guildId, paused);
        s.paused = paused;
      } catch {
        s.status = 'uncertain';
        throw new UserError('musicUncertain');
      }
    });
  }
  async stay(guildId, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid stay state');
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s) throw new UserError('musicNoSession');
      if (s.status === 'uncertain') throw new UserError('musicUncertain');
      s.keepConnected = enabled;
      if (!enabled && !s.current) await this.advance(guildId, s);
    });
  }
  async stop(guildId) {
    return this.locked(guildId, async () => {
      const s = this.sessions.get(guildId);
      if (!s) return false;
      try {
        await this.adapter.leave(guildId);
        this.sessions.delete(guildId);
        return true;
      } catch {
        s.status = 'uncertain';
        throw new UserError('musicUncertain');
      }
    });
  }
}
