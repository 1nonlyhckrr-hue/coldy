import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Polls } from '../src/services/polls.js';
import command from '../src/commands/utility/pollmanage.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  channel = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Polls(db);
  for (let n = 0; n < 103; n++)
    db.prepare(
      'INSERT INTO native_polls(guild_id,actor_id,channel_id,message_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'g',
      'creator-private',
      n === 0 ? id : channel,
      n % 3 === 0 ? 'message-binding' : null,
      ['sent', 'sending', 'uncertain'][n % 3],
      'source-private' + n,
      n,
    );
  db.prepare(
    'INSERT INTO native_polls(guild_id,actor_id,channel_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'foreign', channel, 'sending', 'foreign-source', 0);
  return { db, r };
}
test('poll receipt summary allstoredsendstates only guildscoped not votingcounts no effects', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), [
      { status: 'sending', count: 34 },
      { status: 'sent', count: 35 },
      { status: 'uncertain', count: 34 },
    ]);
    assert.deepEqual(s.r.summary('empty'), []);
    assert.equal(s.r.summary('other')[0].count, 1);
  } finally {
    s.db.close();
  }
});
test('poll export100whole latestbindings truncation exactstoredchannel null no actors/sources/foreigndata', () => {
  const s = setup();
  try {
    const r = s.r.exportReceipts('g');
    assert.equal(r.total, 103);
    assert.equal(r.truncated, true);
    assert.equal(r.receipts.length, 100);
    assert.equal(r.receipts[0].id, 103);
    assert.equal(r.receipts.at(-1).id, 4);
    assert.equal(s.r.exportReceipts('g', id).total, 1);
    assert.deepEqual(s.r.exportReceipts('empty'), { total: 0, truncated: false, receipts: [] });
    for (const v of ['creator-private', 'source-private', 'foreign', 'actor_id', 'interaction_id'])
      assert(!JSON.stringify(r).includes(v));
    for (const v of ['bad', 1, {}]) assert.throws(() => s.r.exportReceipts('g', v));
    assert.equal(s.db.prepare('SELECT count(*)n FROM native_polls').get().n, 104);
  } finally {
    s.db.close();
  }
});
test('pollreceipt3paths freshmanager beforeread private3locale exactexportbytes no native lookups', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'export', 'channelreceipts']) {
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
          options: { getSubcommand: () => sub, getString: () => channel },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          polls: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            s.r.exportReceipts('g', sub === 'export' ? null : channel),
          );
        allowed = false;
        c.polls = new Proxy(
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
