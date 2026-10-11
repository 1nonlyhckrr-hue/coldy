import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AfkStates } from '../src/services/afk.js';
import command from '../src/commands/utility/afk.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001',
  u = '100000000000000002',
  other = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:'),
    a = new AfkStates(db, () => 100000);
  a.set('g', u, ch, 'Ownreason');
  a.set('g', other, ch, 'Otherreason');
  a.set('g', '100000000000000004', other, 'Elsewhere');
  a.set('other', u, ch, 'Foreign');
  a.reserve('notice', 'g', ch);
  return { db, a };
}
test('AFK exactchannel/usererase scope retains notice guards otherguild/IDs/native independent', () => {
  for (const scope of ['channel', 'user']) {
    const s = setup();
    try {
      const count = scope === 'channel' ? s.a.clearChannel('g', ch) : s.a.clearUser('g', u);
      assert.equal(count, scope === 'channel' ? 2 : 1);
      assert.equal(s.a.get('g', u), undefined);
      assert.equal(s.a.get('other', u).reason, 'Foreign');
      assert.equal(s.a.get('g', '100000000000000004').reason, 'Elsewhere');
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 1);
      assert.equal(s.a.reserve('notice', 'g', ch), false);
      for (const v of ['bad', '', null, '1'.repeat(21)])
        assert.throws(
          () => (scope === 'channel' ? s.a.clearChannel('g', v) : s.a.clearUser('g', v)),
          /afkStoredScopeInvalid/,
        );
    } finally {
      s.db.close();
    }
  }
});
test('AFK scoped databaseabort no partial erase and own expiry unchanged', () => {
  const s = setup();
  try {
    s.db.exec(
      `CREATE TRIGGER fail_afk BEFORE DELETE ON afk_states WHEN OLD.user_id='${other}' BEGIN SELECT RAISE(ABORT,'stop');END;`,
    );
    assert.throws(() => s.a.clearChannel('g', ch));
    assert.equal(s.a.get('g', u).reason, 'Ownreason');
    assert.equal(s.a.get('g', other).created_at, 100000);
  } finally {
    s.db.close();
  }
});
test('AFK privateownexport exactcaller/null and manager scopedconfirm private3locale no native targetcalls', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let sub = 'exportmine',
        confirm = false,
        manager = false,
        reply;
      const actor = { id: u, guild: { id: 'g' }, permissions: { has: () => manager } },
        i = {
          guildId: 'g',
          user: { id: u },
          guild: { id: 'g', members: { fetch: async () => actor } },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => {
            reply = p;
          },
          options: {
            getSubcommand: () => sub,
            getBoolean: () => confirm,
            getString: () => (sub === 'clearchannel' ? ch : u),
          },
        },
        c = {
          afk: s.a,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      await command.execute(i, c);
      const report = JSON.parse(reply.files[0].attachment.toString());
      assert.deepEqual(report, {
        channelId: ch,
        reason: 'Ownreason',
        createdAt: 100000,
        expiresAt: 100000 + 7 * 86400000,
      });
      for (const v of ['clearuser', 'clearchannel']) {
        sub = v;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
        manager = true;
        await assert.rejects(() => command.execute(i, c), /afkClearConfirm/);
        confirm = true;
        await command.execute(i, c);
        manager = false;
        confirm = false;
      }
      sub = 'exportmine';
      await command.execute(i, c);
      assert.equal(JSON.parse(reply.files[0].attachment.toString()), null);
      assert.deepEqual(reply.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});
