import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MessageSchedules } from '../src/services/automations.js';
import command from '../src/commands/automations/schedulecleanup.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001',
  other = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    s = new MessageSchedules(db, () => 100000);
  let n = 0;
  const add = (guild, channel, status) => {
    const id = s.create({
      guildId: guild,
      channelId: channel,
      body: 'private',
      dueAt: 200000,
      repeatMs: 600000,
      interactionId: 'i' + ++n,
    });
    db.prepare('UPDATE message_schedules SET status=? WHERE id=?').run(status, id);
    return id;
  };
  for (const state of ['pending', 'sending', 'uncertain', 'done', 'cancelled']) add('g', ch, state);
  add('g', other, 'pending');
  add('other', ch, 'pending');
  return { db, s };
}
test('destination schedulecleanup exact pending/status/finishedtext scope leaves unknown sending otherguild/channel', () => {
  for (const action of ['cancel', 'stoprepeats', 'erasefinished']) {
    const x = setup();
    try {
      assert.equal(x.s.scopedPending('g', ch, action), action === 'erasefinished' ? 2 : 1);
      assert.equal(x.s.scopedPending('g', ch, action), 0);
      const rows = x.db.prepare('SELECT * FROM message_schedules ORDER BY id').all();
      assert.equal(rows[0].status, action === 'cancel' ? 'cancelled' : 'pending');
      assert.equal(rows[0].repeat_ms, action === 'stoprepeats' ? null : 600000);
      assert.equal(rows[0].body, 'private');
      assert.equal(rows[1].status, 'sending');
      assert.equal(rows[2].status, 'uncertain');
      assert.equal(rows[3].body, action === 'erasefinished' ? '[erased]' : 'private');
      assert.equal(rows[4].body, action === 'erasefinished' ? '[erased]' : 'private');
      assert.equal(rows[5].status, 'pending');
      assert.equal(rows[6].status, 'pending');
    } finally {
      x.db.close();
    }
  }
});
test('destination cleanup input/action/storagefailure no partial or crossscope changes', () => {
  const x = setup();
  try {
    const before = JSON.stringify(x.db.prepare('SELECT * FROM message_schedules').all());
    assert.throws(() => x.s.scopedPending('g', 'bad', 'cancel'));
    assert.throws(() => x.s.scopedPending('g', ch, 'all'));
    x.db.exec(
      "CREATE TRIGGER fail_erase BEFORE UPDATE ON message_schedules WHEN OLD.status='cancelled' BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => x.s.scopedPending('g', ch, 'erasefinished'));
    assert.equal(JSON.stringify(x.db.prepare('SELECT * FROM message_schedules').all()), before);
  } finally {
    x.db.close();
  }
});
test('schedule cleanup current manager confirmation private3locale no destinationfetch/send', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['cancel', 'stoprepeats', 'erasefinished']) {
      const x = setup();
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
            options: { getSubcommand: () => sub, getString: () => ch, getBoolean: () => confirm },
          },
          c = {
            messageSchedules: x.s,
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          };
        await assert.rejects(() => command.execute(i, c), /automationBulkConfirm/);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('automationScopedCleanup'));
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        x.db.close();
      }
    }
});
