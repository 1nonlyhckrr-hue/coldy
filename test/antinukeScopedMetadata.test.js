import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AntinukeAlerts } from '../src/services/antinuke.js';
import command from '../src/commands/antinuke/antinuke.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new AntinukeAlerts(db);
  for (let n = 0; n < 105; n++)
    db.prepare(
      'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
    ).run('g', 'private-actor', 10, 5, ['recorded', 'uncertain', 'unavailable'][n % 3], n);
  db.prepare(
    'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
  ).run('g', 'private-actor', 11, 6, 'alerted', 0);
  db.prepare(
    'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'private-actor', 10, 5, 'uncertain', 0);
  return { db, r };
}
test('incidentexactminimal metadata/null guildisolation safeIDs no actor/auditentry/sourceIDs', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.inspectIncident('g', 1), {
      id: 1,
      action: 10,
      eventCount: 5,
      status: 'recorded',
      createdAt: 0,
    });
    assert.equal(s.r.inspectIncident('other', 1), null);
    assert.equal(s.r.inspectIncident('g', 999), null);
    for (const id of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => s.r.inspectIncident('g', id), /antinukeIncidentScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('incidentwatchedaction exactscope unresolved3states100ordertruncation no alerted no mutation invalidactions failclosed', () => {
  const s = setup();
  try {
    const a = s.r.scopedIncidents('g', { recovery: true });
    assert.equal(a.total, 105);
    assert.equal(a.records.length, 100);
    assert.equal(a.truncated, true);
    assert.equal(a.records[0].id, 105);
    assert.equal(a.records.at(-1).id, 6);
    assert(a.records.every((v) => v.status !== 'alerted'));
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.scopedIncidents('g', { action: 10 }).total, 105);
    assert.equal(s.r.scopedIncidents('g', { action: 11 }).total, 1);
    assert.deepEqual(s.r.scopedIncidents('other', { action: 11 }), {
      total: 0,
      truncated: false,
      records: [],
    });
    for (const action of [0, 999, 10.5, '10', NaN])
      assert.throws(() => s.r.scopedIncidents('g', { action }), /antinukeIncidentScopeInvalid/);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM antinuke_incidents').get().n, 107);
  } finally {
    s.db.close();
  }
});
test('3incidentscopepaths private3locale freshManageGuild exactJSON brandednoping no auditfetch/retry/nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['inspectincident', 'actionincidents', 'exportunresolved']) {
      const s = setup();
      try {
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
          options: { getSubcommand: () => sub, getInteger: (n) => (n === 'id' ? 1 : 10) },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          antinuke: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'antinukeScopedMetadata'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'inspectincident'
            ? s.r.inspectIncident('g', 1)
            : s.r.scopedIncidents(
                'g',
                sub === 'actionincidents' ? { action: 10 } : { recovery: true },
              ),
        );
        allowed = false;
        c.antinuke = new Proxy(
          {},
          {
            get: () => {
              throw Error('no service read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
