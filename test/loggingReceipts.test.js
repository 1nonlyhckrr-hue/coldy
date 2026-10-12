import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { EventLogDelivery } from '../src/services/eventLogs.js';
import command from '../src/commands/logging/logging.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new EventLogDelivery(db),
    cfg = new GuildConfig(new GuildSettings(db));
  for (let n = 0; n < 102; n++)
    db.prepare('INSERT INTO event_log_deliveries VALUES(?,?,?,?)').run(
      'private-source-' + n,
      'g',
      ['reserved', 'sent', 'uncertain', 'unavailable'][n % 4],
      n,
    );
  db.prepare('INSERT INTO event_log_deliveries VALUES(?,?,?,?)').run(
    'other-source',
    'other',
    'sent',
    999,
  );
  cfg.patch('g', 'logging', {
    enabled: true,
    channelId: '100000000000000001',
    events: [
      'memberjoin',
      'memberleave',
      'rolecreate',
      'roledelete',
      'roleupdate',
      'channelcreate',
      'channeldelete',
      'channelupdate',
    ],
  });
  return { db, r, cfg };
}
test('eventlogreceipt aggregate fourstates exactguild no eventkeys/sourceIDs no nativeoutcome/no mutation', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), [
      { status: 'reserved', count: 26 },
      { status: 'sent', count: 26 },
      { status: 'unavailable', count: 25 },
      { status: 'uncertain', count: 25 },
    ]);
    assert.deepEqual(s.r.summary('other'), [{ status: 'sent', count: 1 }]);
    assert.deepEqual(s.r.summary('empty'), []);
    assert.equal(s.r.reserved('private-source-0', 'g'), true);
    assert(!JSON.stringify(s.r.summary('g')).includes('private'));
  } finally {
    s.db.close();
  }
});
test('eventlogreceipt metadata latest100 order total/truncation no eventkey/content/subjectIDs', () => {
  const s = setup();
  try {
    const a = s.r.exportReceipts('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { status: 'sent', createdAt: 101 });
    assert.equal(a.records.at(-1).createdAt, 2);
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(s.r.exportReceipts('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.r.exportReceipts('other').total, 1);
  } finally {
    s.db.close();
  }
});
test('logging3paths freshmanageguild private3locale exactJSON groupconfirm/invalid/policyreceiptpreservation', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['deliverysummary', 'exportreceipts', 'pausegroup']) {
      const s = setup();
      try {
        let reply,
          manager = true,
          confirm = true,
          group = 'role';
        s.cfg.setLanguage('g', locale);
        const i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: 'u', force: true });
                return { id: 'u', guild: { id: 'g' }, permissions: { has: () => manager } };
              },
            },
          },
          options: { getSubcommand: () => sub, getString: () => group, getBoolean: () => confirm },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { guildConfig: s.cfg, eventLogs: s.r };
        const before = s.cfg.get('g'),
          receipts = s.r.exportReceipts('g');
        if (sub === 'pausegroup') {
          confirm = false;
          await assert.rejects(() => command.execute(i, c), /logResetConfirm/);
          confirm = true;
          group = 'bad';
          await assert.rejects(() => command.execute(i, c), /logEventInvalid/);
          assert.deepEqual(s.cfg.get('g'), before);
          group = 'role';
        }
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'pausegroup')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'deliverysummary' ? s.r.summary('g') : s.r.exportReceipts('g'),
          );
        else {
          assert.deepEqual(s.cfg.get('g'), {
            ...before,
            logging: {
              ...before.logging,
              events: before.logging.events.filter((k) => !k.startsWith('role')),
            },
          });
          assert.deepEqual(s.r.exportReceipts('g'), receipts);
        }
        manager = false;
        c.eventLogs = new Proxy(
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
