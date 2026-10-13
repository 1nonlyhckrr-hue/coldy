import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { ModerationCases } from '../src/services/moderation.js';
import { ModCase, createAppealDmHandler } from '../src/services/modCase.js';
const G = '111111111111111111',
  U = '222222222222222222',
  A = '333333333333333333';
function env() {
  const db = openDatabase(':memory:');
  const c = { features: new FeatureStore(db), cases: new ModerationCases(db) };
  c.modCase = new ModCase(c);
  return { db, c };
}
test('notes are stored per member and capped', () => {
  const { db, c } = env();
  c.modCase.addNote(G, U, A, 'rude in vc @everyone');
  assert.equal(c.modCase.notes(G, U).length, 1);
  assert.match(c.modCase.notes(G, U)[0].text, /@\u200beveryone/);
  assert.equal(c.modCase.notes(G, A).length, 0);
  for (let i = 0; i < 39; i++) c.modCase.addNote(G, U, A, 'n' + i);
  assert.throws(() => c.modCase.addNote(G, U, A, 'x'), { key: 'mcNoteLimit' });
  db.close();
});
test('appeal flow: one open at a time, decide once', () => {
  const { db, c } = env();
  c.modCase.logAppeal(G, U, A, 'sorry');
  assert.throws(() => c.modCase.logAppeal(G, U, A, 'again'), { key: 'mcAppealOpen' });
  assert.equal(c.modCase.openAppeals(G).length, 1);
  c.modCase.decide(G, U, 'denied', A);
  assert.equal(c.modCase.openAppeals(G).length, 0);
  assert.throws(() => c.modCase.decide(G, U, 'accepted', A), { key: 'mcNoAppeal' });
  db.close();
});
test('history combines cases, warnings, notes and appeal', () => {
  const { db, c } = env();
  c.modCase.addNote(G, U, A, 'x');
  c.modCase.logAppeal(G, U, A, 'y');
  const h = c.modCase.history(G, U);
  assert.equal(h.notes, 1);
  assert.equal(h.appeal.status, 'open');
  assert.equal(h.caseTotal, 0);
  db.close();
});

test('DM appeal lands in the modlog for a banned user only', async () => {
  const { db, c } = env();
  const sent = [],
    replies = [];
  c.logHub = { channelId: () => '9', send: async (g, k, key, p) => sent.push([key, p]) };
  c.localization = { t: (g, k) => k };
  const banned = {
    id: G,
    name: 'S',
    bans: { fetch: async ({ user }) => (user === U ? {} : null) },
  };
  const client = { guilds: { cache: new Map([[G, banned]]) } };
  const h = createAppealDmHandler(c);
  const dm = (id, content) => ({
    client,
    author: { id, bot: false },
    content,
    reply: async (p) => replies.push(p.content),
  });
  await h(dm(A, 'let me back please'));
  assert.equal(sent.length, 0);
  await h(dm(U, 'short'));
  assert.deepEqual(replies, ['mcDmShort']);
  const h2 = createAppealDmHandler(c);
  await h2(dm(U, 'please unban me, I learned'));
  assert.equal(sent[0][0], 'mcAppealIn');
  assert.equal(replies.at(-1), 'mcDmReceived');
  assert.equal(c.modCase.appeal(G, U).status, 'open');
  await createAppealDmHandler(c)(dm(U, 'please unban me again'));
  assert.equal(replies.at(-1), 'mcDmOpen');
  db.close();
});
