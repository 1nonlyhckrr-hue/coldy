import { ChannelType } from 'discord.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGuild } from './helpers/guild.js';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig, renderTemplate, validateOutputChannel } from '../src/services/guildConfig.js';
test('validated nested settings preserve sections and reject invalid input', () => {
  const db = openDatabase(':memory:');
  try {
    const c = new GuildConfig(new GuildSettings(db));
    assert.equal(c.get('g').logging.enabled, false);
    c.patch('g', 'logging', { channelId: '100000000000000001', enabled: true });
    c.patch('g', 'welcome', { message: 'Hi {user}' });
    assert.equal(c.get('g').logging.enabled, true);
    assert.equal(c.get('other').welcome.enabled, false);
    assert.throws(() => c.patch('g', 'welcome', { message: 'x'.repeat(1801) }));
    assert.throws(() => c.patch('g', 'logging', { untrusted: true }));
    assert.throws(() => c.patch('g', 'unknown', {}));
    assert.equal(c.reset('g', 'logging').enabled, false);
    assert.equal(c.get('g').logging.channelId, undefined);
  } finally {
    db.close();
  }
});
test('templates replace known placeholders without code execution and stay bounded', () => {
  const m = { id: '1', user: { username: 'safe' }, guild: { name: 'Server', memberCount: 3 } };
  assert.equal(
    renderTemplate('Hi {user} {username} {server} {count} {unknown}', m),
    'Hi <@1> safe Server 3 {unknown}',
  );
  assert.equal(renderTemplate('x'.repeat(2000), m).length, 1900);
});
test('destination check refuses foreign, voice, missing and denied channels', async () => {
  for (const mutate of [
    (s) => (s.channel.guildId = 'other'),
    (s) => (s.channel.type = ChannelType.GuildVoice),
    (s) => (s.channel.permissionsFor = () => null),
    (s) => (s.guild.channels.fetch = async () => null),
  ]) {
    const s = makeGuild();
    mutate(s);
    await assert.rejects(() => validateOutputChannel(s.guild, '100000000000000001'));
  }
  assert(await validateOutputChannel(makeGuild().guild, '100000000000000001'));
});

test('welcome embed color schema rejects out-of-range/noninteger and retains zero', () => {
  const db = openDatabase(':memory:');
  try {
    const c = new GuildConfig(new GuildSettings(db));
    for (const v of [-1, 0x1000000, 1.5, 'abc'])
      assert.throws(() => c.patch('g', 'welcome', { color: v }));
    c.patch('g', 'welcome', { color: 0 });
    assert.equal(c.get('g').welcome.color, 0);
    assert.equal(new GuildConfig(new GuildSettings(db)).get('g').welcome.color, 0);
  } finally {
    db.close();
  }
});
test('shared output validation force-fetches exact destination and refuses wrong native ID', async () => {
  const s = makeGuild(),
    id = '100000000000000001';
  let reads = 0;
  s.guild.channels.fetch = async (selected, o) => {
    reads++;
    assert.equal(selected, id);
    assert.equal(o.force, true);
    return s.channel;
  };
  assert.equal(await validateOutputChannel(s.guild, id), s.channel);
  assert.equal(reads, 1);
  s.channel.id = 'other';
  await assert.rejects(() => validateOutputChannel(s.guild, id), /channelTypeInvalid/);
});

test('shared output validation requires exact current application bot and guild before permission resolution', async () => {
  for (const bad of [
    { id: 'other', guild: { id: 'g' } },
    { id: 'b', guild: { id: 'other' } },
    null,
  ]) {
    const s = makeGuild();
    let resolved = 0;
    s.channel.permissionsFor = () => {
      resolved++;
      return { has: () => true };
    };
    s.guild.members.fetchMe = async (opts) => {
      assert.deepEqual(opts, { force: true });
      return bad;
    };
    await assert.rejects(
      () => validateOutputChannel(s.guild, s.channel.id),
      /channelPermissionMissing/,
    );
    assert.equal(resolved, 0);
  }
  const s = makeGuild();
  delete s.guild.client;
  await assert.rejects(
    () => validateOutputChannel(s.guild, s.channel.id),
    /channelPermissionMissing/,
  );
});

test('welcome title schema persists bounded static values and rejects mentions/control characters', () => {
  const db = openDatabase(':memory:');
  try {
    const c = new GuildConfig(new GuildSettings(db));
    for (const value of ['', '@everyone', 'a\nb', 'x'.repeat(121)])
      assert.throws(() => c.patch('g', 'welcome', { title: value }));
    c.patch('g', 'welcome', { title: 'Static {server}', goodbyeTitle: 'Bye' });
    const next = new GuildConfig(new GuildSettings(db));
    assert.equal(next.get('g').welcome.title, 'Static {server}');
    assert.equal(next.get('other').welcome.title, undefined);
    c.patch('g', 'welcome', { title: undefined });
    assert.equal(c.get('g').welcome.goodbyeTitle, 'Bye');
  } finally {
    db.close();
  }
});
