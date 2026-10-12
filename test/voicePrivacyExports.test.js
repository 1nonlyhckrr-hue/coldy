import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { VoiceMaster } from '../src/services/voiceMaster.js';
import command from '../src/commands/voicemaster/voicemaster.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  other = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new VoiceMaster(db);
  for (let n = 0; n < 103; n++)
    db.prepare(
      'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at,public_access) VALUES(?,?,?,?,?,?)',
    ).run('g', id, 'closed', 'source-private' + n, n, n % 2);
  db.prepare(
    'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at,public_access) VALUES(?,?,?,?,?,?)',
  ).run('g', other, 'uncertain', 'other', 0, 0);
  db.prepare(
    'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at,public_access) VALUES(?,?,?,?,?,?)',
  ).run('other', id, 'active', 'foreign', 0, 1);
  return { db, r };
}
test('voice storedstate/publicflag aggregates exactguild no identity or native inference', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), [
      { status: 'closed', public_access: 0, count: 52 },
      { status: 'closed', public_access: 1, count: 51 },
      { status: 'uncertain', public_access: 0, count: 1 },
    ]);
    assert.deepEqual(s.r.summary('empty'), []);
    assert.equal(s.r.summary('other')[0].count, 1);
  } finally {
    s.db.close();
  }
});
test('voice export100whole metadata nullbinding ownfilter totaltruncated no owners/sources effect', () => {
  const s = setup();
  try {
    const a = s.r.exportRecords('g', id);
    assert.equal(a.total, 103);
    assert.equal(a.records.length, 100);
    assert(a.truncated);
    assert.equal(a.records[0].id, 103);
    assert.equal(a.records[0].channel_id, null);
    for (const v of ['owner_id', 'interaction_id', 'source-private', id])
      assert(!JSON.stringify(a).includes(v));
    assert.equal(s.r.exportRecords('g', other).total, 1);
    assert.equal(s.r.exportRecords('other', id).total, 1);
    assert.equal(s.r.exportRecords('g').total, 104);
    assert.equal(s.db.prepare('SELECT count(*)n FROM voice_master_channels').get().n, 105);
  } finally {
    s.db.close();
  }
});
test('voiceprivacy3paths freshmanager/ownidentity private3locale exactattachment no nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'exportrecords', 'exportmine']) {
      const s = setup();
      try {
        let reply,
          valid = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: id, force: true });
                return {
                  id: valid ? id : 'wrong',
                  guild: { id: 'g' },
                  permissions: { has: () => true },
                };
              },
            },
          },
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          voiceMaster: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            s.r.exportRecords('g', sub === 'exportmine' ? id : null),
          );
        valid = false;
        c.voiceMaster = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(
          () => command.execute(i, c),
          sub === 'exportmine' ? /vmMemberInvalid/ : /userPermission/,
        );
      } finally {
        s.db.close();
      }
    }
});
