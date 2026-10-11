import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  musicRequest,
  validateMusicNodeConfig,
  YouTubeLavalinkAdapter,
  requireMusicVoice,
} from '../src/services/musicRuntime.js';
import { MusicQueues } from '../src/services/musicQueue.js';
import { loadConfig } from '../src/config/env.js';
import command from '../src/commands/music/music.js';
import { Constants } from 'shoukaku';
const info = { version: { major: 4, minor: 2 }, sourceManagers: ['youtube'] };
function adapter(result) {
  return new YouTubeLavalinkAdapter({
    nodes: new Map([
      ['n', { state: Constants.State.CONNECTED, info, rest: { resolve: async () => result } }],
    ]),
  });
}
const track = {
  encoded: 'track',
  info: {
    identifier: 'abcdefghijk',
    title: 'A@everyone',
    author: 'Maker',
    sourceName: 'youtube',
    isStream: false,
    length: 10000,
  },
};
test('YouTube requests allow bounded words/video ID but no arbitrary URL,prefix,playlist/control', () => {
  assert.equal(musicRequest('Bollywood song').url, 'ytsearch:Bollywood song');
  assert.equal(musicRequest('abcdefghijk').url, 'https://www.youtube.com/watch?v=abcdefghijk');
  for (const q of [
    '',
    ' '.repeat(3),
    'a'.repeat(181),
    'https://youtube.com/watch?v=x',
    'ytsearch:x',
    'hello\nworld',
    'www.example.com',
    '<@1>',
  ])
    assert.throws(() => musicRequest(q));
});
test('music defaults off;explicit risk,node secrets and voice events required without leaking values', () => {
  assert.equal(validateMusicNodeConfig(), null);
  const v = {
    enabled: true,
    riskAccepted: true,
    url: 'node.example.org:443',
    auth: 'test-fixture',
  };
  assert.equal(validateMusicNodeConfig(v).secure, true);
  for (const change of [
    { riskAccepted: false },
    { auth: '' },
    { url: 'http://node.example.org' },
    { url: '127.0.0.1' },
    { url: 'host.internal' },
    { url: 'user:pass@node.example.org' },
    { url: 'node.example.org/path' },
  ])
    assert.throws(() => validateMusicNodeConfig({ ...v, ...change }));
  const env = {
    DISCORD_TOKEN: 'x'.repeat(40),
    DISCORD_CLIENT_ID: '123456789012345678',
    OWNER_IDS: '123456789012345678',
  };
  assert.equal(loadConfig(env).musicNode, null);
  assert.throws(
    () =>
      loadConfig({
        ...env,
        ENABLE_MUSIC: 'true',
        MUSIC_RISK_ACCEPTED: 'true',
        LAVALINK_URL: v.url,
        LAVALINK_AUTH: v.auth,
      }),
    /voice/i,
  );
  assert(
    loadConfig({
      ...env,
      ENABLE_MUSIC: 'true',
      ENABLE_VOICE_EVENTS: 'true',
      MUSIC_RISK_ACCEPTED: 'true',
      LAVALINK_URL: v.url,
      LAVALINK_AUTH: v.auth,
    }).musicNode,
  );
});
test('YouTube resolve accepts exact source finite track/search first only and refuses snapshots/live/foreign/error', async () => {
  for (const type of ['track', 'search']) {
    const a = adapter({ loadType: type, data: type === 'track' ? track : [track] });
    assert.equal((await a.resolve(musicRequest('song'))).item.id, 'abcdefghijk');
  }
  for (const change of [
    { sourceName: 'http' },
    { isStream: true },
    { length: 0 },
    { length: 7200001 },
    { identifier: 'bad' },
  ])
    await assert.rejects(() =>
      adapter({
        loadType: 'track',
        data: { ...track, info: { ...track.info, ...change } },
      }).resolve(musicRequest('song')),
    );
  for (const type of ['empty', 'playlist', 'error'])
    await assert.rejects(() => adapter({ loadType: type, data: [] }).resolve(musicRequest('song')));
  const a = adapter({ loadType: 'track', data: track });
  a.manager.nodes.get('n').info = { ...info, version: { major: 0, minor: 0 } };
  await assert.rejects(() => a.resolve(musicRequest('song')), /musicNodeIncompatible/);
});
test('dynamic queue keeps provider title not query;normal end advances and24/7 idle is not persistence', async () => {
  const a = {
    resolve: async () => ({
      encoded: 'x',
      item: { id: 'abcdefghijk', title: 'Actual', author: 'Artist' },
    }),
    join: async () => {},
    play: async () => {},
    leave: async () => {},
    pause: async () => {},
  };
  const q = new MusicQueues(a, []);
  await q.enqueueItem('g', 'vc', musicRequest('query'), 'u');
  assert.equal(q.snapshot('g').current.title, 'Actual');
  await q.stay('g', true);
  await q.ended('g', q.sessions.get('g').current.eventId, 'finished');
  assert.equal(q.snapshot('g').status, 'idle');
  assert.equal(new MusicQueues(a, []).snapshot('g'), null);
  await q.stop('g');
  assert.equal(q.snapshot('g'), null);
});
function setup() {
  const replies = [],
    calls = [];
  const actor = { id: 'u', guild: { id: 'g' }, user: { bot: false }, voice: { channelId: 'vc' } },
    bot = { id: 'b', guild: { id: 'g' }, voice: { channelId: null } };
  const channel = {
    id: 'vc',
    guildId: 'g',
    type: 2,
    userLimit: 0,
    permissionsFor: () => ({ has: () => true }),
  };
  const guild = {
    id: 'g',
    channels: { fetch: async () => channel },
    members: { fetch: async () => actor, fetchMe: async () => bot },
    voiceStates: { cache: new Map() },
  };
  const c = {
    config: { voiceEventsEnabled: true },
    voiceReadiness: { require: () => {} },
    guildConfig: { language: () => 'en' },
    music: {
      snapshot: () => null,
      enqueueItem: async (...x) => calls.push(x),
      pause: async () => {},
      stop: async () => {},
      stay: async () => {},
    },
  };
  const i = {
    guildId: 'g',
    guild,
    user: { id: 'u' },
    client: { user: { id: 'b' } },
    appPermissions: { has: () => true },
    options: { getSubcommand: () => 'play', getString: () => 'song', getBoolean: () => true },
    deferReply: async (p) => replies.push(p),
    editReply: async (p) => replies.push(p),
  };
  return { i, c, actor, bot, channel, calls, replies };
}
test('music access exact current actor/bot/channel/same-session/capacity checks before effects', async () => {
  for (const change of [
    (x) => (x.actor.guild.id = 'other'),
    (x) => (x.bot.id = 'other'),
    (x) => (x.channel.type = 13),
    (x) => (x.actor.voice.channelId = null),
    (x) => (x.i.appPermissions.has = () => false),
    (x) => (x.c.music.snapshot = () => ({ channelId: 'other' })),
    (x) => (x.bot.voice.channelId = 'other'),
  ]) {
    const x = setup();
    change(x);
    await assert.rejects(() => requireMusicVoice(x.i, x.c, { joining: true }));
    assert.equal(x.calls.length, 0);
  }
  const x = setup();
  x.channel.userLimit = 1;
  x.i.guild.voiceStates.cache.set('a', { channelId: 'vc' });
  await assert.rejects(() => requireMusicVoice(x.i, x.c, { joining: true }), /voiceChannelFull/);
});
test('music commands all privately localized,escaped,no ping and runtime off cannot effect', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['play', 'pause', 'resume', 'stop', 'queue', 'nowplaying', 'stay']) {
      const x = setup();
      x.c.guildConfig.language = () => locale;
      x.i.options.getSubcommand = () => sub;
      x.c.music.snapshot = () => ({
        channelId: 'vc',
        status: 'playing',
        paused: false,
        keepConnected: false,
        current: { title: '*track* @everyone', author: 'a' },
        queue: [],
      });
      await command.execute(x.i, x.c);
      assert.equal(x.replies[0].flags, 64);
      assert.deepEqual(x.replies[1].allowedMentions.parse, []);
      assert(x.replies[1].embeds[0].data.description.includes('\\*track\\*'));
    }
  const x = setup();
  delete x.c.music;
  await assert.rejects(() => command.execute(x.i, x.c), /musicRuntimeDisabled/);
  assert.equal(x.calls.length, 0);
});
test('music voice move during recheck refuses play', async () => {
  const x = setup();
  let n = 0;
  x.i.guild.members.fetch = async () =>
    ++n === 1 ? x.actor : { ...x.actor, voice: { channelId: 'other' } };
  await assert.rejects(() => command.execute(x.i, x.c), /voiceMoved/);
  assert.equal(x.calls.length, 0);
});
