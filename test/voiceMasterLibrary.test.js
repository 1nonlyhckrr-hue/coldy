import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { VoiceMaster } from '../src/services/voiceMaster.js';
import command from '../src/commands/voicemaster/voicemaster.js';
import { translate } from '../src/services/localization.js';
const category = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    v = new VoiceMaster(db);
  v.setup('g', category);
  v.setup('other', category);
  for (let n = 1; n <= 12; n++)
    db.prepare(
      'INSERT INTO voice_master_channels(guild_id,owner_id,channel_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
    ).run('g', 'u' + n, 'c' + n, n % 2 ? 'active' : 'closed', 'i' + n, 1);
  db.prepare(
    'INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at) VALUES(?,?,?,?,?)',
  ).run('other', 'private-owner', 'uncertain', 'foreign', 1);
  return { db, v };
}
test('VoiceMaster resetsetup stops configuration only,retains exactownership/history/otherguild', () => {
  const s = setup();
  try {
    const before = JSON.stringify(s.db.prepare('SELECT * FROM voice_master_channels').all());
    assert.equal(s.v.resetSetup('g'), 1);
    assert.equal(s.v.resetSetup('g'), 0);
    assert.equal(s.v.config('g'), undefined);
    assert.equal(s.v.config('other').category_id, category);
    assert.equal(JSON.stringify(s.db.prepare('SELECT * FROM voice_master_channels').all()), before);
    assert(s.v.owned('g', 'u1'));
  } finally {
    s.db.close();
  }
});
test('VoiceMaster storedrecords pagination/filter/guild boundaries no mutation and resetstoragefail safe', () => {
  const s = setup();
  try {
    assert.equal(s.v.records('g').rows.length, 10);
    assert.equal(s.v.records('g', 2).rows.length, 2);
    const r = s.v.records('g', 1, 'closed');
    assert.equal(r.total, 6);
    assert(r.rows.every((v) => v.status === 'closed'));
    assert(!JSON.stringify(r).includes('private-owner'));
    for (const [page, state] of [
      [0, null],
      [1.5, null],
      [3, null],
      [1, 'bad'],
    ])
      assert.throws(() => s.v.records('g', page, state), /vmRecordsInvalid/);
    assert.deepEqual(s.v.records('empty').rows, []);
    s.db.exec(
      "CREATE TRIGGER fail_vm BEFORE DELETE ON voice_master_config BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.v.resetSetup('g'));
    assert.equal(s.v.config('g').category_id, category);
  } finally {
    s.db.close();
  }
});
test('VoiceMaster library current ManageChannels/confirm/private3locale exactconfigbytes no nativechanges', async () => {
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
          options: {
            getSubcommand: () => sub,
            getBoolean: () => confirm,
            getInteger: () => null,
            getString: () => null,
          },
        },
        c = {
          voiceMaster: s.v,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      await command.execute(i, c);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), { category_id: category });
      sub = 'records';
      await command.execute(i, c);
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'resetsetup';
      await assert.rejects(() => command.execute(i, c), /vmSetupResetConfirm/);
      confirm = true;
      await command.execute(i, c);
      sub = 'exportconfig';
      await command.execute(i, c);
      assert.equal(JSON.parse(reply.files[0].attachment.toString()), null);
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
