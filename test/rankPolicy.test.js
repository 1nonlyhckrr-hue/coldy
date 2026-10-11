import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MessageRanks } from '../src/services/leaderboard.js';
import command from '../src/commands/leaderboard/leaderboard.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001',
  user = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new MessageRanks(db);
  r.enable('g', true);
  r.exclude('g', ch, true);
  r.enable('other', true);
  r.exclude('other', ch, true);
  r.privacy('g', user, true);
  db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run('g', user, '2026-10-11', 4);
  db.prepare('INSERT INTO message_rank_seen VALUES(?,?)').run('private-message', Date.now());
  return { db, r };
}
test('rank clear exclusions and resetpolicy retain counts/privacy/replay and isolate guild without enabling', () => {
  const s = setup();
  try {
    assert.equal(s.r.clearExclusions('g'), 1);
    assert.equal(s.r.clearExclusions('g'), 0);
    assert.equal(s.r.config('g').enabled, true);
    assert.deepEqual(s.r.config('other').excluded, [ch]);
    s.r.exclude('g', ch, true);
    s.r.resetPolicy('g');
    s.r.resetPolicy('g');
    assert.deepEqual(s.r.config('g'), { enabled: false, excluded: [] });
    assert.equal(s.r.config('other').enabled, true);
    assert(s.r.optedOut('g', user));
    assert.equal(
      s.db.prepare('SELECT count FROM message_rank_daily WHERE guild_id=?').get('g').count,
      4,
    );
    assert.equal(s.db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 1);
    assert.equal(s.r.clearExclusions('missing'), 0);
    assert.equal(
      s.db.prepare('SELECT count(*) n FROM message_rank_config WHERE guild_id=?').get('missing').n,
      0,
    );
  } finally {
    s.db.close();
  }
});
test('rank policy storage failure leaves config intact,no preference/history erasure', () => {
  const s = setup();
  try {
    s.db.exec(
      "CREATE TRIGGER fail_clear BEFORE UPDATE ON message_rank_config BEGIN SELECT RAISE(ABORT,'stop');END;CREATE TRIGGER fail_reset BEFORE DELETE ON message_rank_config BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.r.clearExclusions('g'));
    assert.throws(() => s.r.resetPolicy('g'));
    assert.deepEqual(s.r.config('g'), { enabled: true, excluded: [ch] });
    assert(s.r.optedOut('g', user));
  } finally {
    s.db.close();
  }
});
test('rank policy manager/confirm/private3locale exactexport bytes excludes people/counts', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let sub = 'exportconfig',
        confirm = false,
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
          options: { getSubcommand: () => sub, getBoolean: () => confirm },
        },
        c = {
          messageRanks: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      await command.execute(i, c);
      const text = reply.files[0].attachment.toString();
      assert.deepEqual(JSON.parse(text), { enabled: true, excluded: [ch] });
      assert(!text.includes(user));
      assert(!text.includes('private-message'));
      for (const v of ['clearexclusions', 'resetpolicy']) {
        sub = v;
        confirm = false;
        await assert.rejects(() => command.execute(i, c));
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('rankPolicyReset'));
      }
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
