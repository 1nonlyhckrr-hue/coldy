import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/logging/casehistory.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    cases = new ModerationCases(db);
  for (let n = 1; n <= 103; n++) {
    const id = cases.begin({
      guildId: 'g',
      targetId: 't',
      actorId: 'a',
      action: 'warn',
      reason: 'Reason ' + n,
      interactionId: 'i' + n,
    });
    if (n % 2) cases.finish(id, 'completed');
  }
  cases.begin({
    guildId: 'other',
    targetId: 'private-target',
    actorId: 'private-actor',
    action: 'warn',
    reason: 'private-reason',
    interactionId: 'other-source',
  });
  return { db, cases };
}
test('case history exact guild inspect/status pagination boundaries no mutation', () => {
  const s = setup();
  try {
    const before = s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n;
    assert.equal(s.cases.inspectCase('g', 1).reason, 'Reason 1');
    for (const id of [0, 1.5, NaN, '1', 104]) assert.throws(() => s.cases.inspectCase('g', id));
    assert.throws(() => s.cases.inspectCase('other', 1));
    const page = s.cases.casePage('g', 1, 'pending');
    assert.equal(page.total, 51);
    assert.equal(page.rows.length, 10);
    assert(page.rows.every((r) => r.status === 'pending'));
    assert.equal(s.cases.casePage('g', 11).rows.length, 3);
    assert.throws(() => s.cases.casePage('g', 12));
    assert.throws(() => s.cases.casePage('g', 1, 'bad'));
    assert.deepEqual(s.cases.casePage('empty').rows, []);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, before);
  } finally {
    s.db.close();
  }
});
test('case export bounded latest100 whole metadata/reasons explicit truncation no source/foreigncase', () => {
  const s = setup();
  try {
    const r = s.cases.exportCases('g');
    assert.equal(r.total, 103);
    assert.equal(r.truncated, true);
    assert.equal(r.cases.length, 100);
    assert.equal(r.cases[0].id, 103);
    assert.equal(r.cases.at(-1).id, 4);
    assert.equal(r.cases[0].actor_id, 'a');
    assert.equal(r.cases[0].reason, 'Reason 103');
    for (const v of ['interaction_id', 'private-target', 'private-reason', 'other-source'])
      assert(!JSON.stringify(r).includes(v));
  } finally {
    s.db.close();
  }
});
test('casehistory current manager private3locale exact attachment payload/read only no native effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let sub = 'inspect',
        reply;
      const actor = { id: 'u', guild: { id: 'g' }, permissions: { has: () => true } },
        i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: { id: 'g', members: { fetch: async () => actor } },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => {
            reply = p;
          },
          options: {
            getSubcommand: () => sub,
            getInteger: (k) => (k === 'id' ? 1 : null),
            getString: () => null,
          },
        },
        c = {
          cases: s.cases,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      for (const v of ['inspect', 'list', 'export']) {
        sub = v;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(JSON.parse(reply.files[0].attachment.toString()).cases.length, 100);
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
