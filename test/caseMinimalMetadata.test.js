import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/logging/casehistory.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new ModerationCases(db);
  for (let n = 1; n <= 104; n++)
    db.prepare(
      'INSERT INTO moderation_cases(guild_id,target_id,actor_id,action,reason,created_at,status,interaction_id)VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'g',
      'private-target',
      'private-actor',
      n % 2 ? 'warn' : 'nickname',
      'private-reason',
      n,
      ['pending', 'completed', 'failed', 'uncertain'][n % 4],
      'private-source-' + n,
    );
  r.begin({
    guildId: 'other',
    targetId: 'private',
    actorId: 'private',
    action: 'warn',
    reason: 'private',
    interactionId: 'other-source',
  });
  return { db, r };
}
test('minimal case export latest100ID actionstate time total truncation no reason/source/actor/target nonmutation', () => {
  const s = setup();
  try {
    const r = s.r.exportCaseMetadata('g');
    assert.equal(r.total, 104);
    assert.equal(r.truncated, true);
    assert.equal(r.records.length, 100);
    assert.deepEqual(r.records[0], {
      id: 104,
      action: 'nickname',
      status: 'pending',
      createdAt: 104,
    });
    assert.equal(r.records.at(-1).id, 5);
    assert(!JSON.stringify(r).includes('private'));
    assert.equal(s.r.exportCaseMetadata('other').total, 1);
    assert.deepEqual(s.r.exportCaseMetadata('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM moderation_cases').get().n, 105);
  } finally {
    s.db.close();
  }
});
test('case actionstate counts exactguild unresolved only pendinguncertain no clearing or retry', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.caseActionCounts('g'), [
      { action: 'nickname', status: 'failed', count: 26 },
      { action: 'nickname', status: 'pending', count: 26 },
      { action: 'warn', status: 'completed', count: 26 },
      { action: 'warn', status: 'uncertain', count: 26 },
    ]);
    const a = s.r.exportCaseMetadata('g', true);
    assert.equal(a.total, 52);
    assert.equal(a.truncated, false);
    assert(a.records.every((r) => ['pending', 'uncertain'].includes(r.status)));
    assert.equal(s.r.caseActionCounts('empty').length, 0);
    assert.throws(() => s.r.exportCaseMetadata('g', 'true'), /caseHistoryInvalid/);
    assert.equal(
      s.db
        .prepare("SELECT COUNT(*)n FROM moderation_cases WHERE guild_id='g' AND status='pending'")
        .get().n,
      26,
    );
  } finally {
    s.db.close();
  }
});
test('3minimalcasepaths private3locale freshManageGuild no targetfetch exactJSON noping branding', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportmetadata', 'actioncounts', 'exportunresolved']) {
      const s = setup();
      try {
        let reply,
          allowed = true;
        const i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: {
            id: 'g',
            members: {
              fetch: async (p) => {
                assert.deepEqual(p, { user: 'u', force: true });
                return { id: 'u', guild: { id: 'g' }, permissions: { has: () => allowed } };
              },
            },
          },
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          cases: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'caseMinimalMetadata'));
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'actioncounts'
            ? s.r.caseActionCounts('g')
            : s.r.exportCaseMetadata('g', sub === 'exportunresolved'),
        );
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
