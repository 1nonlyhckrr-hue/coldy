import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Polls } from '../src/services/polls.js';
import command from '../src/commands/utility/pollmanage.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Polls(db);
  for (let n = 0; n < 102; n++)
    db.prepare(
      'INSERT INTO native_polls(guild_id,actor_id,channel_id,message_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'g',
      'private-actor',
      n % 2 ? 'c1' : 'c2',
      'private-message' + n,
      ['sending', 'sent', 'uncertain'][n % 3],
      'private-source' + n,
      n,
    );
  db.prepare(
    'INSERT INTO native_polls(guild_id,actor_id,channel_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'private', 'c1', 'uncertain', 'other', 0);
  return { db, r };
}
test('poll100minimalmetadata exactorder counttruncation no source/actorIDs isolated no mutation', () => {
  const s = setup();
  try {
    const a = s.r.exportMetadata('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], {
      id: 102,
      channelId: 'c1',
      status: 'uncertain',
      createdAt: 101,
    });
    assert.equal(a.records.at(-1).id, 3);
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(s.r.exportMetadata('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.r.exportMetadata('other').total, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM native_polls').get().n, 103);
  } finally {
    s.db.close();
  }
});
test('pollchannelcounts allretainedstates exactreceipt/null invalidIDs no nativevotingclaim', () => {
  const s = setup();
  try {
    const a = s.r.channelCounts('g');
    assert.equal(a.length, 6);
    assert(a.every((v) => v.count === 17));
    assert.deepEqual(Object.keys(a[0]), ['channelId', 'status', 'count']);
    assert.deepEqual(s.r.inspectReceipt('g', 1), {
      id: 1,
      channelId: 'c2',
      status: 'sending',
      createdAt: 0,
    });
    assert.equal(s.r.inspectReceipt('other', 1), null);
    assert.equal(s.r.inspectReceipt('g', 999), null);
    for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => s.r.inspectReceipt('g', id), /pollManageInvalid/);
  } finally {
    s.db.close();
  }
});
test('3pollmetadata paths freshManageGuild private3locale exactJSON brandednoping no messagefetch/end/nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportmetadata', 'channelcounts', 'inspectreceipt']) {
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
          options: { getSubcommand: () => sub, getInteger: () => 1 },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          polls: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'pollMinimalMetadata'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'exportmetadata'
            ? s.r.exportMetadata('g')
            : sub === 'channelcounts'
              ? s.r.channelCounts('g')
              : s.r.inspectReceipt('g', 1),
        );
        allowed = false;
        c.polls = new Proxy(
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
