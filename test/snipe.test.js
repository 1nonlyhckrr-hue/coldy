import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { SnipeCache, createSnipeHandlers, SNIPE } from '../src/services/snipe.js';
const G = '111111111111111111';
function env() {
  const db = openDatabase(':memory:');
  const c = {
    features: new FeatureStore(db),
    logger: { warn: () => {} },
    snipe: new SnipeCache(),
    localization: { t: (g, k, p) => k + JSON.stringify(p), locale: () => 'en' },
  };
  return { db, c };
}
const msg = (over = {}) => ({
  guild: { id: G },
  channelId: '5',
  author: { id: '7', bot: false },
  content: 'hello @everyone',
  createdTimestamp: Date.now(),
  attachments: { size: 0 },
  mentions: { users: new Map([['8', {}]]), roles: new Map(), everyone: false },
  sent: [],
  channel: {
    send: async function (p) {
      msg.sent.push(p);
    },
  },
  ...over,
});
test('nothing is cached while snipe is off', async () => {
  const { db, c } = env();
  await createSnipeHandlers(c).delete(msg());
  assert.equal(c.snipe.lastDeleted('5'), null);
  db.close();
});
test('caches deleted and edited, expires after an hour', async () => {
  const { db, c } = env();
  c.features.setConfig(G, 'snipe', SNIPE, { enabled: true });
  const h = createSnipeHandlers(c);
  await h.delete(msg());
  assert.equal(c.snipe.lastDeleted('5').content, 'hello @\u200beveryone');
  await h.update(msg({ content: 'a' }), msg({ content: 'b' }));
  assert.equal(c.snipe.lastEdited('5').now, 'b');
  c.snipe.now = () => Date.now() + 3700000;
  assert.equal(c.snipe.lastDeleted('5'), null);
  db.close();
});
test('ghost ping alert names who was pinged without pinging', async () => {
  const { db, c } = env();
  c.features.setConfig(G, 'snipe', SNIPE, { ghostping: true });
  const sent = [];
  await createSnipeHandlers(c).delete(msg({ channel: { send: async (p) => sent.push(p) } }));
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0]), /<@8>/);
  assert.equal(c.snipe.lastDeleted('5'), null);
  db.close();
});
