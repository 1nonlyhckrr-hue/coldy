import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import command from '../src/commands/general/config.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    c = new GuildConfig(new GuildSettings(db));
  c.setLanguage('g', 'hi');
  c.patch('g', 'welcome', {
    enabled: true,
    goodbyeEnabled: true,
    channelId: id,
    message: 'my {user}',
    messageCustom: true,
    title: 'Title',
    image: 'https://assets.validsite.org/a.png',
  });
  c.patch('g', 'logging', { enabled: true, channelId: id, events: ['memberjoin'] });
  db.prepare('INSERT INTO message_rank_config VALUES(?,?,?)').run('g', 1, '[]');
  return { db, c };
}
test('delivery pause all3 atomic preserves every other field guild/table isolation storageabort', () => {
  const s = setup();
  try {
    const before = s.c.get('g');
    s.c.pauseDelivery('g');
    const after = s.c.get('g');
    assert.deepEqual(after, {
      ...before,
      welcome: { ...before.welcome, enabled: false, goodbyeEnabled: false },
      logging: { ...before.logging, enabled: false },
    });
    assert.equal(s.c.get('other').language, 'en');
    assert.equal(
      s.db.prepare('SELECT enabled FROM message_rank_config WHERE guild_id=?').get('g').enabled,
      1,
    );
    const set = s.c.settings.set;
    s.c.settings.set = () => {
      throw Error('abort');
    };
    assert.throws(() => s.c.pauseDelivery('g'), /abort/);
    assert.deepEqual(s.c.get('g'), after);
    s.c.settings.set = set;
  } finally {
    s.db.close();
  }
});
test('delivery reset truly forgets optionaltemplate/assets/destinations/eventchoices retains language other tables rollback', () => {
  const s = setup();
  try {
    const before = s.c.get('g'),
      set = s.c.settings.set;
    s.c.settings.set = () => {
      throw Error('abort');
    };
    assert.throws(() => s.c.resetDelivery('g'), /abort/);
    assert.deepEqual(s.c.get('g'), before);
    s.c.settings.set = set;
    s.c.resetDelivery('g');
    const next = s.c.get('g');
    assert.equal(next.language, 'hi');
    assert.equal(next.welcome.enabled, false);
    assert.equal(next.welcome.goodbyeEnabled, false);
    for (const k of ['channelId', 'title', 'image', 'messageCustom'])
      assert.equal(next.welcome[k], undefined);
    assert.deepEqual(next.logging, { events: [], enabled: false });
    assert.equal(
      s.db.prepare('SELECT enabled FROM message_rank_config WHERE guild_id=?').get('g').enabled,
      1,
    );
  } finally {
    s.db.close();
  }
});
test('config3paths freshmanager confirmbeforemutation private3locale exact JSON excludes runtime', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['export', 'pause', 'resetdelivery']) {
      const s = setup();
      try {
        let reply,
          allowed = true,
          confirm = true;
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
          options: { getSubcommand: () => sub, getBoolean: () => confirm },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          guildConfig: s.c,
          config: { token: 'never-export' },
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        const before = s.c.get('g');
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub === 'export')
          assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), before);
        allowed = false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
        if (sub !== 'export') {
          allowed = true;
          confirm = false;
          const now = s.c.get('g');
          await assert.rejects(() => command.execute(i, c), /configDeliveryConfirm/);
          assert.deepEqual(s.c.get('g'), now);
        }
      } finally {
        s.db.close();
      }
    }
});
