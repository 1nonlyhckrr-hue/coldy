import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { exportWelcome, importWelcome, resetWelcome } from '../src/services/welcomeLibrary.js';
import command from '../src/commands/welcomer/welcome.js';
function setup() {
  const db = openDatabase(':memory:'),
    c = new GuildConfig(new GuildSettings(db));
  c.patch('g', 'welcome', {
    enabled: true,
    goodbyeEnabled: true,
    channelId: '100000000000000001',
    message: 'Hello {user}',
    messageCustom: true,
    title: 'Title',
    color: 100,
    image: 'https://assets.validsite.org/a.png',
  });
  c.patch('g', 'logging', { enabled: true, channelId: '100000000000000002' });
  return { db, c };
}
test('welcome portable import replaces styles pauses both retains channel other sections guild isolation/export exclusions', () => {
  const s = setup();
  try {
    const v = exportWelcome(s.c, 'g');
    assert.equal(v.message, 'Hello {user}');
    for (const k of ['channelId', 'enabled', 'goodbyeEnabled']) assert(!(k in v));
    importWelcome(
      s.c,
      'g',
      JSON.stringify({
        message: 'New {username}',
        messageCustom: true,
        goodbyeMessage: 'Bye',
        goodbyeCustom: true,
      }),
    );
    const w = s.c.get('g').welcome;
    assert.equal(w.enabled, false);
    assert.equal(w.goodbyeEnabled, false);
    assert.equal(w.channelId, '100000000000000001');
    assert.equal(w.title, undefined);
    assert.equal(w.image, undefined);
    assert.equal(w.message, 'New {username}');
    assert.equal(s.c.get('g').logging.enabled, true);
    assert.equal(s.c.get('other').welcome.enabled, false);
    const before = JSON.stringify(s.c.get('g'));
    for (const text of [
      'null',
      '[]',
      '{',
      JSON.stringify({ enabled: true }),
      JSON.stringify({ channelId: '100000000000000004' }),
      JSON.stringify({ image: 'http://site.com/a' }),
      JSON.stringify({ title: '@everyone' }),
      ' '.repeat(4001),
    ]) {
      assert.throws(() => importWelcome(s.c, 'g', text), /welcomeImportInvalid/);
      assert.equal(JSON.stringify(s.c.get('g')), before);
    }
  } finally {
    s.db.close();
  }
});
test('welcome reset truly forgets optional fields keeps logging/language and storage failure leaves original', () => {
  const s = setup();
  try {
    s.c.setLanguage('g', 'hi');
    const before = JSON.stringify(s.c.get('g'));
    const set = s.c.settings.set;
    s.c.settings.set = () => {
      throw Error('storage');
    };
    assert.throws(() => resetWelcome(s.c, 'g'));
    assert.equal(JSON.stringify(s.c.get('g')), before);
    s.c.settings.set = set;
    resetWelcome(s.c, 'g');
    const w = s.c.get('g').welcome;
    for (const k of ['channelId', 'title', 'color', 'image', 'messageCustom'])
      assert.equal(w[k], undefined);
    assert.equal(w.enabled, false);
    assert.equal(w.goodbyeEnabled, false);
    assert.equal(s.c.get('g').language, 'hi');
    assert.equal(s.c.get('g').logging.enabled, true);
  } finally {
    s.db.close();
  }
});
test('welcome library current manager/confirm/private3locale attachment no output channel calls', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.setLanguage('g', locale);
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
            getString: () => JSON.stringify({ message: 'New', messageCustom: true }),
          },
        },
        c = { guildConfig: s.c };
      await command.execute(i, c);
      assert.equal(JSON.parse(reply.files[0].attachment.toString()).message, 'Hello {user}');
      for (const v of ['import', 'reset']) {
        sub = v;
        confirm = false;
        await assert.rejects(() => command.execute(i, c), /welcomeLibraryConfirm/);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('welcomeLibrary'));
      }
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
