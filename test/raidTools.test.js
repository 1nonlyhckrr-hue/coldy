import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import {
  setJoinGate,
  setRaidMode,
  createRaidHandlers,
  heldList,
  altSignals,
  InviteTracker,
} from '../src/services/raidTools.js';
import { scoreServer, dangerousOf } from '../src/services/auditTools.js';
const G = '111111111111111111';
const DAY = 86400000;
function env() {
  const db = openDatabase(':memory:'),
    alerts = [];
  const c = { features: new FeatureStore(db), logger: { warn: () => {} } };
  c.logHub = { channelId: () => null, send: async () => false };
  return { db, c, alerts };
}
const member = (age, over = {}) => {
  const calls = [];
  return {
    calls,
    id: '2' + String(Math.floor(Math.random() * 1e16)).padStart(16, '0'),
    user: { bot: false, createdTimestamp: Date.now() - age * DAY },
    guild: { id: G, channels: { cache: new Map() }, ownerId: '9', systemChannel: null },
    kick: async () => calls.push('kick'),
    timeout: async (ms) => calls.push(['timeout', ms]),
    ...over,
  };
};
test('join gate is off by default, kicks young accounts when on', async () => {
  const { db, c } = env();
  const h = createRaidHandlers(c);
  const a = member(1);
  await h.join(a);
  assert.deepEqual(a.calls, []);
  setJoinGate(c, G, true, 7);
  const b = member(1),
    old = member(100);
  await h.join(b);
  await h.join(old);
  assert.deepEqual(b.calls, ['kick']);
  assert.deepEqual(old.calls, []);
  db.close();
});
test('raid mode timeout holds and remembers members', async () => {
  const { db, c } = env();
  const h = createRaidHandlers(c);
  setRaidMode(c, G, true, 'timeout');
  const m = member(500);
  await h.join(m);
  assert.equal(m.calls[0][0], 'timeout');
  assert.deepEqual(heldList(c, G), [m.id]);
  setRaidMode(c, G, true, 'kick');
  const k = member(500);
  await h.join(k);
  assert.deepEqual(k.calls, ['kick']);
  db.close();
});
test('alt signals score young default-avatar accounts higher', () => {
  const m = (age) => ({
    id: '1',
    joinedTimestamp: Date.now(),
    roles: { cache: { size: 1 } },
    user: {
      username: 'abc123',
      createdTimestamp: Date.now() - age * DAY,
      avatar: null,
      banner: null,
      globalName: null,
    },
  });
  assert.ok(altSignals(m(1)).score > altSignals(m(900)).score);
});
test('invite stats flag suspicious inviters', () => {
  const { db, c } = env();
  const t = new InviteTracker(c);
  for (let i = 0; i < 6; i++)
    c.features.set(G, 'invites', 'joined:' + i, { inviter: 'A', code: 'x', at: 1, young: true });
  assert.equal(t.stats(G, 'A').suspect, true);
  assert.equal(t.stats(G, 'B').total, 0);
  db.close();
});
test('dangerousOf lists risky permissions', () => {
  const p = { has: (f) => f === 8n };
  assert.deepEqual(dangerousOf(p), ['Administrator']);
});
test('securityscore sums weights of passing checks', () => {
  const { db, c } = env();
  const guild = {
    id: G,
    verificationLevel: 0,
    explicitContentFilter: 0,
    mfaLevel: 0,
    roles: { cache: new Map(), everyone: { permissions: { has: () => false } } },
  };
  c.antinuke = { get: () => ({ enabled: true }) };
  c.automod = { get: () => ({ enabled: false }) };
  c.joinRaid = { get: () => ({ enabled: false }) };
  const r = scoreServer(guild, c);
  assert.equal(r.score, 15 + 10 + 10 + 10);
  db.close();
});
