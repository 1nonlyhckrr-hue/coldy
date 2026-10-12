import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { GuildTags } from '../src/services/guildTags.js';
import command from '../src/commands/vanityroles/guildtag.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  role = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new GuildTags(db);
  r.setup('g', role);
  for (const [u, state] of [
    [id, 'granted'],
    ['100000000000000003', 'pending'],
    ['100000000000000004', 'uncertain'],
  ])
    db.prepare('INSERT INTO guild_tag_grants VALUES(?,?,?,?)').run('g', u, role, state);
  db.prepare('INSERT INTO guild_tag_grants VALUES(?,?,?,?)').run('other', id, role, 'granted');
  return { db, r };
}
test('tag summary allstoredstates guildisolation no mutation no IDs countonly', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), { pending: 1, granted: 1, uncertain: 1 });
    assert.deepEqual(s.r.summary('empty'), { pending: 0, granted: 0, uncertain: 0 });
    assert.deepEqual(s.r.summary('other'), { pending: 0, granted: 1, uncertain: 0 });
    assert.equal(s.r.grants('g').length, 3);
  } finally {
    s.db.close();
  }
});
test('tag exports exact minimal own grant/config nullabsent nootherowners/sources or status inference', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.exportConfig('g'), { roleId: role });
    assert.deepEqual(s.r.exportConfig('empty'), { roleId: null });
    assert.deepEqual(s.r.exportMine('g', id), { roleId: role, status: 'granted' });
    assert.equal(s.r.exportMine('g', '100000000000000999'), null);
    assert.deepEqual(s.r.exportMine('g', '100000000000000004'), {
      roleId: role,
      status: 'uncertain',
    });
    s.r.reset('g');
    assert.equal(s.r.exportConfig('g').roleId, null);
    assert.equal(s.r.exportMine('g', id).status, 'granted');
  } finally {
    s.db.close();
  }
});
test('tag3paths manager/own fresh exactidentity private3locale attachmentbytes deniesbeforedataread', async () => {
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
        const c = {
          guildTags: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'exportconfig' ? s.r.exportConfig('g') : s.r.exportMine('g', id),
          );
        valid = false;
        c.guildTags = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(
          () => command.execute(i, c),
          sub === 'exportmine' ? /customMemberMissing/ : /roleActorPermission/,
        );
      } finally {
        s.db.close();
      }
    }
});
