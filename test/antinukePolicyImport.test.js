import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AntinukeAlerts } from '../src/services/antinuke.js';
import command from '../src/commands/antinuke/antinuke.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  ch = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    a = new AntinukeAlerts(db);
  a.patch('g', { enabled: true, channelId: ch, threshold: 8, trustedUsers: [id] });
  a.patch('other', { enabled: true, channelId: ch, trustedUsers: [id] });
  return { db, a };
}
test('alertpolicy strict replacement force disabled defaults isolated invalid no mutation/storage abort safe', () => {
  const s = setup();
  try {
    s.a.importPolicy(
      'g',
      JSON.stringify({ enabled: true, channelId: ch, threshold: 3, trustedUsers: [id] }),
    );
    assert.equal(s.a.get('g').enabled, false);
    assert.equal(s.a.get('g').threshold, 3);
    assert.equal(s.a.get('other').enabled, true);
    const before = JSON.stringify(s.a.get('g'));
    for (const text of [
      'null',
      '[]',
      '{',
      JSON.stringify({ unknown: true }),
      JSON.stringify({ trustedUsers: [id, id] }),
      JSON.stringify({ channelId: 'bad' }),
      JSON.stringify({ threshold: 21 }),
      JSON.stringify({ windowSeconds: 9 }),
      'x'.repeat(4001),
    ]) {
      assert.throws(() => s.a.importPolicy('g', text), /antinukeImportInvalid/);
      assert.equal(JSON.stringify(s.a.get('g')), before);
    }
    s.db.exec(
      "CREATE TRIGGER fail_import BEFORE UPDATE ON antinuke_config BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.a.importPolicy('g', '{}'));
    assert.equal(JSON.stringify(s.a.get('g')), before);
  } finally {
    s.db.close();
  }
});
test('cleartrust keeps monitoring/destination thresholds owner/bot exemptions;clearchannel keeps trust/history', () => {
  const s = setup();
  try {
    assert.equal(s.a.clearTrust('g'), 1);
    assert.equal(s.a.clearTrust('g'), 0);
    assert.equal(s.a.get('g').enabled, true);
    assert.equal(s.a.get('g').channelId, ch);
    assert.equal(s.a.get('g').threshold, 8);
    assert.deepEqual(s.a.get('other').trustedUsers, [id]);
    s.a.trust('g', id, true);
    s.a.clearChannel('g');
    s.a.clearChannel('g');
    assert.equal(s.a.get('g').enabled, false);
    assert.equal(s.a.get('g').channelId, undefined);
    assert.deepEqual(s.a.get('g').trustedUsers, [id]);
    assert.equal(s.a.get('g').threshold, 8);
    assert.equal(s.a.get('other').enabled, true);
  } finally {
    s.db.close();
  }
});
test('alert library manager/confirm/private3locale no native target/send/punishment', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['importpolicy', 'cleartrust', 'clearchannel']) {
      const s = setup();
      try {
        let confirm = false,
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
              getString: () => JSON.stringify({ enabled: true, channelId: ch }),
            },
          },
          c = {
            antinuke: s.a,
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          };
        const before = JSON.stringify(s.a.get('g'));
        await assert.rejects(() => command.execute(i, c), /antinukeResetConfirm/);
        assert.equal(JSON.stringify(s.a.get('g')), before);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('antinukePolicyImported'));
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
