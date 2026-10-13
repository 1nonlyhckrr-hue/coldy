import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { Sticky, createStickyHandler, dmWarn, setupMuteRole } from '../src/services/stickyTools.js';
import { runAutoBackups, AUTOBACKUP } from '../src/services/autoBackup.js';
const G = '111111111111111111';
function env() {
  const db = openDatabase(':memory:');
  const c = {
    features: new FeatureStore(db),
    logger: { warn: () => {} },
    localization: { t: (g, k) => k, locale: () => 'en' },
  };
  c.sticky = new Sticky(c);
  return { db, c };
}
test('sticky re-posts after N messages and deletes the old one', async () => {
  const { db, c } = env();
  c.sticky.set(G, '5', 'rules', 3);
  const sent = [],
    deleted = [];
  const msg = () => ({
    guild: { id: G },
    channelId: '5',
    author: { bot: false },
    channel: {
      send: async (p) => (sent.push(p), { id: 'm' + sent.length }),
      messages: { delete: async (id) => deleted.push(id) },
    },
  });
  const h = createStickyHandler(c);
  for (let i = 0; i < 6; i++) await h(msg());
  assert.equal(sent.length, 2);
  assert.deepEqual(deleted, ['m1']);
  db.close();
});
test('dmwarn is off by default and DMs when on', async () => {
  const { db, c } = env();
  const dms = [];
  const guild = {
    id: G,
    name: 'S',
    client: { users: { fetch: async () => ({ send: async (p) => dms.push(p) }) } },
  };
  assert.equal(await dmWarn(c, guild, '2', 'r', '3'), false);
  c.features.setConfig(G, 'dmwarn', { enabled: false }, { enabled: true });
  assert.equal(await dmWarn(c, guild, '2', 'r', '3'), true);
  assert.equal(dms.length, 1);
  db.close();
});
test('muterole setup creates the role and denies it in channels', async () => {
  const { db, c } = env();
  const edits = [];
  const guild = {
    id: G,
    roles: { cache: { find: () => undefined }, create: async () => ({ id: '77' }) },
    channels: {
      cache: new Map([
        ['1', { permissionOverwrites: { edit: async (r, p) => edits.push(p) } }],
        [
          '2',
          {
            permissionOverwrites: {
              edit: async () => {
                throw new Error('x');
              },
            },
          },
        ],
      ]),
    },
  };
  const r = await setupMuteRole(c, guild, { pace: 0, sleep: async () => {} });
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
  assert.equal(edits[0].SendMessages, false);
  db.close();
});
test('auto backup runs once per day after the set time, never when off', async () => {
  const { db, c } = env();
  const saved = [];
  c.serverBackups = { save: (g, u) => saved.push([g, u]) };
  const guild = { id: G, name: 'S', roles: { cache: new Map() }, channels: { cache: new Map() } };
  const client = { guilds: { cache: new Map([[G, guild]]) } };
  const at = (t) => new Date(`2026-10-13T${t}:00Z`);
  assert.equal(await runAutoBackups(c, client, at('03:30')), 0);
  c.features.setConfig(G, 'autobackup', AUTOBACKUP, { enabled: true, time: '03:00' });
  assert.equal(await runAutoBackups(c, client, at('02:59')), 0);
  assert.equal(await runAutoBackups(c, client, at('03:01')), 1);
  assert.equal(await runAutoBackups(c, client, at('04:00')), 0);
  db.close();
});
