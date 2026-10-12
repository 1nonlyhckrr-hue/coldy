import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MessageRanks } from '../src/services/leaderboard.js';
import command from '../src/commands/leaderboard/leaderboard.js';
import { translate } from '../src/services/localization.js';
const now = Date.parse('2026-10-12T12:00:00Z'),
  u = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new MessageRanks(db);
  for (const [g, id, d, c] of [
    ['g', u, '2026-10-12', 2],
    ['g', u, '2026-10-06', 3],
    ['g', u, '2026-10-05', 4],
    ['g', u, '2026-07-15', 5],
    ['g', u, '2026-07-14', 99],
    ['g', u, '2026-10-13', 99],
    ['g', '100000000000000002', '2026-10-12', 6],
    ['other', u, '2026-10-12', 80],
  ])
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(g, id, d, c);
  return { db, r };
}
test('weekly own disjoint90days exact13buckets oldest6 outside/future/otheruserguild excluded', () => {
  const s = setup();
  try {
    const rows = s.r.weeklyMine('g', u, now);
    assert.equal(rows.length, 13);
    assert.deepEqual(rows[0], { start: '2026-10-06', end: '2026-10-12', total: 5 });
    assert.equal(rows[1].total, 4);
    assert.deepEqual(rows[12], { start: '2026-07-15', end: '2026-07-20', total: 5 });
    assert.equal(
      rows.reduce((a, b) => a + b.total, 0),
      14,
    );
  } finally {
    s.db.close();
  }
});
test('daily aggregate pages and strictbefore erase guildscoped cutoffkept no preference/config/replay changes', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.dailyOverview('g', 1, now)[0], {
      day: '2026-10-12',
      contributors: 2,
      messages: 8,
    });
    assert.equal(s.r.dailyOverview('g', 9, now).at(-1).day, '2026-07-15');
    for (const n of [0, 10, 1.5, null]) assert.throws(() => s.r.dailyOverview('g', n, now));
    s.r.enable('g', true);
    s.r.privacy('g', '100000000000000099', true);
    s.db.prepare('INSERT INTO message_rank_seen VALUES(?,?)').run('100000000000000888', now);
    for (const d of ['2026-02-30', '2026-1-01', '2026-10-12T00:00:00Z', null])
      assert.throws(() => s.r.eraseBefore('g', d), /rankDateInvalid/);
    assert.equal(s.r.eraseBefore('g', '2026-10-06'), 3);
    assert.equal(s.r.stats('g', u, now).retained, 5);
    assert.equal(s.r.stats('other', u, now).retained, 80);
    assert(s.r.config('g').enabled);
    assert(s.r.optedOut('g', '100000000000000099'));
    assert.equal(s.db.prepare('SELECT count(*)n FROM message_rank_seen').get().n, 1);
  } finally {
    s.db.close();
  }
});
test('newrank paths fresh exact caller private3locale confirmed erase beforework no native effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['weeklymine', 'dailyoverview', 'erasebefore']) {
      let calls = 0,
        reply,
        confirmed = true,
        authorized = true;
      const i = {
        guildId: 'g',
        user: { id: u },
        guild: {
          id: 'g',
          members: {
            fetch: async (args) => {
              assert.deepEqual(args, { user: u, force: true });
              return { id: u, guild: { id: 'g' }, permissions: { has: () => authorized } };
            },
          },
        },
        options: {
          getSubcommand: () => sub,
          getInteger: () => 1,
          getString: () => '2026-10-06',
          getBoolean: () => confirmed,
        },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => (reply = p),
      };
      const c = {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        messageRanks: {
          weeklyMine: (g, id) => {
            calls++;
            assert.equal(g, 'g');
            assert.equal(id, u);
            return [];
          },
          dailyOverview: () => {
            calls++;
            return [];
          },
          eraseBefore: () => {
            calls++;
            return0();
          },
        },
      };
      function return0() {
        return 0;
      }
      await command.execute(i, c);
      assert.equal(calls, 1);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      if (sub !== 'weeklymine') {
        authorized = false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
        assert.equal(calls, 1);
      }
      if (sub === 'erasebefore') {
        authorized = true;
        confirmed = false;
        await assert.rejects(() => command.execute(i, c), /rankEraseConfirm/);
        assert.equal(calls, 1);
      }
    }
});
