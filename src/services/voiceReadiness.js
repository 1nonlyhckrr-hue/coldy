import { UserError } from '../utils/errors.js';
export class VoiceReadiness {
  constructor() {
    this.ready = false;
    this.unsafeShards = new Set();
  }
  initialReady() {
    this.ready = true;
  }
  disconnected(shardId) {
    this.unsafeShards.add(shardId);
  }
  // A resumed session replays missed events and a fresh READY resends voice states with the
  // guilds, so the voice cache is trustworthy again; keep the shard blocked only until then.
  recovered(shardId) {
    return this.unsafeShards.delete(shardId);
  }
  require(i, c) {
    if (c.config?.voiceEventsEnabled !== true) throw new UserError('voiceRuntimeDisabled');
    if (
      !this.ready ||
      i.client?.isReady?.() !== true ||
      i.guild?.available === false ||
      this.unsafeShards.has(i.guild?.shardId ?? 0)
    )
      throw new UserError('voiceStateUnavailable');
  }
}
export function requireVoiceReady(i, c) {
  if (!c.voiceReadiness) throw new UserError('voiceStateUnavailable');
  c.voiceReadiness.require(i, c);
}
export function voiceOccupancy(guild, channelId) {
  const cache = guild.voiceStates?.cache;
  if (!cache || typeof cache.values !== 'function') throw new UserError('voiceStateUnavailable');
  let count = 0;
  for (const state of cache.values()) {
    if (
      !state ||
      !(state.channelId === null || (typeof state.channelId === 'string' && state.channelId))
    )
      throw new UserError('voiceStateUnavailable');
    if (state.channelId === channelId) count++;
  }
  return count;
}
