import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceReadiness, requireVoiceReady } from '../src/services/voiceReadiness.js';
test('voice readiness requires initial native ready state and opts out before gateway startup', () => {
  const v = new VoiceReadiness(),
    i = { client: { isReady: () => true }, guild: { shardId: 0, available: true } },
    c = { config: { voiceEventsEnabled: true }, voiceReadiness: v };
  assert.throws(() => requireVoiceReady(i, c), /voiceStateUnavailable/);
  v.initialReady();
  requireVoiceReady(i, c);
  i.client.isReady = () => false;
  assert.throws(() => requireVoiceReady(i, c));
  i.client.isReady = () => true;
  i.guild.available = false;
  assert.throws(() => requireVoiceReady(i, c));
});
test('lost shard stays unsafe after ready/resume to avoid guessing voice cache recovered', () => {
  const v = new VoiceReadiness();
  v.initialReady();
  v.disconnected(1);
  const c = { config: { voiceEventsEnabled: true }, voiceReadiness: v },
    i = { client: { isReady: () => true }, guild: { shardId: 1 } };
  assert.throws(() => requireVoiceReady(i, c));
  v.initialReady();
  assert.throws(() => requireVoiceReady(i, c));
  i.guild.shardId = 0;
  requireVoiceReady(i, c);
  c.config.voiceEventsEnabled = false;
  assert.throws(() => requireVoiceReady(i, c), /voiceRuntimeDisabled/);
});
test('occupancy counts native voice states even when corresponding members are not cached', async () => {
  const { voiceOccupancy } = await import('../src/services/voiceReadiness.js');
  const guild = {
    voiceStates: {
      cache: new Map([
        ['uncached', { channelId: 'room', member: null }],
        ['other', { channelId: 'other' }],
        ['left', { channelId: null }],
      ]),
    },
  };
  assert.equal(voiceOccupancy(guild, 'room'), 1);
  assert.throws(() => voiceOccupancy({}, 'room'), /voiceStateUnavailable/);
});

test('occupancy incomplete native states fail closed instead of reporting a safe empty room', async () => {
  const { voiceOccupancy } = await import('../src/services/voiceReadiness.js');
  for (const state of [
    undefined,
    null,
    {},
    { channelId: undefined },
    { channelId: 0 },
    { channelId: '' },
  ]) {
    const guild = { voiceStates: { cache: new Map([['unknown', state]]) } };
    assert.throws(() => voiceOccupancy(guild, 'room'), /voiceStateUnavailable/);
  }
});
test('occupancy explicit disconnected states and other rooms retain correct current count', async () => {
  const { voiceOccupancy } = await import('../src/services/voiceReadiness.js');
  const guild = {
    voiceStates: {
      cache: new Map([
        ['a', { channelId: 'room' }],
        ['b', { channelId: 'room' }],
        ['c', { channelId: null }],
        ['d', { channelId: 'other' }],
      ]),
    },
  };
  assert.equal(voiceOccupancy(guild, 'room'), 2);
  assert.equal(voiceOccupancy(guild, 'empty'), 0);
});

test('voice readiness exact operator flag prevents malformed truthy values from enabling effects', () => {
  const v = new VoiceReadiness();
  v.initialReady();
  const i = { client: { isReady: () => true }, guild: { shardId: 0 } };
  for (const value of ['true', 'false', 1, {}, null, undefined])
    assert.throws(
      () => v.require(i, { config: { voiceEventsEnabled: value } }),
      /voiceRuntimeDisabled/,
    );
  v.require(i, { config: { voiceEventsEnabled: true } });
});
test('voice native client readiness must positively equal true rather than a truthy unknown result', () => {
  const v = new VoiceReadiness();
  v.initialReady();
  const c = { config: { voiceEventsEnabled: true } },
    i = { guild: { shardId: 0 }, client: {} };
  for (const value of ['true', 1, {}, null, undefined, false]) {
    i.client.isReady = () => value;
    assert.throws(() => v.require(i, c), /voiceStateUnavailable/);
  }
  i.client.isReady = () => true;
  v.require(i, c);
});

test('a recovered shard accepts voice work again and other shards stay blocked', () => {
  const v = new VoiceReadiness();
  v.initialReady();
  v.disconnected(0);
  v.disconnected(1);
  assert.equal(v.recovered(0), true);
  assert.equal(v.recovered(0), false);
  const c = { config: { voiceEventsEnabled: true } };
  const i = (shardId) => ({ client: { isReady: () => true }, guild: { shardId, available: true } });
  assert.doesNotThrow(() => v.require(i(0), c));
  assert.throws(() => v.require(i(1), c), { message: 'voiceStateUnavailable' });
});
