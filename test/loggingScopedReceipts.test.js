import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { EventLogDelivery } from '../src/services/eventLogs.js';
import command from '../src/commands/logging/logging.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new EventLogDelivery(db),
    cfg = new GuildConfig(new GuildSettings(db));
  for (let n = 0; n < 104; n++)
    db.prepare('INSERT INTO event_log_deliveries VALUES(?,?,?,?)').run(
      'private-source-' + n,
      'g',
      ['reserved', 'sent', 'uncertain', 'unavailable'][n % 4],
      n,
    );
  db.prepare('INSERT INTO event_log_deliveries VALUES(?,?,?,?)').run(
    'other-source',
    'other',
    'reserved',
    999,
  );
  return { db, r, cfg };
}
test('scoped receipts exact states unresolved guild isolation latest100 truncation minimalkeys nonmutating', () => {
  const s = setup();
  try {
    for (const status of ['reserved', 'sent', 'uncertain', 'unavailable']) {
      const a = s.r.scopedReceipts('g', 'state', { status });
      assert.equal(a.total, 26);
      assert(a.records.every((v) => v.status === status));
      assert.equal(a.truncated, false);
    }
    const a = s.r.scopedReceipts('g', 'unresolved');
    assert.equal(a.total, 78);
    assert(!a.records.some((v) => v.status === 'sent'));
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(Object.keys(a.records[0]), ['status', 'createdAt']);
    const all = s.r.scopedReceipts('g', 'window', { start: 0, end: 103 });
    assert.equal(all.total, 104);
    assert.equal(all.records.length, 100);
    assert.equal(all.truncated, true);
    assert.equal(all.records[0].createdAt, 103);
    assert.equal(all.records.at(-1).createdAt, 4);
    assert.equal(s.r.scopedReceipts('other', 'unresolved').total, 1);
    assert.deepEqual(s.r.scopedReceipts('empty', 'unresolved'), {
      total: 0,
      truncated: false,
      records: [],
    });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM event_log_deliveries').get().n, 105);
    assert(s.r.reserved('private-source-0', 'g'));
  } finally {
    s.db.close();
  }
});
test('scoped receipt inclusive millisecond endpoints strict state/window bounds emptyresults', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.scopedReceipts('g', 'window', { start: 3, end: 3 }).records, [
      { status: 'unavailable', createdAt: 3 },
    ]);
    assert.equal(s.r.scopedReceipts('g', 'window', { start: 3, end: 4 }).total, 2);
    assert.equal(
      s.r.scopedReceipts('g', 'window', { start: 104, end: Number.MAX_SAFE_INTEGER }).total,
      0,
    );
    for (const options of [
      { start: -1, end: 1 },
      { start: 2, end: 1 },
      { start: 1.5, end: 2 },
      { start: '1', end: 2 },
      { start: 0, end: NaN },
      { start: 0, end: Number.MAX_SAFE_INTEGER + 1 },
    ])
      assert.throws(() => s.r.scopedReceipts('g', 'window', options), /logReceiptScopeInvalid/);
    for (const status of ['Sent', 'bad', null, 1])
      assert.throws(() => s.r.scopedReceipts('g', 'state', { status }), /logReceiptScopeInvalid/);
    assert.throws(() => s.r.scopedReceipts('g', 'bad'), /logReceiptScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('3scoped loggingpaths freshManageGuild private3locale exactJSON branding noping denybefore service', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['statereceipts', 'unresolvedreceipts', 'windowreceipts']) {
      const s = setup();
      try {
        s.cfg.setLanguage('g', locale);
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
            getString: () => 'uncertain',
            getInteger: (n) => (n === 'start' ? 3 : 9),
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { guildConfig: s.cfg, eventLogs: s.r };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'logScopedReceipts'));
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          s.r.scopedReceipts(
            'g',
            sub === 'statereceipts'
              ? 'state'
              : sub === 'unresolvedreceipts'
                ? 'unresolved'
                : 'window',
            sub === 'statereceipts' ? { status: 'uncertain' } : { start: 3, end: 9 },
          ),
        );
        allowed = false;
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
