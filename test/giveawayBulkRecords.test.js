import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Giveaways } from '../src/services/giveaways.js';
import command from '../src/commands/giveaway/giveaway.js';
const ch = '100000000000000001',
  user = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    g = new Giveaways(db);
  let n = 0;
  const add = (guild, state) => {
    const id = g.reserve({
      guildId: guild,
      channelId: ch,
      prize: 'Book',
      winnerCount: 1,
      durationMs: 60000,
      interactionId: 'i' + ++n,
    });
    g.activate(id, 'm' + n);
    g.enter(id, guild, user);
    db.prepare('UPDATE giveaways SET status=? WHERE id=?').run(state, id);
    return id;
  };
  return { db, g, add };
}
test('giveaway bulkcancel activeonly/finishedentryerase scopes preserve nativebindings and otherstates/guilds', () => {
  const s = setup();
  try {
    const rows = ['active', 'pending', 'ending', 'uncertain', 'ended', 'cancelled'].map((state) =>
        s.add('g', state),
      ),
      foreign = s.add('other', 'active');
    assert.equal(s.g.cancelAllActive('g'), 1);
    assert.equal(s.g.cancelAllActive('g'), 0);
    assert.equal(s.g.get(rows[0], 'g').status, 'cancelled');
    for (const [n, state] of ['pending', 'ending', 'uncertain', 'ended', 'cancelled'].entries())
      assert.equal(s.g.get(rows[n + 1], 'g').status, state);
    assert.equal(s.g.get(foreign, 'other').status, 'active');
    assert.equal(s.g.forgetFinishedEntries('g'), 3);
    assert.equal(s.g.forgetFinishedEntries('g'), 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM giveaway_entries').get().n, 4);
    assert.equal(s.g.get(rows[0], 'g').message_id, 'm1');
  } finally {
    s.db.close();
  }
});
test('giveaway export latest100 bindings without entrants/winner/sourceIDs and bulkdelete abort rollback', () => {
  const s = setup();
  try {
    for (let n = 0; n < 103; n++) s.add('g', 'cancelled');
    s.add('other', 'cancelled');
    const report = s.g.exportRecords('g');
    assert.equal(report.total, 103);
    assert.equal(report.truncated, true);
    assert.equal(report.records.length, 100);
    assert.equal(report.records[0].id, 103);
    assert.equal(report.records.at(-1).id, 4);
    for (const needle of [user, 'interaction_id', 'created_at', 'winners_json'])
      assert(!JSON.stringify(report).includes(needle));
    s.db.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON giveaway_entries WHEN OLD.giveaway_id=2 BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.g.forgetFinishedEntries('g'));
    assert.equal(s.db.prepare('SELECT count(*) n FROM giveaway_entries').get().n, 104);
  } finally {
    s.db.close();
  }
});
test('giveaway bulk/export actor gate before all writes/reads,confirm/private3locale exactattachment no nativecalls', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      const id = s.add('g', 'active');
      let sub = 'export',
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
          options: { getSubcommand: () => sub, getBoolean: () => confirm },
        },
        c = { giveaways: s.g, guildConfig: { get: () => ({ language: locale }) } };
      await command.execute(i, c);
      assert.equal(JSON.parse(reply.files[0].attachment.toString()).records[0].id, id);
      for (const v of ['cancelall', 'forgetfinishedentries']) {
        sub = v;
        confirm = true;
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
        assert.equal(s.g.get(id, 'g').status, 'active');
        actor.permissions.has = () => true;
        confirm = false;
        await assert.rejects(() => command.execute(i, c), /giveawayStoredConfirm/);
      }
      sub = 'cancelall';
      confirm = true;
      await command.execute(i, c);
      sub = 'forgetfinishedentries';
      await command.execute(i, c);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(s.db.prepare('SELECT count(*) n FROM giveaway_entries').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
