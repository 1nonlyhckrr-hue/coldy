import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Polls } from '../src/services/polls.js';
import command from '../src/commands/utility/pollmanage.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Polls(db);
  for (let n = 0; n < 105; n++)
    db.prepare(
      'INSERT INTO native_polls(guild_id,actor_id,channel_id,message_id,status,interaction_id,created_at)VALUES(?,?,?,?,?,?,?)',
    ).run(
      'g',
      'private-actor',
      ch,
      'private-message' + n,
      ['sending', 'sent', 'uncertain'][n % 3],
      'private-source' + n,
      n,
    );
  db.prepare(
    'INSERT INTO native_polls(guild_id,actor_id,channel_id,status,interaction_id,created_at)VALUES(?,?,?,?,?,?)',
  ).run('other', 'private', ch, 'uncertain', 'other', 0);
  return { db, r };
}
test('pollchannelmetadata latest100minimal order totaltruncation isolate sourcefree nonmutating', () => {
  const s = setup();
  try {
    const a = s.r.scopedMetadata('g', 'channel', ch);
    assert.equal(a.total, 105);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { id: 105, channelId: ch, status: 'uncertain', createdAt: 104 });
    assert.equal(a.records.at(-1).id, 6);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.scopedMetadata('other', 'channel', ch).total, 1);
    assert.deepEqual(s.r.scopedMetadata('g', 'channel', '100000000000000002'), {
      total: 0,
      truncated: false,
      records: [],
    });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM native_polls').get().n, 106);
  } finally {
    s.db.close();
  }
});
test('pollstate/unresolved exact retained bookkeeping no votingstate or recovery strictstatechannelbounds', () => {
  const s = setup();
  try {
    for (const state of ['sending', 'sent', 'uncertain']) {
      const a = s.r.scopedMetadata('g', 'state', state);
      assert.equal(a.total, 35);
      assert(a.records.every((v) => v.status === state));
    }
    const a = s.r.scopedMetadata('g', 'unresolved');
    assert.equal(a.total, 70);
    assert(!a.records.some((v) => v.status === 'sent'));
    assert.equal(s.r.scopedMetadata('empty', 'unresolved').total, 0);
    for (const v of ['Sent', 'ended', 'bad', null, 1])
      assert.throws(() => s.r.scopedMetadata('g', 'state', v), /pollManageInvalid/);
    for (const v of ['x', null, 1, '1'.repeat(16), '1'.repeat(21)])
      assert.throws(() => s.r.scopedMetadata('g', 'channel', v), /pollManageInvalid/);
    assert.throws(() => s.r.scopedMetadata('g', 'bad'), /pollManageInvalid/);
  } finally {
    s.db.close();
  }
});
test('3pollscopedpaths freshManageGuild private3locale exactJSON no nativepoll/targetfetch brandednoping', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['channelmetadata', 'statemetadata', 'exportunresolved']) {
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
          options: {
            getSubcommand: () => sub,
            getString: (n) => (n === 'state' ? 'uncertain' : ch),
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          polls: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'pollScopedMetadata'));
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          s.r.scopedMetadata(
            'g',
            sub === 'channelmetadata'
              ? 'channel'
              : sub === 'statemetadata'
                ? 'state'
                : 'unresolved',
            sub === 'channelmetadata' ? ch : 'uncertain',
          ),
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
