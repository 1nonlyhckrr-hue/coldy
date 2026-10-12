import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Giveaways } from '../src/services/giveaways.js';
import command from '../src/commands/giveaway/giveaway.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Giveaways(db);
  for (let n = 0; n < 102; n++) {
    const id = Number(
      db
        .prepare(
          'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          'g',
          n % 2 ? 'c1' : 'c2',
          'private prize',
          2,
          n,
          ['pending', 'active', 'ending', 'ended', 'uncertain', 'cancelled'][n % 6],
          'private-source-' + n,
          n,
        ).lastInsertRowid,
    );
    if (n % 2)
      db.prepare('INSERT INTO giveaway_entries VALUES(?,?,?)').run(id, 'private-member', n);
  }
  db.prepare(
    'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run('other', 'c1', 'private', 1, 0, 'uncertain', 'other', 0);
  return { db, r };
}
test('giveawayminimal100 metadata latestorder totaltruncation isolate no prize/members/sourceIDs or mutation', () => {
  const s = setup();
  try {
    const a = s.r.exportMetadata('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], {
      id: 102,
      channelId: 'c1',
      status: 'cancelled',
      endsAt: 101,
      winnerCount: 2,
      drawVersion: 0,
      createdAt: 101,
    });
    assert.equal(a.records.at(-1).id, 3);
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(s.r.exportMetadata('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.r.exportMetadata('other').total, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM giveaways').get().n, 103);
  } finally {
    s.db.close();
  }
});
test('giveawaylatest100 retainedentrycounts inclzero no memberIDs channelstatecounts allstates isolated', () => {
  const s = setup();
  try {
    const a = s.r.entryCounts('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { id: 102, status: 'cancelled', count: 1 });
    assert.deepEqual(a.records[1], { id: 101, status: 'uncertain', count: 0 });
    const counts = s.r.channelCounts('g');
    assert.equal(counts.length, 6);
    assert(counts.every((v) => v.count === 17));
    assert.deepEqual(Object.keys(counts[0]), ['channelId', 'status', 'count']);
    assert.deepEqual(s.r.channelCounts('empty'), []);
    assert.deepEqual(s.r.entryCounts('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM giveaway_entries').get().n, 51);
  } finally {
    s.db.close();
  }
});
test('giveaway3metadata paths freshManageGuild private3locale exactJSON brandednoping no draw/memberfetch/nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportmetadata', 'entrycounts', 'channelcounts']) {
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
        const c = { giveaways: s.r, guildConfig: { get: () => ({ language: locale }) } };
        await command.execute(i, c);
        assert.equal(
          reply.embeds[0].data.description,
          translate(locale, 'giveawayMetadataExported'),
        );
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'exportmetadata'
            ? s.r.exportMetadata('g')
            : sub === 'entrycounts'
              ? s.r.entryCounts('g')
              : s.r.channelCounts('g'),
        );
        allowed = false;
        c.giveaways = new Proxy(
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
