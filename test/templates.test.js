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
  assert.equal(c.templates.list('u1', false).length, 1);
  assert.equal(c.templates.list('u2', false).length, 0);
  assert.equal(c.templates.list('u2', true).length, 1);
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
