import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { createMemberMessageHandler } from '../src/events/memberMessages.js';
import command from '../src/commands/welcomer/welcome.js';
import { makeGuild } from './helpers/guild.js';
function setup() {
  const db = openDatabase(':memory:'),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    s = makeGuild();
  const actor = {
    id: '100000000000000009',
    guild: s.guild,
    user: { username: 'Test' },
    permissions: { has: () => true },
  };
  s.guild.members.fetch = async () => actor;
  return {
    db,
    guildConfig,
    s,
    actor,
    c: { guildConfig, logger: { warn: () => {} }, config: { memberEventsEnabled: true } },
  };
}
test('welcome ping policy defaults compatibly,guild isolated and rejects nonbooleans', () => {
  const x = setup();
  try {
    assert.equal(x.guildConfig.get('g').welcome.mentionMember, true);
    x.guildConfig.patch('g', 'welcome', { mentionMember: false });
    assert.equal(x.guildConfig.get('other').welcome.mentionMember, true);
    for (const v of [1, null, 'false'])
      assert.throws(() => x.guildConfig.patch('g', 'welcome', { mentionMember: v }));
  } finally {
    x.db.close();
  }
});
test('welcome event latest ping policy suppresses member mention and goodbye never allows user pings', async () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', {
      enabled: true,
      goodbyeEnabled: true,
      channelId: '100000000000000001',
      message: 'Hi {user} @everyone',
      mentionMember: true,
    });
    const f = x.s.guild.channels.fetch;
    x.s.guild.channels.fetch = async (...args) => {
      x.guildConfig.patch('g', 'welcome', { mentionMember: false });
      return f(...args);
    };
    await createMemberMessageHandler(x.c, 'welcome')(x.actor);
    assert.deepEqual(x.s.sent[0].allowedMentions, { parse: [], users: [] });
    assert(x.s.sent[0].embeds[0].data.description.includes('@everyone'));
    x.guildConfig.patch('g', 'welcome', { mentionMember: true });
    await createMemberMessageHandler(x.c, 'goodbye')(x.actor);
    assert.deepEqual(x.s.sent[1].allowedMentions.users, []);
  } finally {
    x.db.close();
  }
});
test('mentions and clear destination slash exact manager private3locales preserve templates/styles with no send', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.guildConfig.setLanguage('g', locale);
      x.guildConfig.patch('g', 'welcome', {
        enabled: true,
        goodbyeEnabled: true,
        channelId: '100000000000000001',
        message: 'MY EXACT {user}',
        messageCustom: true,
        title: 'Mine',
        color: 0,
      });
      let sub = 'mentions',
        reply;
      const i = {
        guild: x.s.guild,
        guildId: 'g',
        user: { id: x.actor.id },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
        options: { getSubcommand: () => sub, getBoolean: (n) => (n === 'enabled' ? false : true) },
      };
      await command.execute(i, x.c);
      assert.equal(x.guildConfig.get('g').welcome.mentionMember, false);
      sub = 'clearchannel';
      await command.execute(i, x.c);
      const cfg = x.guildConfig.get('g').welcome;
      assert.equal(cfg.enabled, false);
      assert.equal(cfg.goodbyeEnabled, false);
      assert.equal(cfg.channelId, undefined);
      assert.equal(cfg.message, 'MY EXACT {user}');
      assert.equal(cfg.title, 'Mine');
      assert.equal(cfg.color, 0);
      assert.equal(cfg.mentionMember, false);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('clear destination requires explicit true and current exact manager with no mutation', async () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', { enabled: true, channelId: '100000000000000001' });
    const before = x.guildConfig.get('g');
    const i = {
      guild: x.s.guild,
      guildId: 'g',
      user: { id: x.actor.id },
      deferReply: async () => {},
      editReply: async () => {},
      options: { getSubcommand: () => 'clearchannel', getBoolean: () => false },
    };
    await assert.rejects(() => command.execute(i, x.c), /welcomeClearConfirm/);
    assert.deepEqual(x.guildConfig.get('g'), before);
    x.s.guild.members.fetch = async () => ({ ...x.actor, id: 'wrong' });
    await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    assert.deepEqual(x.guildConfig.get('g'), before);
  } finally {
    x.db.close();
  }
});
test('welcome test respects persisted no-ping policy and preview always stays no-ping', async () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', { channelId: '100000000000000001', mentionMember: false });
    let sub = 'test';
    const i = {
      guild: x.s.guild,
      guildId: 'g',
      user: { id: x.actor.id },
      deferReply: async () => {},
      editReply: async (p) => assert.deepEqual(p.allowedMentions.parse, []),
      options: { getSubcommand: () => sub, getString: () => 'welcome' },
    };
    await command.execute(i, x.c);
    assert.deepEqual(x.s.sent[0].allowedMentions.users, []);
    sub = 'preview';
    await command.execute(i, x.c);
    assert.equal(x.s.sent.length, 1);
  } finally {
    x.db.close();
  }
});
test('mention policy survives actual SQLite reopen and old JSON receives default true', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-welcome-'));
  let db = openDatabase(join(dir, 'db'));
  try {
    let c = new GuildConfig(new GuildSettings(db));
    c.patch('g', 'welcome', { mentionMember: false });
    db.close();
    db = openDatabase(join(dir, 'db'));
    c = new GuildConfig(new GuildSettings(db));
    assert.equal(c.get('g').welcome.mentionMember, false);
    assert.equal(c.get('legacy').welcome.mentionMember, true);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('welcome asset URLs allow public HTTPS literals and reject unsafe/private malformed destinations', async () => {
  const { validateWelcomeAsset } = await import('../src/services/welcomeAssets.js');
  assert.equal(
    validateWelcomeAsset('https://cdn.discordapp.com/a.png?x=1'),
    'https://cdn.discordapp.com/a.png?x=1',
  );
  for (const value of [
    'http://cdn.discordapp.com/a.png',
    'https://user:pass@cdn.discordapp.com/a.png',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://localhost/a',
    'https://host.local/a',
    'https://cdn.discordapp.com:444/a',
    'https://cdn.discordapp.com/a\nb',
    '',
    null,
    'x'.repeat(1001),
  ])
    assert.throws(() => validateWelcomeAsset(value), /welcomeAssetInvalid/);
});
test('welcome image/thumbnail/resetstyle three paths private localized,current manager and no unsolicited native send', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.guildConfig.setLanguage('g', locale);
      x.guildConfig.patch('g', 'welcome', {
        channelId: '100000000000000001',
        message: 'EXACT {user}',
        messageCustom: true,
        enabled: true,
        title: 'Mine',
        color: 0,
      });
      let sub = 'image',
        kind = 'welcome',
        url = 'https://cdn.discordapp.com/image.png',
        confirm = true,
        reply;
      const i = {
        guild: x.s.guild,
        guildId: 'g',
        user: { id: x.actor.id },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
        options: {
          getSubcommand: () => sub,
          getString: (n) => (n === 'kind' ? kind : url),
          getBoolean: () => confirm,
        },
      };
      await command.execute(i, x.c);
      assert.equal(x.guildConfig.get('g').welcome.image, url);
      sub = 'thumbnail';
      kind = 'goodbye';
      await command.execute(i, x.c);
      assert.equal(x.guildConfig.get('g').welcome.goodbyeThumbnail, url);
      assert.equal(x.guildConfig.get('other').welcome.image, undefined);
      sub = 'resetstyle';
      confirm = false;
      await assert.rejects(() => command.execute(i, x.c), /welcomeStyleConfirm/);
      confirm = true;
      await command.execute(i, x.c);
      const cfg = x.guildConfig.get('g').welcome;
      assert.equal(cfg.image, undefined);
      assert.equal(cfg.goodbyeThumbnail, undefined);
      assert.equal(cfg.title, undefined);
      assert.equal(cfg.color, undefined);
      assert.equal(cfg.message, 'EXACT {user}');
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.channelId, '100000000000000001');
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(x.s.sent.length, 0);
      x.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('welcome asset payloads appear on proper preview/event kind and clearing one does not clear others', async () => {
  const x = setup();
  try {
    x.guildConfig.patch('g', 'welcome', {
      enabled: true,
      goodbyeEnabled: true,
      channelId: '100000000000000001',
      image: 'https://cdn.discordapp.com/w.png',
      thumbnail: 'https://cdn.discordapp.com/wt.png',
      goodbyeImage: 'https://cdn.discordapp.com/g.png',
    });
    await createMemberMessageHandler(x.c, 'welcome')(x.actor);
    await createMemberMessageHandler(x.c, 'goodbye')(x.actor);
    assert.equal(x.s.sent[0].embeds[0].data.image.url, 'https://cdn.discordapp.com/w.png');
    assert.equal(x.s.sent[0].embeds[0].data.thumbnail.url, 'https://cdn.discordapp.com/wt.png');
    assert.equal(x.s.sent[1].embeds[0].data.image.url, 'https://cdn.discordapp.com/g.png');
    assert.equal(x.s.sent[1].embeds[0].data.thumbnail, undefined);
    let sub = 'preview',
      reply;
    const i = {
      guild: x.s.guild,
      guildId: 'g',
      user: { id: x.actor.id },
      deferReply: async () => {},
      editReply: async (p) => {
        reply = p;
      },
      options: { getSubcommand: () => sub, getString: (n) => (n === 'kind' ? 'welcome' : null) },
    };
    await command.execute(i, x.c);
    assert.equal(reply.embeds[0].data.image.url, 'https://cdn.discordapp.com/w.png');
    sub = 'image';
    await command.execute(i, x.c);
    assert.equal(x.guildConfig.get('g').welcome.image, undefined);
    assert.equal(x.guildConfig.get('g').welcome.thumbnail, 'https://cdn.discordapp.com/wt.png');
  } finally {
    x.db.close();
  }
});
test('welcome asset schema persists across SQLite reopen and rejects invalid write atomically', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-assets-'));
  let db = openDatabase(join(dir, 'db'));
  try {
    let c = new GuildConfig(new GuildSettings(db));
    c.patch('g', 'welcome', { image: 'https://cdn.discordapp.com/a.png' });
    assert.throws(() => c.patch('g', 'welcome', { image: 'http://localhost/a', enabled: true }));
    assert.equal(c.get('g').welcome.enabled, false);
    db.close();
    db = openDatabase(join(dir, 'db'));
    c = new GuildConfig(new GuildSettings(db));
    assert.equal(c.get('g').welcome.image, 'https://cdn.discordapp.com/a.png');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
