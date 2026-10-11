import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AutoMod } from '../src/services/automod.js';
import command from '../src/commands/automod/automod.js';
const id = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    a = new AutoMod(db);
  a.patch('g', {
    enabled: true,
    action: 'delete',
    words: ['old'],
    rules: { words: true },
    ignoredChannels: [id],
    exemptRoles: [id],
  });
  a.recent.set('g:u', [{ text: 'private', at: 1 }]);
  a.recent.set('other:u', [{ text: 'other', at: 1 }]);
  return { db, a };
}
test('AutoMod strict replacement disabled normalized unique policy defaults/memory isolation invalid no writes', () => {
  const s = setup();
  try {
    s.a.importPolicy(
      'g',
      JSON.stringify({
        enabled: true,
        words: [' BAD '],
        rules: { words: true },
        ignoredChannels: [id],
      }),
    );
    const p = s.a.get('g');
    assert.equal(p.enabled, false);
    assert.equal(p.action, 'warn');
    assert.deepEqual(p.words, ['bad']);
    assert.deepEqual(p.exemptRoles, []);
    assert(!s.a.recent.has('g:u'));
    assert(s.a.recent.has('other:u'));
    const before = JSON.stringify(p);
    for (const value of [
      'null',
      '[]',
      '{',
      JSON.stringify({ unknown: true }),
      JSON.stringify({ words: ['x', 'Ｘ'] }),
      JSON.stringify({ words: ['\n'] }),
      JSON.stringify({ exemptRoles: [id, id] }),
      JSON.stringify({ ignoredChannels: ['invalid'] }),
      JSON.stringify({ timeoutMinutes: 61 }),
      'x'.repeat(4001),
    ]) {
      assert.throws(() => s.a.importPolicy('g', value), /automodImportInvalid/);
      assert.equal(JSON.stringify(s.a.get('g')), before);
    }
    s.a.recent.set('g:u', []);
    s.db.exec(
      "CREATE TRIGGER fail_import BEFORE UPDATE ON automod_settings BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.a.importPolicy('g', '{}'));
    assert.equal(JSON.stringify(s.a.get('g')), before);
    assert(s.a.recent.has('g:u'));
  } finally {
    s.db.close();
  }
});
test('AutoMod clear ignored/exempt exact scope keeps enabled/action/rules/words/history and other guild', () => {
  const s = setup();
  try {
    s.a.patch('other', { ignoredChannels: [id], exemptRoles: [id] });
    for (const kind of ['ignoredChannels', 'exemptRoles']) {
      assert.equal(s.a.clearScope('g', kind), 1);
      assert.equal(s.a.clearScope('g', kind), 0);
      assert.deepEqual(s.a.get('other')[kind], [id]);
    }
    const p = s.a.get('g');
    assert.equal(p.enabled, true);
    assert.equal(p.action, 'delete');
    assert(p.rules.words);
    assert.deepEqual(p.words, ['old']);
    assert(s.a.recent.has('g:u'));
    assert.throws(() => s.a.clearScope('g', 'all'));
  } finally {
    s.db.close();
  }
});
test('AutoMod policy import/clear scopes native manager confirmation private3locale no native target lookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['importpolicy', 'clearignored', 'clearexempt']) {
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
              getString: () => JSON.stringify({ enabled: true, words: ['new'] }),
            },
          },
          c = { automod: s.a, guildConfig: { get: () => ({ language: locale }) } };
        const before = JSON.stringify(s.a.get('g'));
        await assert.rejects(() => command.execute(i, c), /automodResetConfirm/);
        assert.equal(JSON.stringify(s.a.get('g')), before);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('automodPolicyImported'));
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
