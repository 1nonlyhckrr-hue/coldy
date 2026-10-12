import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AntinukeAlerts } from '../src/services/antinuke.js';
import command from '../src/commands/antinuke/antinuke.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new AntinukeAlerts(db);
  for (let n = 0; n < 102; n++)
    db.prepare(
      'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
    ).run(
      'g',
      'private-actor',
      n % 2 ? 10 : 11,
      5,
      ['recorded', 'alerted', 'uncertain', 'unavailable'][n % 4],
      n,
    );
  db.prepare(
    'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'other-actor', 10, 5, 'recorded', 999);
  return { db, r };
}
test('antinuke retainedstate/action aggregates isolate guilds allstates no actorIDs/nativeclaim', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), [
      { status: 'alerted', count: 26 },
      { status: 'recorded', count: 26 },
      { status: 'unavailable', count: 25 },
      { status: 'uncertain', count: 25 },
    ]);
    assert.deepEqual(s.r.actionCounts('g'), [
      { action: 10, status: 'alerted', count: 26 },
      { action: 10, status: 'unavailable', count: 25 },
      { action: 11, status: 'recorded', count: 26 },
      { action: 11, status: 'uncertain', count: 25 },
    ]);
    assert.deepEqual(s.r.summary('empty'), []);
    assert.equal(s.r.summary('other')[0].count, 1);
    assert(!JSON.stringify(s.r.actionCounts('g')).includes('actor'));
  } finally {
    s.db.close();
  }
});
test('antinuke metadata latest100 wholeminimalrecords order total/truncation source/actorIDs absent no mutation', () => {
  const s = setup();
  try {
    const a = s.r.exportIncidents('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], {
      id: 102,
      action: 10,
      eventCount: 5,
      status: 'alerted',
      createdAt: 101,
    });
    assert.equal(a.records.at(-1).id, 3);
    assert(!JSON.stringify(a).includes('actor'));
    assert.deepEqual(s.r.exportIncidents('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.r.exportIncidents('other').total, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM antinuke_incidents').get().n, 103);
  } finally {
    s.db.close();
  }
});
test('antinuke3paths freshmanageguild private3locale minimalJSON permissiondeniedbeforeread noeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'actioncounts', 'exportincidents']) {
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
        const c = {
          antinuke: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'summary'
            ? s.r.summary('g')
            : sub === 'actioncounts'
              ? s.r.actionCounts('g')
              : s.r.exportIncidents('g'),
        );
        manager = false;
        c.antinuke = new Proxy(
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
