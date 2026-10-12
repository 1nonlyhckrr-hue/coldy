import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { RolePanels } from '../src/services/rolePanels.js';
import command from '../src/commands/reactionroles/reactionroles.js';
import { translate } from '../src/services/localization.js';
const ch = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new RolePanels(db);
  for (let n = 0; n < 105; n++)
    db.prepare(
      'INSERT INTO role_panels(guild_id,channel_id,role_id,label,status,interaction_id,created_at)VALUES(?,?,?,?,?,?,?)',
    ).run(
      'g',
      ch,
      'private-role',
      'private-label',
      ['pending', 'active', 'disabled', 'uncertain', 'failed'][n % 5],
      'private-source' + n,
      n,
    );
  db.prepare(
    'INSERT INTO role_panels(guild_id,channel_id,role_id,label,status,interaction_id,created_at)VALUES(?,?,?,?,?,?,?)',
  ).run('other', ch, 'private', 'private', 'uncertain', 'other-source', 0);
  return { db, r };
}
test('panel exactID minimalmetadata null isolate bounds no rolelabels/source/member/native effects', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.scopedMetadata('g', 'id', 1), {
      id: 1,
      channelId: ch,
      status: 'pending',
      createdAt: 0,
    });
    assert.equal(s.r.scopedMetadata('g', 'id', 106), null);
    assert.equal(s.r.scopedMetadata('other', 'id', 1), null);
    assert(!JSON.stringify(s.r.scopedMetadata('g', 'id', 1)).includes('private'));
    for (const v of [0, -1, NaN, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => s.r.scopedMetadata('g', 'id', v), /rolePanelScopeInvalid/);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM role_panels').get().n, 106);
  } finally {
    s.db.close();
  }
});
test('panel channelmetadata/unresolved latest100 order totaltruncation minimalkeys states strictscope nonmutating', () => {
  const s = setup();
  try {
    const a = s.r.scopedMetadata('g', 'channel', ch);
    assert.equal(a.total, 105);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.equal(a.records[0].id, 105);
    assert.equal(a.records.at(-1).id, 6);
    assert.deepEqual(Object.keys(a.records[0]), ['id', 'channelId', 'status', 'createdAt']);
    const u = s.r.scopedMetadata('g', 'unresolved');
    assert.equal(u.total, 42);
    assert(u.records.every((v) => ['pending', 'uncertain'].includes(v.status)));
    assert.equal(s.r.scopedMetadata('other', 'channel', ch).total, 1);
    assert.deepEqual(s.r.scopedMetadata('empty', 'unresolved'), {
      total: 0,
      truncated: false,
      records: [],
    });
    assert.equal(s.r.scopedMetadata('g', 'channel', '100000000000000002').total, 0);
    for (const v of [null, 1, 'x', '1'.repeat(16), '1'.repeat(21)])
      assert.throws(() => s.r.scopedMetadata('g', 'channel', v), /rolePanelScopeInvalid/);
    assert.throws(() => s.r.scopedMetadata('g', 'bad'), /rolePanelScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('3panelscopedpaths freshManageRoles private3locale exactJSON branding noping no nativetargetlookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['inspectmetadata', 'channelmetadata', 'exportunresolved']) {
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
          options: { getSubcommand: () => sub, getInteger: () => 1, getString: () => ch },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          rolePanels: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'panelScopedMetadata'));
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          s.r.scopedMetadata(
            'g',
            sub === 'inspectmetadata' ? 'id' : sub === 'channelmetadata' ? 'channel' : 'unresolved',
            sub === 'inspectmetadata' ? 1 : ch,
          ),
        );
        allowed = false;
        c.rolePanels = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
      } finally {
        s.db.close();
      }
    }
});
