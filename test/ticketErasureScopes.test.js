import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Tickets } from '../src/services/tickets.js';
import command from '../src/commands/ticket/ticket.js';
const owner = '100000000000000001',
  other = '100000000000000002',
  role = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:'),
    t = new Tickets(db);
  let n = 0;
  const add = (guild, who, state) => {
    const id = t.reserve(guild, who, role, 'i' + ++n);
    t.activate(id, 'c' + n);
    if (state !== 'open') t.transition(id, 'open', state);
    t.saveTranscript(id, { body: 'private transcript', count: 4, truncated: false });
    return id;
  };
  const ids = [
    add('g', owner, 'closed'),
    add('g', owner, 'open'),
    add('g', other, 'uncertain'),
    add('other', owner, 'closed'),
  ];
  t.claim(ids[1], other);
  return { db, t, ids };
}
test('ticket snapshot exact ID/owner/closedscope erasure isolates guild and keeps state/claims/access metadata', () => {
  for (const method of ['id', 'owner', 'closed']) {
    const s = setup();
    try {
      const before = JSON.stringify(s.db.prepare('SELECT * FROM tickets ORDER BY id').all());
      const n =
        method === 'id'
          ? s.t.forgetById('g', s.ids[0])
          : method === 'owner'
            ? s.t.forgetUserTranscripts('g', owner)
            : s.t.forgetClosedTranscripts('g');
      assert.equal(n, method === 'owner' ? 2 : 1);
      assert.equal(
        s.db.prepare('SELECT count(*) n FROM ticket_transcripts').get().n,
        method === 'owner' ? 2 : 3,
      );
      assert.equal(JSON.stringify(s.db.prepare('SELECT * FROM tickets ORDER BY id').all()), before);
      assert(s.db.prepare('SELECT 1 FROM ticket_transcripts WHERE ticket_id=?').get(s.ids[3]));
      assert(s.db.prepare('SELECT 1 FROM ticket_transcripts WHERE ticket_id=?').get(s.ids[2]));
      if (method === 'id') assert.equal(s.t.forgetById('g', s.ids[0]), 0);
      s.t.saveTranscript(s.ids[0], { body: 'snapshot again', count: 1, truncated: false });
      assert(s.t.transcript(s.ids[0]));
    } finally {
      s.db.close();
    }
  }
});
test('ticket stored ID validation/guild scope and database abort no partial owner erasure', () => {
  const s = setup();
  try {
    for (const id of [0, NaN, 1.5, '1', 999, s.ids[3]])
      assert.throws(() => s.t.forgetById('g', id), /ticketStoredIdInvalid/);
    for (const id of ['', 'bad', '1'.repeat(21), null])
      assert.throws(() => s.t.forgetUserTranscripts('g', id), /ticketStoredIdInvalid/);
    s.db.exec(
      `CREATE TRIGGER fail_erase BEFORE DELETE ON ticket_transcripts WHEN OLD.ticket_id=${s.ids[1]} BEGIN SELECT RAISE(ABORT,'stop');END;`,
    );
    assert.throws(() => s.t.forgetUserTranscripts('g', owner));
    assert.equal(s.db.prepare('SELECT count(*) n FROM ticket_transcripts').get().n, 4);
  } finally {
    s.db.close();
  }
});
test('ticket erasure manager/confirmation/private3locale no native fetch/export', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['forgetbyid', 'forgetusertranscripts', 'forgetclosedtranscripts']) {
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
              getInteger: () => s.ids[0],
              getString: () => owner,
            },
          },
          c = { tickets: s.t, guildConfig: { get: () => ({ language: locale }) } };
        await assert.rejects(() => command.execute(i, c), /ticketStoredConfirm/);
        assert.equal(s.db.prepare('SELECT count(*) n FROM ticket_transcripts').get().n, 4);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.files);
        assert(!reply.embeds[0].data.description.includes('ticketScopedForgotten'));
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c));
      } finally {
        s.db.close();
      }
    }
});
