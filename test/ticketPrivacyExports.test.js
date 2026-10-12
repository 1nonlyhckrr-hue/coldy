import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Tickets } from '../src/services/tickets.js';
import command from '../src/commands/ticket/ticket.js';
const id = '100000000000000001',
  role = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new Tickets(db);
  r.configure('g', '100000000000000003', role);
  for (let n = 0; n < 103; n++)
    db.prepare(
      'INSERT INTO tickets(guild_id,owner_id,support_role_id,status,claimed_by,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run('g', id, role, 'closed', 'staff-private', 'source-private' + n, n);
  db.prepare(
    'INSERT INTO tickets(guild_id,owner_id,support_role_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('g', role, role, 'uncertain', 'other-owner', 0);
  db.prepare(
    'INSERT INTO tickets(guild_id,owner_id,support_role_id,status,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', id, role, 'closed', 'foreign', 0);
  db.prepare('INSERT INTO ticket_transcripts VALUES(?,?,?,?,?)').run(1, 'private-content', 1, 0, 0);
  return { db, r };
}
test('ticket summary storedstates and snapshotcount guildscoped minimal read no effects', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), {
      states: [
        { status: 'closed', count: 103 },
        { status: 'uncertain', count: 1 },
      ],
      storedTranscripts: 1,
    });
    assert.equal(s.r.summary('other').storedTranscripts, 0);
    assert.deepEqual(s.r.summary('empty'), { states: [], storedTranscripts: 0 });
  } finally {
    s.db.close();
  }
});
test('ticket config nullable+retention own100latest metadata exactbytes no staff source content otherowner/guild', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.exportConfig('g'), {
      categoryId: '100000000000000003',
      supportRoleId: role,
      retentionDays: 30,
    });
    assert.deepEqual(s.r.exportConfig('empty'), {
      categoryId: null,
      supportRoleId: null,
      retentionDays: 30,
    });
    const r = s.r.exportOwn('g', id);
    assert.equal(r.total, 103);
    assert(r.truncated);
    assert.equal(r.records.length, 100);
    assert.equal(r.records[0].id, 103);
    for (const v of [
      'staff-private',
      'source-private',
      'private-content',
      'support_role_id',
      'owner_id',
      'foreign',
    ])
      assert(!JSON.stringify(r).includes(v));
    assert.equal(s.r.exportOwn('g', role).total, 1);
    assert.equal(s.r.exportOwn('other', id).total, 1);
    assert.equal(s.db.prepare('SELECT count(*)n FROM ticket_transcripts').get().n, 1);
  } finally {
    s.db.close();
  }
});
test('ticket3privacy paths freshmanager/ownidentity private3locale exactminimalfiles no nativecalls', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'exportconfig', 'exportmine']) {
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
        const c = { tickets: s.r, guildConfig: { get: () => ({ language: locale }) } };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'exportconfig' ? s.r.exportConfig('g') : s.r.exportOwn('g', id),
          );
        valid = false;
        c.tickets = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(
          () => command.execute(i, c),
          sub === 'exportmine' ? /ticketAccessDenied/ : /userPermission/,
        );
      } finally {
        s.db.close();
      }
    }
});
