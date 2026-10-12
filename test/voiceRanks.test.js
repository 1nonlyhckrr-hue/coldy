import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import {
  VoiceRanks,
  createVoiceRankHandler,
  sampleVoiceRanks,
} from '../src/services/voiceRanks.js';
import command from '../src/commands/leaderboard/voicelb.js';
const g = '100000000000000001',
  u = '100000000000000002',
  ch = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:');
  let now = Date.parse('2026-10-12T00:00:00Z');
  const r = new VoiceRanks(db, () => now),
    member = { id: u, guild: { id: g }, user: { bot: false }, permissions: { has: () => true } },
    channel = { id: ch, guildId: g, type: ChannelType.GuildVoice },
    guild = {
      id: g,
      afkChannelId: null,
      members: { fetch: async () => member },
      channels: { fetch: async () => channel },
      voiceStates: { fetch: async () => ({ id: u, guild: { id: g }, channelId: ch }) },
    },
    state = { guild, id: u, channelId: ch },
    old = { guild, id: u, channelId: null },
    c = {
      voiceRanks: r,
      config: { voiceEventsEnabled: true },
      guildConfig: { get: () => ({ language: 'en' }) },
    };
  return { db, r, c, state, old, guild, member, channel, advance: (n) => (now += n) };
}
test('voice ranks offdefault guild policy revision no startupbackfill persistentprivacy erase', () => {
  const s = setup();
  try {
    assert.equal(s.r.config(g).enabled, 0);
    s.r.enable(g, true);
    assert.equal(s.r.config('other').enabled, 0);
    const revision = s.r.config(g).revision;
    s.r.enable(g, true);
    assert.notEqual(s.r.config(g).revision, revision);
    s.r.record(g, u, s.r.now(), s.r.now() + 60000);
    assert.equal(s.r.stats(g, u).retained, 60000);
    s.r.privacy(g, u, true);
    assert.equal(s.r.stats(g, u).retained, 0);
    assert.equal(new VoiceRanks(s.db).optedOut(g, u), true);
    s.r.privacy(g, u, false);
    assert.equal(s.r.optedOut(g, u), false);
  } finally {
    s.db.close();
  }
});
test('voice native samples settled interval only no duplicate no disconnectedtail botsstageafk rejected', async () => {
  const s = setup();
  try {
    s.r.enable(g, true);
    const h = createVoiceRankHandler(s.c);
    await h(s.old, s.state);
    s.advance(60000);
    await sampleVoiceRanks(s.c);
    await sampleVoiceRanks(s.c);
    assert.equal(s.r.stats(g, u).retained, 60000);
    s.advance(10000);
    await h(s.state, { ...s.state, channelId: null });
    assert.equal(s.r.stats(g, u).retained, 60000);
    assert.equal(s.r.sessions.size, 0);
  } finally {
    s.db.close();
  }
  for (const change of [
    (s) => (s.member.user.bot = true),
    (s) => (s.channel.type = ChannelType.GuildStageVoice),
    (s) => (s.guild.afkChannelId = ch),
    (s) =>
      (s.guild.voiceStates.fetch = async () => ({ id: u, guild: { id: g }, channelId: 'other' })),
    (s) => (s.c.config.voiceEventsEnabled = false),
    (s) => s.r.privacy(g, u, true),
  ]) {
    const b = setup();
    try {
      b.r.enable(g, true);
      change(b);
      await createVoiceRankHandler(b.c)(b.old, b.state);
      assert.equal(b.r.sessions.size, 0);
    } finally {
      b.db.close();
    }
  }
});
test('voice policyprivacy/leave races during forcedread drop interval with no storedcount', async () => {
  for (const race of [
    (s) => s.r.enable(g, false),
    (s) => s.r.privacy(g, u, true),
    (s) => s.r.resetMine(g, u),
  ]) {
    const s = setup();
    try {
      s.r.enable(g, true);
      await createVoiceRankHandler(s.c)(s.old, s.state);
      s.advance(60000);
      s.guild.voiceStates.fetch = async () => {
        race(s);
        return { id: u, guild: { id: g }, channelId: ch };
      };
      await sampleVoiceRanks(s.c);
      assert.equal(s.r.stats(g, u).retained, 0);
      assert.equal(s.r.sessions.size, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice long missed interval dropped restart session discarded storedcounts kept', async () => {
  const s = setup();
  try {
    s.r.enable(g, true);
    await createVoiceRankHandler(s.c)(s.old, s.state);
    s.advance(180000);
    await sampleVoiceRanks(s.c);
    assert.equal(s.r.stats(g, u).retained, 0);
    s.advance(60000);
    await sampleVoiceRanks(s.c);
    assert.equal(s.r.stats(g, u).retained, 60000);
    const reopened = new VoiceRanks(s.db, s.r.now);
    assert.equal(reopened.sessions.size, 0);
    assert.equal(reopened.stats(g, u).retained, 60000);
  } finally {
    s.db.close();
  }
});
test('voice day boundaries exact split retention90days stable ties and strictperiodpage', () => {
  const s = setup();
  try {
    const midnight = s.r.now();
    s.r.record(g, u, midnight - 30000, midnight + 30000);
    assert.deepEqual(s.r.stats(g, u), { retained: 60000, today: 30000, week: 60000 });
    s.r.record(g, '100000000000000004', midnight, midnight + 60000);
    assert.equal(s.r.top(g, 'retained')[0].user_id, u);
    for (const args of [
      ['bad', 1],
      ['week', 0],
      ['week', 1.5],
    ])
      assert.throws(() => s.r.top(g, ...args), /voiceRankInput/);
    assert.throws(() => s.r.record(g, u, midnight, midnight + 120001), /voiceRankInput/);
    s.advance(90 * 86400000);
    assert.equal(s.r.stats(g, u).retained, 0);
  } finally {
    s.db.close();
  }
});
test('voice simultaneous sampling guard forced native unknown drops session no guessedtime', async () => {
  const s = setup();
  try {
    s.r.enable(g, true);
    await createVoiceRankHandler(s.c)(s.old, s.state);
    s.advance(60000);
    await Promise.all([sampleVoiceRanks(s.c), sampleVoiceRanks(s.c)]);
    assert.equal(s.r.stats(g, u).retained, 60000);
    s.guild.voiceStates.fetch = async () => {
      throw Error('network');
    };
    s.advance(60000);
    await sampleVoiceRanks(s.c);
    assert.equal(s.r.stats(g, u).retained, 60000);
    assert.equal(s.r.sessions.size, 0);
  } finally {
    s.db.close();
  }
});
test('8voicepaths private3locale policyauthority runtimedisabled commands no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        guild: s.guild,
        guildId: g,
        user: { id: u },
        options: { getSubcommand: () => 'enable', getString: () => null, getInteger: () => null },
        reply: async (p) => (reply = p),
      };
      for (const sub of [
        'enable',
        'config',
        'stats',
        'top',
        'resetmine',
        'optout',
        'optin',
        'disable',
      ]) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      i.options.getSubcommand = () => 'enable';
      s.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
      s.member.permissions.has = () => true;
      s.c.config.voiceEventsEnabled = false;
      await assert.rejects(() => command.execute(i, s.c), /voiceRankEvents/);
    } finally {
      s.db.close();
    }
  }
});
