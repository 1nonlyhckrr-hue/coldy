import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { memberMessageChannel } from '../src/services/welcomeAssets.js';
import { exportWelcome, importWelcome } from '../src/services/welcomeLibrary.js';
import { createMemberMessageHandler } from '../src/events/memberMessages.js';
import goodbye from '../src/commands/welcomer/goodbye.js';
import welcome from '../src/commands/welcomer/welcome.js';
import { makeGuild } from './helpers/guild.js';
const a = '100000000000000001',
  b = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    s = makeGuild();
  const actor = {
    id: '100000000000000009',
    guild: s.guild,
    displayName: 'Leaving',
    user: { username: 'test' },
    permissions: { has: () => true },
  };
  s.guild.members.fetch = async () => actor;
  const original = s.guild.channels.fetch,
    requested = [];
  s.guild.channels.fetch = async (id, ...args) => {
    requested.push(id);
    const ch = await original(a, ...args);
    return { ...ch, id };
  };
  const c = { guildConfig, config: { memberEventsEnabled: true }, logger: { warn() {} } };
  let sub = 'set',
    reply;
  const i = {
    guild: s.guild,
    guildId: 'g',
    member: actor,
    user: { id: actor.id },
    options: {
      getSubcommand: () => sub,
      getChannel: () => ({ id: b }),
      getBoolean: () => true,
      getString: () => null,
    },
    deferReply: async () => {},
    editReply: async (p) => {
      reply = p;
    },
  };
  guildConfig.patch('g', 'welcome', {
    channelId: a,
    enabled: true,
    goodbyeEnabled: true,
    goodbyeMessage: 'Bye {username}',
  });
  return {
    db,
    guildConfig,
    s,
    actor,
    c,
    i,
    requested,
    setSub: (v) => {
      sub = v;
    },
    reply: () => reply,
  };
}
test('legacy goodbye destination falls back; separate destination leaves welcome untouched', async () => {
  const x = setup();
  try {
    assert.equal(memberMessageChannel(x.guildConfig.get('g').welcome, 'goodbye'), a);
    await goodbye.execute(x.i, x.c);
    assert.equal(x.guildConfig.get('g').welcome.channelId, a);
    assert.equal(x.guildConfig.get('g').welcome.goodbyeChannelId, b);
    assert.equal(memberMessageChannel(x.guildConfig.get('g').welcome, 'welcome'), a);
    x.requested.length = 0;
    await createMemberMessageHandler(x.c, 'welcome')(x.actor);
    await createMemberMessageHandler(x.c, 'goodbye')(x.actor);
    assert.deepEqual(x.requested, [a, b]);
    x.setSub('test');
    await goodbye.execute(x.i, x.c);
    assert.equal(x.requested.at(-1), b);
    x.setSub('goodbye');
    await welcome.execute(x.i, x.c);
    assert.equal(x.requested.at(-1), b);
    assert.equal(x.guildConfig.get('other').welcome.goodbyeChannelId, undefined);
  } finally {
    x.db.close();
  }
});
test('goodbye set rechecks current authority after destination validation, rejects unavailable destination', async () => {
  const x = setup();
  try {
    x.s.guild.members.fetch = async () => ({ ...x.actor, permissions: { has: () => false } });
    await assert.rejects(() => goodbye.execute(x.i, x.c), /userPermission/);
    assert.equal(x.guildConfig.get('g').welcome.goodbyeChannelId, undefined);
    x.s.guild.members.fetch = async () => x.actor;
    x.s.guild.channels.fetch = async () => null;
    await assert.rejects(() => goodbye.execute(x.i, x.c));
    assert.equal(x.guildConfig.get('g').welcome.channelId, a);
    assert.equal(x.guildConfig.get('g').welcome.goodbyeChannelId, undefined);
  } finally {
    x.db.close();
  }
});
test('changed goodbye destination during native lookup suppresses old-channel test/event', async () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', { goodbyeChannelId: b });
    const f = x.s.guild.channels.fetch;
    x.s.guild.channels.fetch = async (...args) => {
      const ch = await f(...args);
      x.guildConfig.patch('g', 'welcome', { goodbyeChannelId: a });
      return ch;
    };
    await createMemberMessageHandler(x.c, 'goodbye')(x.actor);
    assert.equal(x.s.sent.length, 0);
    x.guildConfig.patch('g', 'welcome', { goodbyeChannelId: b });
    x.setSub('test');
    await assert.rejects(() => goodbye.execute(x.i, x.c), /welcomeChannelRequired/);
    assert.equal(x.s.sent.length, 0);
  } finally {
    x.db.close();
  }
});
test('portable library excludes both channels, import preserves them and disables delivery', () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', { goodbyeChannelId: b });
    const lib = exportWelcome(x.guildConfig, 'g');
    assert.equal(lib.channelId, undefined);
    assert.equal(lib.goodbyeChannelId, undefined);
    importWelcome(x.guildConfig, 'g', JSON.stringify(lib));
    const s = x.guildConfig.get('g').welcome;
    assert.equal(s.channelId, a);
    assert.equal(s.goodbyeChannelId, b);
    assert.equal(s.enabled, false);
    assert.equal(s.goodbyeEnabled, false);
    assert.throws(
      () => importWelcome(x.guildConfig, 'g', JSON.stringify({ ...lib, goodbyeChannelId: b })),
      /welcomeImportInvalid/,
    );
  } finally {
    x.db.close();
  }
});
test('separate goodbye destination survives actual SQLite restart and invalid IDs are rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-goodbye-'));
  let db = openDatabase(join(dir, 'test.sqlite'));
  try {
    let c = new GuildConfig(new GuildSettings(db));
    c.patch('g', 'welcome', { channelId: a, goodbyeChannelId: b });
    assert.throws(() => c.patch('g', 'welcome', { goodbyeChannelId: 'wrong' }));
    db.close();
    db = openDatabase(join(dir, 'test.sqlite'));
    c = new GuildConfig(new GuildSettings(db));
    assert.equal(c.get('g').welcome.goodbyeChannelId, b);
    assert.equal(c.get('g').welcome.channelId, a);
    assert.equal(c.get('other').welcome.goodbyeChannelId, undefined);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
