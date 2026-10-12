import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { GuildTags } from '../src/services/guildTags.js';
import command from '../src/commands/vanityroles/guildtag.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    r = new GuildTags(db);
  for (let n = 0; n < 102; n++)
    db.prepare('INSERT INTO guild_tag_grants VALUES(?,?,?,?)').run(
      'g',
      String(100000000000000000n + BigInt(n)),
      n % 2 ? 'r2' : 'r1',
      ['pending', 'granted', 'uncertain'][n % 3],
    );
  db.prepare('INSERT INTO guild_tag_grants VALUES(?,?,?,?)').run(
    'other',
    '100000000000000000',
    'other-role',
    'uncertain',
  );
  return { db, r };
}
test('tag100metadata firstIDs sorted minimalkeys totaltruncation guildisolation no mutation', () => {
  const s = setup();
  try {
    const a = s.r.exportGrants('g');
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.deepEqual(a.records[0], {
      userId: '100000000000000000',
      roleId: 'r1',
      status: 'pending',
    });
    assert.equal(a.records.at(-1).userId, '100000000000000099');
    assert.deepEqual(s.r.exportGrants('empty'), { total: 0, truncated: false, records: [] });
    assert.equal(s.r.exportGrants('other').total, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*)n FROM guild_tag_grants').get().n, 103);
  } finally {
    s.db.close();
  }
});
test('tagrolecounts includespendinguncertain exactstoreduser lookup no identityclaim invalidIDs failclosed', () => {
  const s = setup();
  try {
    const a = s.r.roleCounts('g');
    assert.equal(a.length, 6);
    assert(a.every((v) => v.count === 17));
    assert.deepEqual(Object.keys(a[0]), ['roleId', 'status', 'count']);
    assert.deepEqual(s.r.roleCounts('empty'), []);
    assert.deepEqual(s.r.inspectUser('g', '100000000000000000'), {
      roleId: 'r1',
      status: 'pending',
    });
    assert.deepEqual(s.r.inspectUser('other', '100000000000000000'), {
      roleId: 'other-role',
      status: 'uncertain',
    });
    assert.equal(s.r.inspectUser('g', '999999999999999999'), null);
    for (const id of [null, 12, 'abc', '1'.repeat(16), '1'.repeat(21), '100000000000000000\n'])
      assert.throws(() => s.r.inspectUser('g', id), /tagUserIdInvalid/);
  } finally {
    s.db.close();
  }
});
test('tag3metadata paths private3locale freshManageRoles before read no targetfetch orroleeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportgrants', 'rolecounts', 'inspectuser']) {
      const s = setup();
      try {
        let reply,
          allowed = true;
        const i = {
          guildId: 'g',
          user: { id: 'actor' },
          guild: {
            id: 'g',
            members: {
              fetch: async (p) => {
                assert.deepEqual(p, { user: 'actor', force: true });
                return { id: 'actor', guild: { id: 'g' }, permissions: { has: () => allowed } };
              },
            },
          },
          options: { getSubcommand: () => sub, getString: () => '100000000000000000' },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          guildTags: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'tagMetadataExported'));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'exportgrants'
            ? s.r.exportGrants('g')
            : sub === 'rolecounts'
              ? s.r.roleCounts('g')
              : s.r.inspectUser('g', '100000000000000000'),
        );
        allowed = false;
        c.guildTags = new Proxy(
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
