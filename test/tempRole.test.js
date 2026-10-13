import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { TempRoles } from '../src/services/tempRole.js';
const G = '111111111111111111',
  U = '222222222222222222',
  R = '333333333333333333';
function env() {
  const db = openDatabase(':memory:');
  const c = { features: new FeatureStore(db) };
  c.tempRoles = new TempRoles(c);
  return { db, c };
}
const guild = (removed, has = true) => ({
  id: G,
  members: {
    fetch: async () => ({
      roles: { cache: { has: () => has }, remove: async (r) => removed.push(r) },
    }),
  },
});
test('sweep removes only expired roles and forgets them', async () => {
  const { db, c } = env();
  c.tempRoles.add(G, U, R, Date.now() - 1000, 'x');
  c.tempRoles.add(G, '444444444444444444', R, Date.now() + 99999, 'x');
  const removed = [];
  assert.equal(await c.tempRoles.sweep(guild(removed)), 1);
  assert.deepEqual(removed, [R]);
  assert.equal(c.tempRoles.list(G).length, 1);
  db.close();
});
test('unknown member is forgotten, other errors are retried', async () => {
  const { db, c } = env();
  c.tempRoles.add(G, U, R, Date.now() - 1, 'x');
  const g = {
    id: G,
    members: {
      fetch: async () => {
        throw Object.assign(new Error('x'), { code: 10007 });
      },
    },
  };
  await c.tempRoles.sweep(g);
  assert.equal(c.tempRoles.list(G).length, 0);
  c.tempRoles.add(G, U, R, Date.now() - 1, 'x');
  const g2 = {
    id: G,
    members: {
      fetch: async () => {
        throw Object.assign(new Error('x'), { code: 50013 });
      },
    },
  };
  await c.tempRoles.sweep(g2);
  assert.equal(c.tempRoles.list(G).length, 1);
  db.close();
});
