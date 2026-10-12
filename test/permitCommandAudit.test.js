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
  r.set('g', 'fun', 'user', id, true);
  r.set('g', 'departed', 'role', id, true);
  r.setChannel('g', 'departed', id, true);
  r.set('other', 'departed', 'user', id, true);
  return { db, r };
}
test('permitcommandcounts sorted no subjectIDs and exactstoredcommanddeny guildisolation strictname absentallowed', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.commandCounts('g'), [
      { command: 'departed', subjects: 1, channels: 1 },
      { command: 'fun', subjects: 1, channels: 0 },
    ]);
    assert(!JSON.stringify(s.r.commandCounts('g')).includes(id));
    assert.equal(s.r.exportCommand('g', 'departed').channels.length, 1);
    assert.deepEqual(s.r.exportCommand('g', 'empty'), { subjects: [], channels: [] });
    assert.equal(s.r.exportCommand('other', 'departed').subjects.length, 1);
    for (const name of ['/fun', ' fun', 'FUN', ''])
      assert.throws(() => s.r.exportCommand('g', name), /permitCommandInvalid/);
  } finally {
    s.db.close();
  }
});
test('permitobsoleteatomicprune keeps installed protected otherguild exactcounts notnativepermissiongrant', () => {
  const s = setup();
  try {
    s.db
      .prepare('INSERT INTO command_restrictions VALUES(?,?,?,?,?)')
      .run('g', 'help', 'user', id, 1);
    assert.throws(() => s.r.clearObsolete('g', {}));
    assert.equal(s.r.exportRules('g').subjects.length, 3);
    assert.deepEqual(s.r.clearObsolete('g', new Map([['fun', {}]])), {
      subjects: 1,
      channels: 1,
      commands: 1,
    });
    assert.equal(s.r.exportCommand('g', 'fun').subjects.length, 1);
    assert.equal(s.r.exportCommand('g', 'help').subjects.length, 1);
    assert.equal(s.r.exportCommand('other', 'departed').subjects.length, 1);
    assert.deepEqual(s.r.clearObsolete('g', new Map([['fun', {}]])), {
      subjects: 0,
      channels: 0,
      commands: 0,
    });
  } finally {
    s.db.close();
  }
});
test('permit3paths freshmanageguild private3locale JSON confirmbeforeprune no nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['commandcounts', 'exportcommand', 'clearobsolete']) {
      const s = setup();
      try {
        let reply,
          manager = true,
          confirm = true;
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
          options: {
            getSubcommand: () => sub,
            getString: () => 'departed',
            getBoolean: () => confirm,
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          commandRestrictions: s.r,
          commands: new Map([['fun', {}]]),
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        if (sub === 'clearobsolete') {
          confirm = false;
          await assert.rejects(() => command.execute(i, c), /permitClearConfirm/);
          assert.equal(s.r.exportCommand('g', 'departed').subjects.length, 1);
          confirm = true;
        }
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'clearobsolete')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'commandcounts' ? s.r.commandCounts('g') : s.r.exportCommand('g', 'departed'),
          );
        manager = false;
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
