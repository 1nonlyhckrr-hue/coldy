import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AfkStates } from '../src/services/afk.js';
import command from '../src/commands/utility/afk.js';
import { translate } from '../src/services/localization.js';
const clock = 8 * 86400000,
  channel = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new AfkStates(db, () => clock);
  for (const [g, u, t] of [
    ['g', 'private-user', 86400000],
    ['g', 'expired', 86400000 - 1],
    ['other', 'other-user', clock],
  ])
    db.prepare('INSERT INTO afk_states VALUES(?,?,?,?,?)').run(g, u, channel, 'private reason', t);
  for (let n = 0; n < 102; n++)
    db.prepare('INSERT INTO afk_notices VALUES(?,?,?,?)').run(
      'private-message-' + n,
      'g',
      channel,
      clock - 86400000 + n,
    );
  db.prepare('INSERT INTO afk_notices VALUES(?,?,?,?)').run(
    'expired',
    'g',
    channel,
    clock - 86400000 - 1,
  );
  db.prepare('INSERT INTO afk_notices VALUES(?,?,?,?)').run('other', 'other', channel, clock);
  return { db, r };
}
test('AFKaudit expiryboundary storedcounts channelaggregates isolate guilds readonlyandinvalidclockfailclosed', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), { states: 1, notices: 102 });
    assert.deepEqual(s.r.channelCounts('g'), [{ channelId: channel, count: 1 }]);
    assert.deepEqual(s.r.summary('empty'), { states: 0, notices: 0 });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM afk_states').get().n, 3);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM afk_notices').get().n, 104);
    s.r.now = () => NaN;
    for (const fn of ['summary', 'channelCounts', 'exportNotices'])
      assert.throws(() => s.r[fn]('g'), /afkStoredScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('AFKnotice metadata latest100 total/truncated exactboundary no source/member/reasons no deliveredclaim', () => {
  const s = setup();
  try {
    const a = s.r.exportNotices('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { channelId: channel, createdAt: clock - 86400000 + 101 });
    assert.equal(a.records.at(-1).createdAt, clock - 86400000 + 2);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.exportNotices('other').total, 1);
    assert.deepEqual(s.r.exportNotices('empty'), { total: 0, truncated: false, records: [] });
  } finally {
    s.db.close();
  }
});
test('AFK3auditpaths private3locale freshmanageguild minimalJSON permissiondeniedbeforedataread', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'channelcounts', 'exportnotices']) {
      const s = setup();
      try {
        let reply,
          manager = true;
        const i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: 'u', force: true });
                return { id: 'u', guild: { id: 'g' }, permissions: { has: () => manager } };
              },
            },
          },
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          afk: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'summary'
            ? s.r.summary('g')
            : sub === 'channelcounts'
              ? s.r.channelCounts('g')
              : s.r.exportNotices('g'),
        );
        manager = false;
        c.afk = new Proxy(
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
