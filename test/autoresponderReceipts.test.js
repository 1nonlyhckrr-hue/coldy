import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Autoresponders } from '../src/services/autoresponder.js';
import command from '../src/commands/autoresponder/autoresponder.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Autoresponders(db, () => 500000);
  r.create('g', { trigger: 'exact', response: 'keep' });
  r.create('g', { trigger: 'word', response: 'keep2', mode: 'keyword' });
  r.create('other', { trigger: 'exact', response: 'other' });
  for (let n = 0; n < 102; n++)
    db.prepare('INSERT INTO autoresponder_deliveries VALUES(?,?,?,?,?)').run(
      'private-message-' + n,
      'g',
      999,
      n % 2 ? 'sent' : 'uncertain',
      n,
    );
  db.prepare('INSERT INTO autoresponder_deliveries VALUES(?,?,?,?,?)').run(
    'other-private',
    'other',
    1,
    'reserved',
    1000,
  );
  return { db, r };
}
test('responder receipt JSON latest100 total truncation deterministic order no messageIDs/text and guildisolation', () => {
  const s = setup();
  try {
    const report = s.r.exportReceipts('g');
    assert.equal(report.total, 102);
    assert.equal(report.truncated, true);
    assert.equal(report.records.length, 100);
    assert.deepEqual(report.records[0], { ruleId: 999, status: 'sent', createdAt: 101 });
    assert.equal(report.records.at(-1).createdAt, 2);
    assert(!JSON.stringify(report).includes('private-message'));
    assert.deepEqual(s.r.exportReceipts('empty'), { total: 0, truncated: false, records: [] });
    assert.deepEqual(s.r.deliveryOverview('g'), [
      { ruleId: 999, status: 'sent', count: 51 },
      { ruleId: 999, status: 'uncertain', count: 51 },
    ]);
    assert.equal(s.r.exportReceipts('other').total, 1);
  } finally {
    s.db.close();
  }
});
test('responder modepause retains othermode/settings/replay and rejects invalidmode no partialchanges', () => {
  const s = setup();
  try {
    const before = s.r.list('g'),
      receipts = s.r.exportReceipts('g');
    assert.throws(() => s.r.disableMode('g', 'regex'));
    assert.deepEqual(s.r.list('g'), before);
    assert.equal(s.r.disableMode('g', 'keyword'), 1);
    assert.equal(s.r.disableMode('g', 'keyword'), 0);
    assert.equal(s.r.find('g', 'exact').enabled, 1);
    assert.equal(s.r.find('other', 'exact').enabled, 1);
    assert.deepEqual(s.r.find('g', 'word'), { ...before[1], enabled: 0 });
    assert.deepEqual(s.r.exportReceipts('g'), receipts);
    assert.equal(s.r.eligible('g', 'private-message-1', 'exact'), false);
  } finally {
    s.db.close();
  }
});
test('responder3paths freshmanageguild private3locale JSON and confirmbeforemutation', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['deliveryoverview', 'exportreceipts', 'disablemode']) {
      const s = setup();
      try {
        let reply,
          manager = true,
          confirm = true;
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
          options: {
            getSubcommand: () => sub,
            getString: () => 'keyword',
            getBoolean: () => confirm,
          },
          reply: async (p) => (reply = p),
        };
        const c = { guildConfig: { get: () => ({ language: locale }) }, autoresponders: s.r };
        if (sub === 'disablemode') {
          confirm = false;
          await assert.rejects(() => command.execute(i, c), /responderConfirmRequired/);
          assert.equal(s.r.find('g', 'word').enabled, 1);
          confirm = true;
        }
        await command.execute(i, c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'disablemode')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'deliveryoverview' ? s.r.deliveryOverview('g') : s.r.exportReceipts('g'),
          );
        manager = false;
        c.autoresponders = new Proxy(
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
