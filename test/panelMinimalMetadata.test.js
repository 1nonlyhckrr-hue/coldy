import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { RolePanels } from '../src/services/rolePanels.js';
import command from '../src/commands/reactionroles/reactionroles.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new RolePanels(db);
  for (let n = 0; n < 102; n++) {
    db.prepare(
      'INSERT INTO role_panels(guild_id,channel_id,role_id,label,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'g',
      n % 2 ? 'c1' : 'c2',
      'private-role',
      'private-label',
      ['pending', 'active', 'disabled', 'uncertain', 'failed'][n % 5],
      'private-source' + n,
      n,
    );
    db.prepare('INSERT INTO role_click_receipts VALUES(?,?,?,?,?,?,?)').run(
      'private-click' + n,
      'g',
      'private-member',
      'private-role',
      ['pending', 'completed', 'failed', 'uncertain'][n % 4],
      n,
      ['unknown', 'add', 'remove'][n % 3],
    );
  }
  db.prepare(
    'INSERT INTO role_panels(guild_id,channel_id,role_id,label,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
  ).run('other', 'c1', 'private', 'private', 'other', 0);
  return { db, r };
}
test('panel100minimalmetadata latestID order totaltruncation exactkeys isolate no role/sourceIDs/labels no writes', () => {
  const s = setup();
  try {
    const a = s.r.exportMetadata('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], { id: 102, channelId: 'c1', status: 'active', createdAt: 101 });
    assert.equal(a.records.at(-1).id, 3);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.exportMetadata('other').total, 1);
    assert.deepEqual(s.r.exportMetadata('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM role_panels').get().n, 103);
  } finally {
    s.db.close();
  }
});
test('panelclick100minimal stateactiontime no memberroleinteractionIDs channelstatecounts allretainedstates no mutation', () => {
  const s = setup();
  try {
    const a = s.r.exportClicks('g');
    assert.equal(a.total, 102);
    assert.equal(a.records.length, 100);
    assert.equal(a.truncated, true);
    assert.deepEqual(a.records[0], { status: 'completed', action: 'remove', createdAt: 101 });
    assert(!JSON.stringify(a).includes('private'));
    assert.deepEqual(s.r.exportClicks('other'), { total: 0, truncated: false, records: [] });
    const counts = s.r.channelCounts('g');
    assert.equal(counts.length, 10);
    assert.equal(
      counts.reduce((n, v) => n + v.count, 0),
      102,
    );
    assert.deepEqual(Object.keys(counts[0]), ['channelId', 'status', 'count']);
    assert.deepEqual(s.r.channelCounts('empty'), []);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM role_click_receipts').get().n, 102);
  } finally {
    s.db.close();
  }
});
test('3panelmetadata paths private3locale freshManageRoles exactJSON brandednoping no role/membertargetfetch/nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportmetadata', 'exportclicks', 'channelcounts']) {
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
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { rolePanels: s.r, localization: { locale: () => locale } };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'panelMinimalMetadata'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'exportmetadata'
            ? s.r.exportMetadata('g')
            : sub === 'exportclicks'
              ? s.r.exportClicks('g')
              : s.r.channelCounts('g'),
        );
        allowed = false;
        c.rolePanels = new Proxy(
          {},
          {
            get: () => {
              throw Error('no service read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
      } finally {
        s.db.close();
      }
    }
});
