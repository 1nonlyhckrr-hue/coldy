import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ServerBackups, snapshotGuild, restoreGuild } from '../src/services/serverBackup.js';
const role = (id, name, extra = {}) => ({
  id,
  name,
  color: 5,
  hoist: false,
  mentionable: false,
  managed: false,
  position: 1,
  permissions: { bitfield: 8n },
  ...extra,
});
const chan = (id, name, type, extra = {}) => ({
  id,
  name,
  type,
  parentId: null,
  rawPosition: 0,
  nsfw: false,
  isThread: () => false,
  permissionOverwrites: { cache: new Map() },
  ...extra,
});
function guild(roles, channels) {
  const rc = new Map(roles.map((r) => [r.id, r])),
    cc = new Map(channels.map((c) => [c.id, c]));
  const created = { roles: [], channels: [] };
  return {
    id: 'g',
    name: 'Test',
    created,
    roles: {
      cache: rc,
      fetch: async () => {},
      create: async (o) => {
        const r = role('r' + (created.roles.length + 100), o.name);
        created.roles.push(o);
        rc.set(r.id, r);
        return r;
      },
    },
    channels: {
      cache: cc,
      fetch: async () => {},
      create: async (o) => {
        const c = chan('c' + (created.channels.length + 100), o.name, o.type, {
          parentId: o.parent ?? null,
        });
        created.channels.push(o);
        cc.set(c.id, c);
        return c;
      },
    },
  };
}
const ow = (id, type, allow, deny) => ({
  id,
  type,
  allow: { bitfield: allow },
  deny: { bitfield: deny },
});
test('snapshot keeps roles (not managed), channels, parents and overwrites as plain JSON', () => {
  const g = guild(
    [role('g', '@everyone'), role('r1', 'Mod'), role('r2', 'Bot', { managed: true })],
    [
      chan('cat', 'Info', ChannelType.GuildCategory),
      chan('t1', 'rules', ChannelType.GuildText, {
        parentId: 'cat',
        topic: 'Read',
        permissionOverwrites: { cache: new Map([['r1', ow('r1', 0, 1024n, 2048n)]]) },
      }),
    ],
  );
  const snap = snapshotGuild(g);
  assert.deepEqual(
    snap.roles.map((r) => r.name),
    ['@everyone', 'Mod'],
  );
  assert.equal(snap.channels[1].parentId, 'cat');
  assert.deepEqual(snap.channels[1].overwrites, [
    { id: 'r1', type: 0, allow: '1024', deny: '2048' },
  ]);
  assert.doesNotThrow(() => JSON.stringify(snap));
});
test('backups keep only the latest 5 per server and are scoped per guild', () => {
  const db = openDatabase(':memory:'),
    b = new ServerBackups(db);
  try {
    const snap = { version: 1, guildId: 'g', roles: [], channels: [] };
    for (let n = 0; n < 7; n++) b.save('g', 'u', snap);
    b.save('other', 'u', snap);
    assert.equal(b.list('g').length, 5);
    assert.equal(b.list('other').length, 1);
    assert.throws(() => b.get('other', b.list('g')[0].id), { message: 'backupNotFound' });
    assert.equal(b.remove('g', b.list('g')[0].id), 1);
  } finally {
    db.close();
  }
});
test('restore recreates only missing roles and channels, maps overwrites, deletes nothing', async () => {
  const full = guild(
    [role('g', '@everyone'), role('r1', 'Mod')],
    [
      chan('cat', 'Info', ChannelType.GuildCategory),
      chan('t1', 'rules', ChannelType.GuildText, {
        parentId: 'cat',
        permissionOverwrites: { cache: new Map([['r1', ow('r1', 0, 1024n, 0n)]]) },
      }),
      chan('v1', 'Talk', ChannelType.GuildVoice),
    ],
  );
  const snap = snapshotGuild(full);
  // The server lost the Mod role, the rules channel and the category, but Talk still exists.
  const now = guild([role('g', '@everyone')], [chan('v9', 'Talk', ChannelType.GuildVoice)]);
  const out = await restoreGuild(now, snap);
  assert.deepEqual(out, { rolesCreated: 1, channelsCreated: 2, skipped: 1, failed: 0 });
  assert.equal(now.created.channels[0].type, ChannelType.GuildCategory);
  const rules = now.created.channels[1];
  assert.equal(rules.name, 'rules');
  assert.ok(rules.parent?.startsWith('c'));
  assert.equal(rules.permissionOverwrites[0].id, 'r100');
  assert.equal(rules.permissionOverwrites[0].allow, 1024n);
  // Running it again creates nothing.
  assert.deepEqual(await restoreGuild(now, snap), {
    rolesCreated: 0,
    channelsCreated: 0,
    skipped: 4,
    failed: 0,
  });
  await assert.rejects(() => restoreGuild(now, { version: 9 }), { message: 'backupNotFound' });
});
