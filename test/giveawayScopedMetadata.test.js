import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Giveaways } from '../src/services/giveaways.js';
import command from '../src/commands/giveaway/giveaway.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Giveaways(db);
  for (let n = 0; n < 104; n++)
    db.prepare(
      'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at)VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'g',
      ch,
      'private-prize',
      2,
      n,
      ['pending', 'active', 'ending', 'ended', 'uncertain', 'cancelled'][n % 6],
      'private-source-' + n,
      n,
    );
  db.prepare(
    'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at)VALUES(?,?,?,?,?,?,?,?)',
  ).run('other', ch, 'private-prize', 1, 0, 'uncertain', 'other-source', 0);
  return { db, r };
}
test('giveaway exactID minimalmetadata/null guildisolation validIDbounds no private content or mutation', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.scopedMetadata('g', 'id', 1), {
      id: 1,
      channelId: ch,
      status: 'pending',
      endsAt: 0,
      winnerCount: 2,
      drawVersion: 0,
      createdAt: 0,
    });
    assert.equal(s.r.scopedMetadata('g', 'id', 105), null);
    assert.equal(s.r.scopedMetadata('other', 'id', 1), null);
    assert(!JSON.stringify(s.r.scopedMetadata('g', 'id', 1)).includes('private'));
    for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => s.r.scopedMetadata('g', 'id', id), /giveawayNotFound/);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM giveaways').get().n, 105);
  } finally {
    s.db.close();
  }
});
test('giveaway channel/unresolved minimal latest100 order totaltruncation exactstates unknownscope malformed IDs', () => {
  const s = setup();
  try {
    const a = s.r.scopedMetadata('g', 'channel', ch);
    assert.equal(a.total, 104);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.equal(a.records[0].id, 104);
    assert.equal(a.records.at(-1).id, 5);
    assert.deepEqual(Object.keys(a.records[0]), [
      'id',
      'channelId',
      'status',
      'endsAt',
      'winnerCount',
      'drawVersion',
      'createdAt',
    ]);
    const u = s.r.scopedMetadata('g', 'unresolved');
    assert.equal(u.total, 52);
    assert(u.records.every((v) => ['pending', 'ending', 'uncertain'].includes(v.status)));
    assert.equal(s.r.scopedMetadata('other', 'channel', ch).total, 1);
    assert.equal(s.r.scopedMetadata('empty', 'unresolved').total, 0);
    assert.equal(s.r.scopedMetadata('g', 'channel', '100000000000000002').total, 0);
    for (const id of [null, 1, 'x', '1'.repeat(16), '1'.repeat(21)])
      assert.throws(() => s.r.scopedMetadata('g', 'channel', id), /giveawayNotFound/);
    assert.throws(() => s.r.scopedMetadata('g', 'bad'), /giveawayNotFound/);
  } finally {
    s.db.close();
  }
});
test('3giveawayscopedpaths freshManageGuild private3locale exactJSON branding noping no native targets/draw', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['inspectmetadata', 'channelmetadata', 'exportunresolved']) {
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
          options: { getSubcommand: () => sub, getInteger: () => 1, getString: () => ch },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { giveaways: s.r, guildConfig: { get: () => ({ language: locale }) } };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'giveawayScopedMetadata'));
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          s.r.scopedMetadata(
            'g',
            sub === 'inspectmetadata' ? 'id' : sub === 'channelmetadata' ? 'channel' : 'unresolved',
            sub === 'inspectmetadata' ? 1 : ch,
          ),
        );
        allowed = false;
        c.giveaways = new Proxy(
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
