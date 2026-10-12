import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { VoiceMaster } from '../src/services/voiceMaster.js';
import command from '../src/commands/voicemaster/voicemaster.js';
import { translate } from '../src/services/localization.js';
const channel = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new VoiceMaster(db);
  for (let n = 0; n < 105; n++)
    db.prepare(
      'INSERT INTO voice_master_channels(guild_id,owner_id,channel_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
    ).run(
      'g',
      'private-owner-' + n,
      n === 0 ? channel : null,
      ['creating', 'deleting', 'uncertain'][n % 3],
      'private-source-' + n,
      n,
    );
  db.prepare(
    'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at) VALUES(?,?,?,?,?)',
  ).run('g', 'other', 'active', 'active', 0);
  db.prepare(
    'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at) VALUES(?,?,?,?,?)',
  ).run('other', 'private', 'uncertain', 'other', 0);
  return { db, r };
}
test('voiceexactrecord metadata minimalkeys/null guildisolation strictIDs no owner/source/native lookup', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.inspectRecord('g', 1), {
      id: 1,
      channel_id: channel,
      status: 'creating',
      public_access: 0,
      created_at: 0,
    });
    assert.equal(s.r.inspectRecord('other', 1), null);
    assert.equal(s.r.inspectRecord('g', 999), null);
    for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => s.r.inspectRecord('g', id), /vmRecordsInvalid/);
  } finally {
    s.db.close();
  }
});
test('voicechannelrecords exactscope and105recovery states latest100 totaltruncation no active rows or writes', () => {
  const s = setup();
  try {
    const a = s.r.scopedRecords('g', { recovery: true });
    assert.equal(a.total, 105);
    assert.equal(a.records.length, 100);
    assert.equal(a.truncated, true);
    assert.equal(a.records[0].id, 105);
    assert.equal(a.records.at(-1).id, 6);
    assert(a.records.every((v) => v.status !== 'active'));
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.scopedRecords('g', { channelId: channel }).total, 1);
    assert.deepEqual(s.r.scopedRecords('other', { channelId: channel }), {
      total: 0,
      truncated: false,
      records: [],
    });
    assert.equal(s.r.scopedRecords('other', { recovery: true }).total, 1);
    for (const id of ['x', 12, '1'.repeat(16), '1'.repeat(21)])
      assert.throws(() => s.r.scopedRecords('g', { channelId: id }), /vmRecordsInvalid/);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM voice_master_channels').get().n, 107);
  } finally {
    s.db.close();
  }
});
test('voice3scopepaths freshManageChannels private3locale exactJSON branding noping no targetnativeactions', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['inspectrecord', 'channelrecords', 'exportrecovery']) {
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
          options: { getSubcommand: () => sub, getInteger: () => 1, getString: () => channel },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          voiceMaster: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'vmScopedMetadata'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'inspectrecord'
            ? s.r.inspectRecord('g', 1)
            : s.r.scopedRecords(
                'g',
                sub === 'channelrecords' ? { channelId: channel } : { recovery: true },
              ),
        );
        allowed = false;
        c.voiceMaster = new Proxy(
          {},
          {
            get: () => {
              throw Error('no service read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
