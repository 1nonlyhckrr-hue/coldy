import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AfkStates } from '../src/services/afk.js';
import command from '../src/commands/utility/afk.js';
import { translate } from '../src/services/localization.js';
const now = 7 * 86400000 + 10000,
  channel = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new AfkStates(db, () => now);
  for (let n = 0; n < 102; n++)
    db.prepare('INSERT INTO afk_states VALUES(?,?,?,?,?)').run(
      'g',
      'private-user-' + n,
      channel,
      'private reason',
      now - n,
    );
  db.prepare('INSERT INTO afk_states VALUES(?,?,?,?,?)').run(
    'other',
    'private-user',
    channel,
    'private reason',
    now,
  );
  return { db, r };
}
test('AFK100minimal unexpired channeltimeexpiry sorted totaltruncation no reasons/user/sourceIDs exactscope isolate readsnonmutating', () => {
  const s = setup();
  try {
    const a = s.r.exportStatusMetadata('g');
    assert.equal(a.asOf, now);
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], {
      channelId: channel,
      createdAt: now,
      expiresAt: now + 604800000,
    });
    assert.equal(a.records.at(-1).createdAt, now - 99);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.exportStatusMetadata('other', channel).total, 1);
    assert.deepEqual(s.r.exportStatusMetadata('g', '100000000000000002'), {
      asOf: now,
      total: 0,
      truncated: false,
      records: [],
    });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM afk_states').get().n, 103);
    for (const id of ['x', 12, '1'.repeat(16), '1'.repeat(21)])
      assert.throws(() => s.r.exportStatusMetadata('g', id), /afkStoredScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('AFKagebands exact1hour1day7day expiryboundary futuretimestamp no cleanup invalidclock failsclosed', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new AfkStates(db, () => now);
    for (const [n, age] of [
      -1, 0, 3599999, 3600000, 86399999, 86400000, 604800000, 604800001,
    ].entries())
      db.prepare('INSERT INTO afk_states VALUES(?,?,?,?,?)').run(
        'g',
        'u' + n,
        channel,
        'reason',
        now - age,
      );
    assert.deepEqual(r.ageBands('g'), {
      asOf: now,
      total: 7,
      bands: { futureTimestamp: 1, under1hour: 2, from1hourTo1day: 2, from1dayTo7days: 2 },
    });
    assert.equal(r.exportStatusMetadata('g').total, 7);
    assert.equal(db.prepare('SELECT COUNT(*)n FROM afk_states').get().n, 8);
    for (const clock of [-1, NaN, 1.5, '1']) {
      r.now = () => clock;
      assert.throws(() => r.ageBands('g'), /afkStoredScopeInvalid/);
      assert.throws(() => r.exportStatusMetadata('g'), /afkStoredScopeInvalid/);
    }
  } finally {
    db.close();
  }
});
test('3AFKmetadata paths private3locale freshManageGuild exactJSON brandednoping no native effects orcleanup', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportstatuses', 'channelmetadata', 'agebands']) {
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
          options: { getSubcommand: () => sub, getString: () => channel },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          afk: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'afkStatusMetadata'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'agebands'
            ? s.r.ageBands('g')
            : s.r.exportStatusMetadata('g', sub === 'channelmetadata' ? channel : null),
        );
        allowed = false;
        c.afk = new Proxy(
          {},
          {
            get: () => {
              throw Error('no service reads');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
