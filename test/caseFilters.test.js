import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/logging/casehistory.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  other = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new ModerationCases(db);
  for (let n = 0; n < 12; n++) {
    const k = r.begin({
      guildId: 'g',
      actorId: id,
      targetId: other,
      action: 'warn',
      reason: 'Private reason',
      interactionId: 'source' + n,
    });
    if (n < 3) r.finish(k, ['completed', 'failed', 'uncertain'][n]);
  }
  r.begin({
    guildId: 'other',
    actorId: id,
    targetId: other,
    action: 'warn',
    reason: 'foreign',
    interactionId: 'foreign',
  });
  return { db, r };
}
test('case summary exact allstatuscounts guildisolation no native outcome inference', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.caseSummary('g'), [
      { status: 'completed', count: 1 },
      { status: 'failed', count: 1 },
      { status: 'pending', count: 9 },
      { status: 'uncertain', count: 1 },
    ]);
    assert.deepEqual(s.r.caseSummary('empty'), []);
    assert.equal(s.r.caseSummary('other')[0].count, 1);
  } finally {
    s.db.close();
  }
});
test('case actor target exactbound IDs metadata pagination no reasons/source/isolation no mutations', () => {
  const s = setup();
  try {
    const a = s.r.caseSubject('g', 'actor', id);
    assert.equal(a.total, 12);
    assert.equal(a.rows.length, 10);
    assert.equal(a.rows[0].id, 12);
    assert.equal(s.r.caseSubject('g', 'target', other, 2).rows.length, 2);
    assert.equal(s.r.caseSubject('g', 'target', id).total, 0);
    for (const [kind, v, page] of [
      ['bad', id, 1],
      ['actor', 'bad', 1],
      ['actor', id, 0],
      ['actor', id, 3],
      ['target', other, 1.5],
    ])
      assert.throws(() => s.r.caseSubject('g', kind, v, page));
    assert(!JSON.stringify(a).includes('Private reason'));
    assert(!JSON.stringify(a).includes('source'));
    assert.equal(s.r.caseSubject('other', 'actor', id).total, 1);
    assert.equal(s.db.prepare('SELECT count(*)n FROM moderation_cases').get().n, 13);
  } finally {
    s.db.close();
  }
});
test('case3filterpaths currentmanager beforedataread private3locale no effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'actor', 'target']) {
      const s = setup();
      try {
        let reply,
          allowed = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: id, force: true });
                return { id, guild: { id: 'g' }, permissions: { has: () => allowed } };
              },
            },
          },
          options: {
            getSubcommand: () => sub,
            getString: () => (sub === 'actor' ? id : other),
            getInteger: () => 1,
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          cases: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        assert(!reply.embeds[0].data.description.includes('Private reason'));
        allowed = false;
        c.cases = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
