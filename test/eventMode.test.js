import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import {
  EventMode,
  eventSnapshot,
  configureEventMode,
  changeEventMode,
} from '../src/services/eventMode.js';
import command from '../src/commands/automations/event.js';
const g = '100000000000000001',
  u = '100000000000000002',
  b = '100000000000000003',
  cat = '100000000000000004',
  ch = '100000000000000005';
const overwrite = (id, allow, deny = 0n, type = 0) => ({
  id,
  type,
  allow: new PermissionsBitField(allow),
  deny: new PermissionsBitField(deny),
});
function setup() {
  const db = openDatabase(':memory:'),
    e = new EventMode(db),
    calls = [],
    actor = { id: u, guild: { id: g } },
    bot = { id: b, guild: { id: g }, permissions: { has: () => true } },
    channels = new Map();
  for (const [id, type] of [
    [cat, ChannelType.GuildCategory],
    [ch, ChannelType.GuildText],
  ]) {
    const cache = new Map([
      [b, overwrite(b, P.ViewChannel | P.ManageRoles | P.ManageChannels, 0n, 1)],
    ]);
    if (id === cat) cache.set(g, overwrite(g, P.SendMessages | P.ViewChannel));
    const channel = {
      id,
      guildId: g,
      type,
      parentId: null,
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: {
        cache,
        edit: async (id, { ViewChannel }) => {
          calls.push(['edit', id, ViewChannel]);
          const row = cache.get(id) ?? overwrite(id, 0n);
          row.allow = new PermissionsBitField(row.allow.bitfield & ~P.ViewChannel);
          row.deny = new PermissionsBitField(row.deny.bitfield & ~P.ViewChannel);
          if (ViewChannel === true)
            row.allow = new PermissionsBitField(row.allow.bitfield | P.ViewChannel);
          if (ViewChannel === false)
            row.deny = new PermissionsBitField(row.deny.bitfield | P.ViewChannel);
          cache.set(id, row);
        },
        delete: async (id) => {
          calls.push(['delete', id]);
          cache.delete(id);
        },
      },
    };
    channels.set(id, channel);
  }
  const guild = {
      id: g,
      ownerId: u,
      fetch: async () => guild,
      memberCount: 100,
      members: { fetch: async () => actor, fetchMe: async () => bot },
      channels: { fetch: async (id) => channels.get(id) },
    },
    i = {
      guild,
      guildId: g,
      user: { id: u },
      client: { user: { id: b } },
      appPermissions: { has: () => true },
    },
    c = { eventMode: e, guildConfig: { get: () => ({ language: 'en' }) } };
  return {
    db,
    e,
    c,
    i,
    bot,
    channels,
    calls,
    configure: () => configureEventMode(i, c, { categoryId: cat, channels: [ch], confirm: true }),
  };
}
test('eventmode offdefault isolatedpersist configcap min100 owneronly setup no effects', async () => {
  const s = setup();
  try {
    assert.equal(s.e.get(g), null);
    await s.configure();
    assert.equal(new EventMode(s.db).get(g).status, 'inactive');
    assert.equal(s.e.get('other'), null);
    assert.equal(s.calls.length, 0);
    s.i.guild.memberCount = 99;
    await assert.rejects(() => s.configure(), /eventModeInput/);
    s.i.guild.memberCount = 100;
    s.i.user.id = 'other';
    await assert.rejects(() => s.configure(), /ownerOnly/);
  } finally {
    s.db.close();
  }
});
test('eventmode enable changesselectedviewbits exactrestoresoriginalabsent/presenteveryone untouchedotherbits', async () => {
  const s = setup();
  try {
    await s.configure();
    const before = new Map([...s.channels].map(([id, ch]) => [id, eventSnapshot(ch)]));
    await changeEventMode(s.i, s.c, { enable: true, confirm: true });
    assert.equal(s.e.get(g).status, 'active');
    assert(s.channels.get(ch).permissionOverwrites.cache.get(g).deny.has(P.ViewChannel));
    assert(s.channels.get(cat).permissionOverwrites.cache.get(g).allow.has(P.SendMessages));
    await changeEventMode(s.i, s.c, { enable: false, confirm: true });
    assert.equal(s.e.get(g).status, 'inactive');
    for (const [id, ch] of s.channels) assert.equal(eventSnapshot(ch), before.get(id));
    s.e.reset(g);
    assert.equal(s.e.get(g), null);
  } finally {
    s.db.close();
  }
});
test('eventmode explicitbotmemberaccess/type/foreign/parent/category/selfselection guards noeffects', async () => {
  for (const change of [
    (s) => s.channels.get(ch).permissionOverwrites.cache.delete(b),
    (s) => (s.channels.get(ch).type = ChannelType.GuildAnnouncement),
    (s) => (s.channels.get(ch).guildId = 'other'),
    (s) => (s.channels.get(ch).parentId = cat),
    (s) => (s.bot.permissions.has = () => false),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => s.configure());
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    await assert.rejects(
      () => configureEventMode(s.i, s.c, { categoryId: cat, channels: [ch, ch], confirm: true }),
      /eventModeInput/,
    );
    await assert.rejects(
      () => configureEventMode(s.i, s.c, { categoryId: cat, channels: [ch], confirm: false }),
      /eventModeConfirm/,
    );
  } finally {
    s.db.close();
  }
});
test('eventmode thirdpartyedit afterenable refusesrestore never clobbers originalotherbits', async () => {
  const s = setup();
  try {
    await s.configure();
    await changeEventMode(s.i, s.c, { enable: true, confirm: true });
    const n = s.calls.length;
    s.channels
      .get(ch)
      .permissionOverwrites.cache.set('foreign', overwrite('foreign', P.SendMessages));
    await assert.rejects(
      () => changeEventMode(s.i, s.c, { enable: false, confirm: true }),
      /eventModeBlocked/,
    );
    assert.equal(s.calls.length, n); // Outside channel drift blocked before any restore.
    assert(s.channels.get(ch).permissionOverwrites.cache.has('foreign'));
    assert.equal(s.e.get(g).status, 'uncertain');
    await assert.rejects(
      () => changeEventMode(s.i, s.c, { enable: false, confirm: true }),
      /eventModeBlocked/,
    );
  } finally {
    s.db.close();
  }
});
test('eventmode ambiguoussubmittededit persistentuncertain no enable/disable/resetretry restartfrozen', async () => {
  const s = setup();
  try {
    await s.configure();
    s.channels.get(ch).permissionOverwrites.edit = async () => {
      s.calls.push(['attempt']);
      throw Error('network');
    };
    await assert.rejects(
      () => changeEventMode(s.i, s.c, { enable: true, confirm: true }),
      /eventModeBlocked/,
    );
    await assert.rejects(
      () => changeEventMode(s.i, s.c, { enable: true, confirm: true }),
      /eventModeBlocked/,
    );
    await assert.rejects(
      () => changeEventMode(s.i, s.c, { enable: false, confirm: true }),
      /eventModeBlocked/,
    );
    assert.equal(s.calls.length, 1);
    assert.throws(() => s.e.reset(g), /eventModeBlocked/);
    s.e.recover();
    assert(s.e.records(g).every((r) => r.status === 'uncertain'));
  } finally {
    s.db.close();
  }
});
test('eventmode fivepaths private3locale ownerconfirm/nativepolicy config no contentstorage', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        ...s.i,
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => ({ id: cat }),
          getString: () => JSON.stringify([ch]),
          getBoolean: () => true,
        },
        reply: async (p) => (reply = p),
      };
      for (const sub of ['setup', 'config', 'enable', 'disable', 'reset']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.e.get(g), null);
    } finally {
      s.db.close();
    }
  }
});
