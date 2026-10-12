import { Shoukaku, Connectors, Constants } from 'shoukaku';
import { requireDaveNode } from './musicPolicy.js';
import { UserError } from '../utils/errors.js';
// Prepared adapter only. No credentials, node or startup hook is configured in this checkpoint.
export class LavalinkAdapter {
  constructor(manager) {
    this.manager = manager;
    this.onEnded = null;
    this.eventIds = new Map();
  }
  static create(client, node, logger) {
    if (
      !node ||
      typeof node.name !== 'string' ||
      typeof node.url !== 'string' ||
      typeof node.auth !== 'string' ||
      node.secure !== true
    )
      throw new TypeError('Verified secure node config required');
    const manager = new Shoukaku(new Connectors.DiscordJS(client), [node], {
      resume: false,
      resumeByLibrary: false,
      reconnectTries: 3,
      reconnectInterval: 10,
      restTimeout: 15,
      voiceConnectionTimeout: 20,
      moveOnDisconnect: false,
    });
    // Avoid raw debug errors, endpoint auth, Discord voice tokens or provider bodies in logs.
    manager.on('error', () => logger.warn({ kind: 'lavalink' }, 'Music provider unavailable'));
    manager.on('close', () =>
      logger.warn({ kind: 'lavalink' }, 'Music provider connection closed'),
    );
    const adapter = new this(manager);
    adapter.logger = logger;
    return adapter;
  }
  node() {
    const node = [...this.manager.nodes.values()].find(
      (n) => n.state === Constants.State.CONNECTED,
    );
    if (!node) throw new UserError('musicProviderUnavailable');
    requireDaveNode(node.info, this.requiredSource ?? 'http');
    return node;
  }
  async resolve(item) {
    const result = await this.node().rest.resolve(item.url);
    if (
      result?.loadType !== 'track' ||
      result.data?.info?.sourceName !== 'http' ||
      result.data.info.isStream ||
      result.data.info.uri !== item.url
    )
      throw new UserError('musicLoadFailed');
    return { encoded: result.data.encoded };
  }
  async join(guildId, channelId) {
    this.node();
    const player = await this.manager.joinVoiceChannel({
      guildId,
      channelId,
      shardId: this.manager.connector?.client?.guilds?.cache?.get(guildId)?.shardId ?? 0,
      deaf: true,
    });
    player.on('end', (event) => {
      const current = this.eventIds.get(guildId);
      if (current && event.track?.userData?.lunaEventId === current.eventId)
        void this.onEnded?.(guildId, current.eventId, event.reason);
    });
    for (const event of ['exception', 'stuck', 'closed'])
      player.on(event, () => {
        const current = this.eventIds.get(guildId);
        if (current) void this.onEnded?.(guildId, current.eventId, 'error');
      });
    return player;
  }
  async play(guildId, encoded, eventId) {
    const player = this.manager.players.get(guildId);
    if (!player) throw new UserError('musicNoSession');
    this.eventIds.set(guildId, { encoded, eventId });
    await player.playTrack({ track: { encoded, userData: { lunaEventId: eventId } }, volume: 50 });
  }
  async stopTrack(guildId) {
    const player = this.manager.players.get(guildId);
    if (!player) throw new UserError('musicNoSession');
    await player.stopTrack();
  }
  async pause(guildId, paused) {
    const player = this.manager.players.get(guildId);
    if (!player) throw new UserError('musicNoSession');
    await player.setPaused(paused);
  }
  async leave(guildId) {
    await this.manager.leaveVoiceChannel(guildId);
    this.eventIds.delete(guildId);
  }
}
