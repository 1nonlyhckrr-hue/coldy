import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { CommandRestrictions } from '../src/services/permit.js';
import command from '../src/commands/permit/permit.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new CommandRestrictions(db);
  r.set('g', 'ping', 'user', id, true);
  r.set('g', 'oldcmd', 'role', id, true);
  r.setChannel('g', 'oldcmd', id, true);
  r.setChannel('g', 'about', '100000000000000002', true);
  r.set('other', 'oldcmd', 'user', id, true);
  return { db, r };
}
test('permit summary exact rule kinddistinctcommands and exactID JSON no mutations/guildleaks', () => {
  const s = setup();
  try {
    const before = s.r.exportRules('g');
    assert.deepEqual(s.r.summary('g'), {
      subjects: 2,
      users: 1,
      roles: 1,
      channels: 2,
      commands: 3,
    });
    const m = s.r.searchStored('g', id);
    assert.equal(m.subjects.length, 2);
    assert.equal(m.channels.length, 1);
    assert.deepEqual(s.r.searchStored('g', '100000000000000999'), { subjects: [], channels: [] });
    for (const v of ['bad', null, 1])
      assert.throws(() => s.r.searchStored('g', v), /permitSubjectInvalid/);
    assert.deepEqual(s.r.exportRules('g'), before);
  } finally {
    s.db.close();
  }
});
test('obsolete only current installed registry absent names both rule kinds not resourceexistence', () => {
  const s = setup();
  try {
    const a = s.r.obsolete(
      'g',
      new Map([
        ['ping', {}],
        ['about', {}],
      ]),
    );
    assert.equal(a.subjects.length, 1);
    assert.equal(a.subjects[0].command_name, 'oldcmd');
    assert.equal(a.channels.length, 1);
    assert.deepEqual(
      s.r.obsolete(
        'g',
        new Map([
          ['ping', {}],
          ['about', {}],
          ['oldcmd', {}],
        ]),
      ),
      { subjects: [], channels: [] },
    );
    assert.throws(() => s.r.obsolete('g', new Set()));
    assert.equal(s.r.exportRules('g').subjects.length, 2);
  } finally {
    s.db.close();
  }
});
test('permit diagnostics freshmanager private3locale exactattachments cannotreadwhenauthfails', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'searchid', 'obsolete']) {
      const s = setup();
      try {
        let reply,
          allowed = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: id, force: true });
                return { id, guild: { id: 'g' }, permissions: { has: () => allowed } };
              },
            },
          },
          options: { getSubcommand: () => sub, getString: () => id },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const commands = new Map([
            ['ping', {}],
            ['about', {}],
          ]),
          c = {
            commands,
            commandRestrictions: s.r,
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary') {
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'searchid' ? s.r.searchStored('g', id) : s.r.obsolete('g', commands),
          );
        }
        allowed = false;
        c.commandRestrictions = new Proxy(
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
