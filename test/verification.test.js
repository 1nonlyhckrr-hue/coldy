import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import {
  Verification,
  createVerificationHandler,
  createVerificationJoinHandler,
} from '../src/services/verification.js';
const G = '111111111111111111',
  U = '222222222222222222',
  R = '333333333333333333',
  UN = '444444444444444444';
test('off by default and settings round-trip', () => {
  const db = openDatabase(':memory:'),
    v = new Verification(db);
  try {
    assert.equal(v.get(G).enabled, false);
    assert.equal(v.get(G).mode, 'challenge');
    v.patch(G, { enabled: true, maxAttempts: 2 });
    assert.equal(v.get(G).maxAttempts, 2);
    assert.throws(() => v.patch(G, { maxAttempts: 99 }));
  } finally {
    db.close();
  }
});
test('challenge: right answer passes, wrong answers lock, expiry is enforced', () => {
  const db = openDatabase(':memory:');
  let now = 1000;
  const v = new Verification(db, () => now);
  try {
    v.challenge(G, U);
    const ans = v.pending.get(`${G}:${U}`).answer;
    assert.equal(v.answer(G, U, ans, 3), 'pass');
    assert.equal(v.answer(G, U, ans, 3), 'expired');
    v.challenge(G, U);
    const a2 = v.pending.get(`${G}:${U}`).answer,
      bad = (a2 + 1) % 4;
    assert.equal(v.answer(G, U, bad, 2), 'wrong');
    assert.equal(v.answer(G, U, bad, 2), 'locked');
    v.challenge(G, U);
    now += 6 * 60000;
    assert.equal(v.answer(G, U, 0, 3), 'expired');
  } finally {
    db.close();
  }
});
function fixture(cfg, over = {}) {
  const db = openDatabase(':memory:'),
    v = new Verification(db);
  v.patch(G, cfg);
  const calls = { add: [], remove: [], kick: 0, replies: [], updates: [] };
  const role = {
    id: R,
    guild: { id: G },
    managed: false,
    position: 1,
    permissions: { has: () => false },
  };
  const member = {
    user: { bot: false },
    kickable: true,
    roles: {
      cache: new Map([[UN, {}]]),
      add: async (r) => calls.add.push(r.id ?? r),
      remove: async (r) => calls.remove.push(r),
    },
    kick: async () => calls.kick++,
  };
  const i = {
    guildId: G,
    customId: 'emika:verify:start',
    user: { id: U },
    client: { user: { id: 'bot' } },
    isButton: () => true,
    inGuild: () => true,
    reply: async (p) => calls.replies.push(p),
    update: async (p) => calls.updates.push(p),
    guild: {
      id: G,
      members: {
        fetch: async () => member,
        fetchMe: async () => ({
          id: 'bot',
          permissions: { has: () => true },
          roles: { highest: { position: 10 } },
        }),
      },
      roles: { fetch: async () => role },
    },
    ...over,
  };
  const c = {
    verification: v,
    localization: { locale: () => 'en', t: (g, k, p) => k + (p?.item ? ':' + p.item : '') },
  };
  return { db, c, i, calls, v };
}
test('button mode: one click swaps Unverified for the verified role', async () => {
  const f = fixture({ enabled: true, mode: 'button', roleId: R, unverifiedRoleId: UN });
  try {
    await createVerificationHandler(f.c)(f.i);
    assert.deepEqual(f.calls.add, [R]);
    assert.deepEqual(f.calls.remove, [UN]);
  } finally {
    f.db.close();
  }
});
test('disabled config and foreign buttons are ignored or refused', async () => {
  const f = fixture({ enabled: false });
  try {
    await createVerificationHandler(f.c)(f.i);
    assert.equal(f.calls.add.length, 0);
    assert.equal(f.calls.replies.length, 1);
    assert.equal(await createVerificationHandler(f.c)({ ...f.i, customId: 'other:x' }), false);
  } finally {
    f.db.close();
  }
});
test('challenge mode: start shows 4 buttons, wrong answers kick when enabled', async () => {
  const f = fixture({ enabled: true, kickOnFail: true, maxAttempts: 1, unverifiedRoleId: UN });
  try {
    const h = createVerificationHandler(f.c);
    await h(f.i);
    assert.equal(f.calls.replies[0].components[0].components.length, 4);
    const ans = f.v.pending.get(`${G}:${U}`).answer;
    await h({ ...f.i, customId: `emika:verify:ans:${(ans + 1) % 4}` });
    assert.equal(f.calls.kick, 1);
  } finally {
    f.db.close();
  }
});
test('join handler adds Unverified only when enabled and for non-bots', async () => {
  const f = fixture({ enabled: true, unverifiedRoleId: UN });
  try {
    const added = [];
    const mk = (bot) => ({
      user: { bot },
      guild: { id: G, members: { me: { permissions: { has: () => true } } } },
      roles: { add: async (r) => added.push(r) },
    });
    const h = createVerificationJoinHandler(f.c);
    await h(mk(false));
    await h(mk(true));
    assert.deepEqual(added, [UN]);
    f.v.patch(G, { enabled: false });
    await h(mk(false));
    assert.equal(added.length, 1);
  } finally {
    f.db.close();
  }
});
