import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { Templates, templateOf, startApply } from '../src/services/templates.js';
import { ChannelType } from 'discord.js';
function env() {
  const db = openDatabase(':memory:');
  const c = { features: new FeatureStore(db) };
  c.templates = new Templates(c);
  return { db, c };
}
const src = () => ({
  id: 'A',
  name: 'Source',
  roles: {
    cache: new Map([
      ['R1', { id: 'R1', name: 'Mod', permissions: { bitfield: 8n }, position: 2 }],
      ['A', { id: 'A', name: '@everyone', permissions: { bitfield: 0n }, position: 0 }],
    ]),
  },
  channels: {
    cache: new Map([
      [
        'C',
        {
          id: 'C',
          name: 'Cat',
          type: ChannelType.GuildCategory,
          position: 0,
          permissionOverwrites: { cache: new Map() },
        },
      ],
      [
        'T',
        {
          id: 'T',
          name: 'chat',
          type: ChannelType.GuildText,
          parentId: 'C',
          position: 1,
          permissionOverwrites: {
            cache: new Map([
              ['R1', { id: 'R1', type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } }],
              ['U9', { id: 'U9', type: 1, allow: { bitfield: 1n }, deny: { bitfield: 0n } }],
            ]),
          },
        },
      ],
    ]),
  },
});
test('template drops member overwrites and keeps role ones', () => {
  const t = templateOf(src());
  assert.deepEqual(
    t.channels.find((x) => x.id === 'T').overwrites.map((o) => o.id),
    ['R1'],
  );
});
test('templates are private to their saver, bot owner sees all', () => {
  const { db, c } = env();
  c.templates.save('1', templateOf(src()), 'u1', 'Source');
  assert.equal(c.templates.list('u1', false).length, 2);
  assert.equal(c.templates.list('u2', false).length, 1);
  assert.equal(c.templates.list('u2', true).length, 2);
  assert.throws(() => c.templates.use('1', 'u2', false), { key: 'tpNotFound' });
  assert.throws(() => c.templates.save('1', templateOf(src()), 'u2', 'x'), { key: 'tpNotYours' });
  assert.throws(() => c.templates.save('Bad Name', {}, 'u1', 'x'), { key: 'tpBadName' });
  assert.equal(c.templates.remove('1', 'u1', false), true);
  db.close();
});
test('apply creates roles highest first, then categories before channels, never deletes', async () => {
  const log = [];
  const target = {
    id: 'B',
    roles: {
      fetch: async () => {},
      cache: new Map(),
      create: async (o) => (log.push('role:' + o.name), { id: 'N' + o.name }),
    },
    channels: {
      fetch: async () => {},
      cache: new Map(),
      create: async (o) => (
        log.push('ch:' + o.name + ':' + (o.permissionOverwrites?.length ?? 0)),
        { id: 'N' + o.name }
      ),
    },
  };
  const data = templateOf(src());
  const done = new Promise((r) =>
    startApply(target, data, { sleep: async () => {}, pace: 1, finish: async (o) => r(o) }),
  );
  const out = await done;
  assert.deepEqual(log, ['role:Mod', 'ch:Cat:0', 'ch:chat:1']);
  assert.equal(out.rolesCreated, 1);
  assert.equal(out.channelsCreated, 2);
});
test('a large server template is compressed and chunked, round-trips, and cleans up', () => {
  const { db, c } = env();
  const rnd = (n) => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('');
  const data = {
    version: 1,
    guildId: 'A',
    guildName: 'Big',
    roles: Array.from({ length: 200 }, (_, n) => ({
      id: 'r' + n,
      name: 'role ' + rnd(2),
      color: n,
      hoist: false,
      mentionable: false,
      permissions: '1071698660929',
      position: n,
      everyone: false,
    })),
    channels: Array.from({ length: 500 }, (_, n) => ({
      id: 'c' + n,
      name: 'chan-' + rnd(1),
      type: 0,
      parentId: null,
      position: n,
      topic: rnd(4),
      overwrites: Array.from({ length: 3 }, (_, k) => ({
        id: 'r' + k,
        type: 0,
        allow: '1024',
        deny: '2048',
      })),
    })),
  };
  assert.ok(JSON.stringify(data).length > 100000);
  c.templates.save('big', data, 'u1', 'Big');
  assert.deepEqual(c.templates.get('big').data, data);
  assert.equal(c.templates.list('u1', false)[0].channels, 500);
  const rows = () => c.features.list('0', 'template', '', 1000).length;
  const before = rows();
  assert.ok(before >= 2);
  c.templates.save('big', templateOf(src()), 'u1', 'Big');
  assert.ok(rows() < before);
  assert.equal(c.templates.remove('big', 'u1', false), true);
  assert.equal(rows(), 0);
  db.close();
});
