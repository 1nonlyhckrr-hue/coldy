import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Tickets } from '../src/services/tickets.js';
import command from '../src/commands/ticket/ticket.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Tickets(db);
  for (let n = 0; n < 102; n++) {
    const id = Number(
      db
        .prepare(
          'INSERT INTO tickets(guild_id,owner_id,support_role_id,status,claimed_by,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          'g',
          'private-owner-' + n,
          'private-support',
          n % 2 ? 'closed' : 'open',
          n % 2 ? null : 'private-staff',
          'private-source-' + n,
          n,
        ).lastInsertRowid,
    );
    db.prepare('INSERT INTO ticket_transcripts VALUES(?,?,?,?,?)').run(
      id,
      'private transcript',
      10,
      n % 2,
      n,
    );
  }
  db.prepare(
    'INSERT INTO tickets(guild_id,owner_id,support_role_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'private-owner', 'support', 'uncertain', 'other', 0);
  return { db, r };
}
test('ticketrecords minimal100 latestorder total/truncation isolate guilds ownerstaffsourceIDs absent', () => {
  const s = setup();
  try {
    const a = s.r.exportRecords('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { id: 102, channelId: null, status: 'closed', createdAt: 101 });
    assert.equal(a.records.at(-1).id, 3);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.exportRecords('other').total, 1);
    assert.deepEqual(s.r.exportRecords('empty'), { total: 0, truncated: false, records: [] });
  } finally {
    s.db.close();
  }
});
test('ticket snapshotmetadata count/truncated/time only no bodies andclaimaggregate excludes identities no mutation', () => {
  const s = setup();
  try {
    const a = s.r.transcriptMetadata('g');
    assert.equal(a.total, 102);
    assert.equal(a.records.length, 100);
    assert.equal(a.truncated, true);
    assert.deepEqual(a.records[0], {
      ticketId: 102,
      messageCount: 10,
      truncated: 1,
      createdAt: 101,
    });
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(s.r.transcriptMetadata('other'), { total: 0, truncated: false, records: [] });
    assert.deepEqual(s.r.claimSummary('g'), [
      { status: 'closed', claimed: 0, count: 51 },
      { status: 'open', claimed: 1, count: 51 },
    ]);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM ticket_transcripts').get().n, 102);
  } finally {
    s.db.close();
  }
});
test('ticket3paths freshmanageguild private3locale JSON no nativeeffects deniedbeforeread', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportrecords', 'transcriptmetadata', 'claimsummary']) {
      const s = setup();
      try {
        let reply,
          manager = true;
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
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { tickets: s.r, guildConfig: { get: () => ({ language: locale }) } };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'exportrecords'
            ? s.r.exportRecords('g')
            : sub === 'transcriptmetadata'
              ? s.r.transcriptMetadata('g')
              : s.r.claimSummary('g'),
        );
        manager = false;
        c.tickets = new Proxy(
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
