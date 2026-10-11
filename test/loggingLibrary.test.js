import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { importLogging } from '../src/services/loggingLibrary.js';
import command from '../src/commands/logging/logging.js';
const ch = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    g = new GuildConfig(new GuildSettings(db));
  g.patch('g', 'logging', { enabled: true, channelId: ch, events: ['rolecreate'] });
  g.patch('g', 'welcome', { enabled: true, message: 'Private' });
  g.patch('other', 'logging', { enabled: true, channelId: ch });
  return { db, g };
}
test('logging policy strict complete import disabled replaces optionals isolated other sections and failures unchanged', () => {
  const s = setup();
  try {
    importLogging(s.g, 'g', JSON.stringify({ enabled: true, events: ['memberjoin'] }));
    const p = s.g.get('g');
    assert.deepEqual(p.logging, { enabled: false, events: ['memberjoin'] });
    assert(p.welcome.enabled);
    assert.equal(p.welcome.message, 'Private');
    assert(s.g.get('other').logging.enabled);
    const before = JSON.stringify(p);
    for (const text of [
      'null',
      '[]',
      '{',
      JSON.stringify({ unknown: true }),
      JSON.stringify({ events: ['rolecreate', 'rolecreate'] }),
      JSON.stringify({ events: ['messages'] }),
      JSON.stringify({ channelId: 'bad' }),
      'x'.repeat(4001),
    ]) {
      assert.throws(() => importLogging(s.g, 'g', text), /logImportInvalid/);
      assert.equal(JSON.stringify(s.g.get('g')), before);
    }
    const set = s.g.settings.set;
    s.g.settings.set = () => {
      throw Error('storage');
    };
    assert.throws(() => importLogging(s.g, 'g', '{}'));
    assert.equal(JSON.stringify(s.g.get('g')), before);
    s.g.settings.set = set;
  } finally {
    s.db.close();
  }
});
test('logging clearchannel keeps event selections and unrelated data no native destination validation', async () => {
  const s = setup();
  try {
    const actor = { id: 'u', guild: { id: 'g' }, permissions: { has: () => true } },
      i = {
        guildId: 'g',
        user: { id: 'u' },
        guild: { id: 'g', members: { fetch: async () => actor } },
        deferReply: async () => {},
        editReply: async () => {},
        options: { getSubcommand: () => 'clearchannel', getBoolean: () => true },
      };
    await command.execute(i, { guildConfig: s.g });
    assert.deepEqual(s.g.get('g').logging, { enabled: false, events: ['rolecreate'] });
    assert(s.g.get('g').welcome.enabled);
    assert(s.g.get('other').logging.enabled);
  } finally {
    s.db.close();
  }
});
test('logging library manager confirmation private3locale exportbytes no native sends/reads', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.g.setLanguage('g', locale);
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
          options: {
            getSubcommand: () => sub,
            getBoolean: () => confirm,
            getString: () =>
              JSON.stringify({ channelId: ch, events: ['channelcreate'], enabled: true }),
          },
        },
        c = { guildConfig: s.g };
      await command.execute(i, c);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), {
        enabled: true,
        channelId: ch,
        events: ['rolecreate'],
      });
      for (const v of ['import', 'clearchannel']) {
        sub = v;
        await assert.rejects(() => command.execute(i, c), /logResetConfirm/);
        confirm = true;
        await command.execute(i, c);
        confirm = false;
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      actor.permissions.has = () => false;
      sub = 'export';
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
