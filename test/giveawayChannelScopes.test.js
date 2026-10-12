import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Giveaways } from '../src/services/giveaways.js';
import command from '../src/commands/giveaway/giveaway.js';
const id = '100000000000000001',
  channel = '100000000000000002',
  other = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Giveaways(db);
  for (const [g, c, state] of [
    ['g', channel, 'active'],
    ['g', channel, 'pending'],
    ['g', channel, 'ending'],
    ['g', channel, 'uncertain'],
    ['g', channel, 'ended'],
    ['g', channel, 'cancelled'],
    ['g', other, 'active'],
    ['other', channel, 'active'],
  ]) {
    const row = db
      .prepare(
        'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(g, c, 'Prize', 1, 100, state, g + c + state, 0);
    db.prepare('INSERT INTO giveaway_entries VALUES(?,?,?)').run(row.lastInsertRowid, id, 0);
  }
  return { db, r };
}
test('giveaway scope summary retainedentries exactguildstates and confirmedstyle activeonlychannelcancel keepshistory', () => {
  const s = setup();
  try {
    assert.equal(s.r.summary('g').retainedEntries, 7);
    assert.equal(s.r.cancelChannel('g', channel), 1);
    assert.equal(s.r.get(1, 'g').status, 'cancelled');
    for (const [k, state] of [
      [2, 'pending'],
      [3, 'ending'],
      [4, 'uncertain'],
      [5, 'ended'],
      [6, 'cancelled'],
      [7, 'active'],
    ])
      assert.equal(s.r.get(k, 'g').status, state);
    assert.equal(s.r.get(8, 'other').status, 'active');
    assert.equal(s.db.prepare('SELECT count(*)n FROM giveaway_entries').get().n, 8);
    assert.equal(s.r.cancelChannel('g', channel), 0);
    assert.throws(() => s.r.cancelChannel('g', 'bad'));
  } finally {
    s.db.close();
  }
});
test('exactstoredchannel exports100wholemetadata total/truncated excludes entrants/winners/source no effects', () => {
  const s = setup();
  try {
    for (let n = 0; n < 100; n++)
      s.db
        .prepare(
          'INSERT INTO giveaways(guild_id,channel_id,prize,winner_count,ends_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run('g', channel, 'X', 1, 100, 'ended', 'extra' + n, 0);
    const a = s.r.channelRecords('g', channel);
    assert.equal(a.total, 106);
    assert(a.truncated);
    assert.equal(a.records.length, 100);
    assert.equal(s.r.channelRecords('g', other).total, 1);
    for (const v of ['interaction_id', 'user_id', 'winner_ids', id])
      assert(!JSON.stringify(a).includes(v));
    assert.throws(() => s.r.channelRecords('g', 'bad'));
    assert.equal(s.r.summary('g').retainedEntries, 7);
  } finally {
    s.db.close();
  }
});
test('giveawayscope3paths freshmanager confirmbeforecancel private3locale exactfiles nativeuntouched', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'channelrecords', 'cancelchannel']) {
      const s = setup();
      try {
        let reply,
          allowed = true,
          confirmed = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async () => ({ id, guild: { id: 'g' }, permissions: { has: () => allowed } }),
            },
          },
          options: {
            getSubcommand: () => sub,
            getString: () => channel,
            getBoolean: () => confirmed,
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { giveaways: s.r, guildConfig: { get: () => ({ language: locale }) } };
        if (sub === 'cancelchannel') {
          confirmed = false;
          await assert.rejects(() => command.execute(i, c), /giveawayStoredConfirm/);
          assert.equal(s.r.get(1, 'g').status, 'active');
          confirmed = true;
        }
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub === 'channelrecords')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            s.r.channelRecords('g', channel),
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
