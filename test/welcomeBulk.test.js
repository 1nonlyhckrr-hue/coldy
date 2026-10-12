import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import command from '../src/commands/welcomer/welcome.js';
function setup() {
  const db = openDatabase(':memory:'),
    cfg = new GuildConfig(new GuildSettings(db));
  cfg.patch('g', 'welcome', {
    enabled: true,
    goodbyeEnabled: true,
    channelId: '100000000000000001',
    message: 'literal {user}',
    messageCustom: true,
    goodbyeMessage: 'literal goodbye',
    goodbyeCustom: true,
    title: 'Hi',
    goodbyeTitle: 'Bye',
    color: 123,
    image: 'https://assets.validsite.org/a.png',
    thumbnail: 'https://assets.validsite.org/b.png',
    goodbyeImage: 'https://assets.validsite.org/c.png',
    goodbyeThumbnail: 'https://assets.validsite.org/d.png',
  });
  cfg.patch('g', 'logging', { enabled: true });
  return { db, cfg };
}
function fixture(cfg, sub) {
  let reply,
    confirm = true,
    kind = 'welcome',
    manager = true;
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
    options: { getSubcommand: () => sub, getString: () => kind, getBoolean: () => confirm },
    deferReply: async (p) => assert.equal(p.flags, 64),
    editReply: async (p) => (reply = p),
  };
  return {
    i,
    c: { guildConfig: cfg },
    get reply() {
      return reply;
    },
    confirm: (v) => (confirm = v),
    kind: (v) => (kind = v),
    manager: (v) => (manager = v),
  };
}
test('welcome pauseboth confirmed only deliveryswitches templates/styles/othersectionspreserved nosend', async () => {
  const s = setup();
  try {
    const x = fixture(s.cfg, 'pauseboth'),
      before = s.cfg.get('g');
    x.confirm(false);
    await assert.rejects(() => command.execute(x.i, x.c), /welcomeLibraryConfirm/);
    assert.deepEqual(s.cfg.get('g'), before);
    x.confirm(true);
    await command.execute(x.i, x.c);
    assert.deepEqual(s.cfg.get('g'), {
      ...before,
      welcome: { ...before.welcome, enabled: false, goodbyeEnabled: false },
    });
  } finally {
    s.db.close();
  }
});
test('welcome clearassets exactchosenpair confirm invalidkind failclosed restconfigkept', async () => {
  for (const kind of ['welcome', 'goodbye']) {
    const s = setup();
    try {
      const x = fixture(s.cfg, 'clearassets'),
        before = s.cfg.get('g');
      x.kind('bad');
      await assert.rejects(() => command.execute(x.i, x.c), /unknownCommand/);
      assert.deepEqual(s.cfg.get('g'), before);
      x.kind(kind);
      await command.execute(x.i, x.c);
      const expected = { ...before, welcome: { ...before.welcome } };
      for (const key of kind === 'welcome'
        ? ['image', 'thumbnail']
        : ['goodbyeImage', 'goodbyeThumbnail'])
        delete expected.welcome[key];
      assert.deepEqual(s.cfg.get('g'), expected);
    } finally {
      s.db.close();
    }
  }
});
test('welcome3paths private3locale fullconfigJSON exacttemplatebytes freshmanageguild permissionblocked', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['pauseboth', 'clearassets', 'exportconfig']) {
      const s = setup();
      try {
        s.cfg.setLanguage('g', locale);
        const x = fixture(s.cfg, sub);
        await command.execute(x.i, x.c);
        assert.deepEqual(x.reply.allowedMentions.parse, []);
        assert.equal(x.reply.embeds.length, 1);
        if (sub === 'exportconfig')
          assert.deepEqual(
            JSON.parse(x.reply.files[0].attachment.toString()),
            s.cfg.get('g').welcome,
          );
        x.manager(false);
        await assert.rejects(() => command.execute(x.i, x.c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
