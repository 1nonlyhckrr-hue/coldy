import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { Autoresponders, matchesTrigger } from '../src/services/autoresponder.js';
import { createAutoresponderHandler } from '../src/events/autoresponderMessages.js';
import command from '../src/commands/autoresponder/autoresponder.js';
test('literal Unicode matching normalizes case and spaces without regex injection', () => {
  assert(matchesTrigger('  HELLO  WORLD ', 'hello world', 'exact'));
  assert(!matchesTrigger('hello world today', 'hello world', 'exact'));
  assert(matchesTrigger('नमस्ते भाई!', 'भाई', 'keyword'));
  assert(!matchesTrigger('scat', 'cat', 'keyword'));
  assert(matchesTrigger('a .* b', '.*', 'keyword'));
  assert(!matchesTrigger('a anything b', '.*', 'keyword'));
  assert(!matchesTrigger('concatenate', 'cat', 'keyword'));
});
test('responder CRUD validates, isolates guilds and enforces unique normalized triggers', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db);
    r.create('g', { trigger: ' Hello ', response: 'Hi' });
    assert.throws(() => r.create('g', { trigger: 'hello', response: 'again' }), /responderExists/);
    assert.equal(r.list('other').length, 0);
    r.edit('g', 'HELLO', 'Changed');
    assert.equal(r.find('g', 'hello').response, 'Changed');
    assert.throws(() => r.edit('other', 'hello', 'leak'), /responderNotFound/);
    assert.throws(() => r.create('g', { trigger: 'x', response: 'x', cooldownSeconds: 0 }));
    assert.throws(() => r.create('g', { trigger: 'x', response: 'x'.repeat(1801) }));
    r.delete('g', 'hello');
    assert.throws(() => r.delete('g', 'hello'), /responderNotFound/);
  } finally {
    db.close();
  }
});
test('50 trigger limit does not create partial extra rows', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db);
    for (let n = 0; n < 50; n++) r.create('g', { trigger: 't' + n, response: 'ok' });
    assert.throws(() => r.create('g', { trigger: 'extra', response: 'no' }), /responderLimit/);
    assert.equal(r.list('g').length, 50);
  } finally {
    db.close();
  }
});
test('claims prefer exact matches, persist cooldown and block replay after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luna-responder-'));
  const path = join(dir, 'db.sqlite');
  let db = openDatabase(path);
  let now = 100000;
  try {
    let r = new Autoresponders(db, () => now);
    r.create('g', { trigger: 'hello', response: 'keyword', mode: 'keyword', cooldownSeconds: 10 });
    r.create('g', {
      trigger: 'hello world',
      response: 'exact',
      mode: 'exact',
      cooldownSeconds: 10,
    });
    assert.equal(r.claim('g', 'm1', 'hello world').response, 'exact');
    assert.equal(r.claim('g', 'm1', 'hello world'), null);
    db.close();
    db = openDatabase(path);
    r = new Autoresponders(db, () => now);
    r.recover();
    assert.equal(
      db.prepare('SELECT status FROM autoresponder_deliveries WHERE message_id=?').get('m1').status,
      'uncertain',
    );
    assert.equal(r.claim('g', 'm1', 'hello world'), null);
    assert.equal(r.claim('g', 'm2', 'hello world').response, 'keyword');
    assert.equal(r.claim('g', 'm3', 'hello world'), null);
    now += 11000;
    assert(r.claim('g', 'm4', 'hello world'));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
function setup() {
  const db = openDatabase(':memory:'),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    sent = [];
  const c = {
    db,
    guildConfig,
    autoresponders: new Autoresponders(db),
    config: { messageEventsEnabled: true },
    logger: { warn: () => {} },
  };
  const guild = {
    id: 'g',
    members: { fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }) },
    channels: { fetch: async () => m.channel },
  };
  const m = {
    id: 'm',
    client: { user: { id: 'b' } },
    content: 'hello',
    createdTimestamp: Date.now(),
    guild,
    author: { id: 'u', bot: false },
    channel: {
      id: 'channel',
      guildId: 'g',
      isTextBased: () => true,
      isThread: () => false,
      permissionsFor: () => ({ has: () => true }),
      send: async (p) => {
        sent.push(p);
        return { id: 'native-message' };
      },
    },
  };
  c.autoresponders.create('g', { trigger: 'hello', response: '@everyone hi' });
  return { db, c, m, sent };
}
test('message handler ignores bots, webhooks, stale events and denied channels', async () => {
  const x = setup();
  try {
    const handler = createAutoresponderHandler(x.c);
    for (const change of [
      { author: { bot: true } },
      { webhookId: 'w' },
      { system: true },
      { createdTimestamp: 0 },
      { content: '' },
      { guild: null },
      { channel: { permissionsFor: () => null } },
    ])
      await handler({ ...x.m, ...change });
    assert.equal(x.sent.length, 0);
    assert.equal(x.db.prepare('SELECT count(*) AS n FROM autoresponder_deliveries').get().n, 0);
  } finally {
    x.db.close();
  }
});
test('responses use locale embeds, suppress mentions and deliver once', async () => {
  const x = setup();
  try {
    x.c.guildConfig.setLanguage('g', 'hi');
    const handler = createAutoresponderHandler(x.c);
    await handler(x.m);
    await handler(x.m);
    assert.equal(x.sent.length, 1);
    assert.deepEqual(x.sent[0].allowedMentions.parse, []);
    assert.equal(x.sent[0].allowedMentions.repliedUser, false);
    assert.match(x.sent[0].embeds[0].data.footer.text, /सर्वर/);
    assert.equal(x.db.prepare('SELECT status FROM autoresponder_deliveries').get().status, 'sent');
  } finally {
    x.db.close();
  }
});
test('uncertain sends are recorded and not blindly retried', async () => {
  const x = setup();
  try {
    let attempts = 0;
    x.m.channel.send = async () => {
      attempts++;
      throw new Error('network');
    };
    const handler = createAutoresponderHandler(x.c);
    await handler(x.m);
    await handler(x.m);
    assert.equal(attempts, 1);
    assert.equal(
      x.db.prepare('SELECT status FROM autoresponder_deliveries').get().status,
      'uncertain',
    );
  } finally {
    x.db.close();
  }
});
test('four management paths execute and runtime guard blocks creating inactive triggers', async () => {
  const x = setup();
  try {
    let sub = 'create',
      trigger = 'new';
    const replies = [];
    const i = {
      guildId: 'g',
      user: { id: 'u' },
      guild: {
        id: 'g',
        members: {
          fetch: async () => ({ id: 'u', guild: { id: 'g' }, permissions: { has: () => true } }),
        },
      },
      options: {
        getSubcommand: () => sub,
        getString: (name) => (name === 'trigger' ? trigger : name === 'response' ? 'Hi' : null),
        getInteger: () => null,
      },
      reply: async (p) => replies.push(p),
    };
    x.c.config.messageEventsEnabled = false;
    await assert.rejects(() => command.execute(i, x.c), /responderRuntimeDisabled/);
    x.c.config.messageEventsEnabled = true;
    for (const s of ['create', 'edit', 'config', 'delete']) {
      sub = s;
      await command.execute(i, x.c);
    }
    assert.equal(replies.length, 4);
    assert.equal(x.c.autoresponders.find('g', 'new'), undefined);
  } finally {
    x.db.close();
  }
});

test('autoresponder all management paths reject current permission or identity mismatches', async () => {
  for (const sub of ['create', 'edit', 'delete', 'config', 'preview', 'toggle'])
    for (const kind of ['permission', 'id', 'guild']) {
      const x = setup();
      const actor = {
        id: 'u',
        guild: { id: 'g' },
        permissions: { has: () => kind !== 'permission' },
      };
      if (kind === 'id') actor.id = 'other';
      if (kind === 'guild') actor.guild.id = 'other';
      let replies = 0;
      const i = {
        guildId: 'g',
        user: { id: 'u' },
        guild: {
          id: 'g',
          members: {
            fetch: async (opts) => {
              assert.equal(opts.force, true);
              assert.equal(opts.user, 'u');
              return actor;
            },
          },
        },
        options: { getSubcommand: () => sub },
        reply: async () => replies++,
      };
      try {
        await assert.rejects(() => command.execute(i, x.c), /userPermission/);
        assert.equal(replies, 0);
        assert.equal(x.c.autoresponders.list('g').length, 1);
        assert.equal(x.c.autoresponders.find('g', 'hello').response, '@everyone hi');
      } finally {
        x.db.close();
      }
    }
});
test('autoresponder preview is verbatim private localized and leaves cooldown/deliveries unchanged', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    x.c.guildConfig.setLanguage('g', locale);
    const i = {
      guildId: 'g',
      user: { id: 'u' },
      guild: {
        id: 'g',
        members: {
          fetch: async () => ({ id: 'u', guild: { id: 'g' }, permissions: { has: () => true } }),
        },
      },
      options: { getSubcommand: () => 'preview', getString: () => ' HELLO ' },
      reply: async (p) => replies.push(p),
    };
    try {
      const before = x.c.autoresponders.find('g', 'hello');
      await command.execute(i, x.c);
      assert.equal(replies[0].flags, 64);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(replies[0].embeds[0].data.description, '@everyone hi');
      assert.deepEqual(x.c.autoresponders.find('g', 'hello'), before);
      assert.equal(x.db.prepare('SELECT count(*) n FROM autoresponder_deliveries').get().n, 0);
      assert.equal(x.sent.length, 0);
      i.guildId = 'other';
      i.guild.id = 'other';
      i.guild.members.fetch = async () => ({
        id: 'u',
        guild: { id: 'other' },
        permissions: { has: () => true },
      });
      await assert.rejects(() => command.execute(i, x.c), /responderNotFound/);
    } finally {
      x.db.close();
    }
  }
});
test('autoresponder config rejects invalid page values without output', async () => {
  const x = setup();
  let page = 0,
    replies = 0;
  const i = {
    guildId: 'g',
    user: { id: 'u' },
    guild: {
      id: 'g',
      members: {
        fetch: async () => ({ id: 'u', guild: { id: 'g' }, permissions: { has: () => true } }),
      },
    },
    options: { getSubcommand: () => 'config', getInteger: () => page },
    reply: async () => replies++,
  };
  try {
    for (const v of [0, -1, 1.1, 2]) {
      page = v;
      await assert.rejects(() => command.execute(i, x.c), /responderPageInvalid/);
    }
    assert.equal(replies, 0);
  } finally {
    x.db.close();
  }
});

test('autoresponder requires current exact bot/channel identity and runtime before reserving', async () => {
  for (const kind of [
    'botId',
    'botGuild',
    'channelId',
    'channelGuild',
    'text',
    'permission',
    'runtime',
  ]) {
    const x = setup();
    let fetches = 0;
    const bot = { id: 'b', guild: { id: 'g' } },
      channel = { ...x.m.channel };
    if (kind === 'botId') bot.id = 'other';
    if (kind === 'botGuild') bot.guild.id = 'other';
    if (kind === 'channelId') channel.id = 'other';
    if (kind === 'channelGuild') channel.guildId = 'other';
    if (kind === 'text') channel.isTextBased = () => false;
    if (kind === 'permission') channel.permissionsFor = () => null;
    x.m.guild.members.fetchMe = async (o) => {
      assert.equal(o.force, true);
      return bot;
    };
    x.m.guild.channels.fetch = async (id, o) => {
      fetches++;
      assert.equal(id, 'channel');
      assert.equal(o.force, true);
      if (kind === 'runtime') x.c.config.messageEventsEnabled = false;
      return channel;
    };
    try {
      await createAutoresponderHandler(x.c)(x.m);
      assert.equal(x.sent.length, 0);
      assert.equal(fetches, 1);
      assert.equal(x.db.prepare('SELECT count(*) n FROM autoresponder_deliveries').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('autoresponder uses fresh channel and thread-specific permission,not cached destination', async () => {
  const { PermissionFlagsBits: P } = await import('discord.js');
  const x = setup();
  let cached = 0;
  const channel = {
    ...x.m.channel,
    isThread: () => true,
    permissionsFor: () => ({
      has: (p) => {
        assert(p.includes(P.SendMessagesInThreads));
        assert(!p.includes(P.SendMessages));
        return true;
      },
    }),
  };
  x.m.guild.channels.fetch = async () => channel;
  x.m.channel.send = async () => cached++;
  try {
    await createAutoresponderHandler(x.c)(x.m);
    assert.equal(cached, 0);
    assert.equal(x.sent.length, 1);
    assert.equal(x.db.prepare('SELECT status FROM autoresponder_deliveries').get().status, 'sent');
  } finally {
    x.db.close();
  }
});

test('autoresponder preflight skips native calls for unmatched,cooldown and replay without reserving', async () => {
  const x = setup();
  let native = 0;
  const me = x.m.guild.members.fetchMe,
    channel = x.m.guild.channels.fetch;
  x.m.guild.members.fetchMe = async (...a) => {
    native++;
    return me(...a);
  };
  x.m.guild.channels.fetch = async (...a) => {
    native++;
    return channel(...a);
  };
  try {
    const handler = createAutoresponderHandler(x.c);
    await handler({ ...x.m, content: 'no match' });
    assert.equal(native, 0);
    assert.equal(x.db.prepare('SELECT count(*) n FROM autoresponder_deliveries').get().n, 0);
    await handler(x.m);
    assert.equal(native, 2);
    assert.equal(x.sent.length, 1);
    await handler(x.m);
    await handler({ ...x.m, id: 'm2' });
    assert.equal(native, 2);
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});
test('autoresponder transactional claim rechecks deletion,response edit and competing reservation after native await', async () => {
  for (const kind of ['delete', 'edit', 'competing']) {
    const x = setup();
    const fetch = x.m.guild.channels.fetch;
    x.m.guild.channels.fetch = async (...a) => {
      if (kind === 'delete') x.c.autoresponders.delete('g', 'hello');
      if (kind === 'edit') x.c.autoresponders.edit('g', 'hello', 'CURRENT RESPONSE');
      if (kind === 'competing') x.c.autoresponders.claim('g', 'm', 'hello');
      return fetch(...a);
    };
    try {
      await createAutoresponderHandler(x.c)(x.m);
      assert.equal(x.sent.length, kind === 'edit' ? 1 : 0);
      if (kind === 'edit') assert.equal(x.sent[0].embeds[0].data.description, 'CURRENT RESPONSE');
      if (kind === 'delete')
        assert.equal(x.db.prepare('SELECT count(*) n FROM autoresponder_deliveries').get().n, 0);
      if (kind === 'competing')
        assert.equal(
          x.db.prepare('SELECT status FROM autoresponder_deliveries').get().status,
          'reserved',
        );
    } finally {
      x.db.close();
    }
  }
});

test('responder pause/resume preserves response,cooldown and replay history without automatic send', () => {
  const db = openDatabase(':memory:');
  let now = 100000;
  const r = new Autoresponders(db, () => now);
  try {
    r.create('g', { trigger: 'hello', response: 'private', cooldownSeconds: 10 });
    const first = r.claim('g', 'm1', 'hello');
    r.finish('m1', 'sent');
    r.setEnabled('g', ' HELLO ', false);
    assert.equal(r.eligible('g', 'm2', 'hello'), false);
    assert.equal(r.claim('g', 'm2', 'hello'), null);
    assert.equal(r.find('g', 'hello').response, 'private');
    assert.equal(
      r.find('g', 'hello').last_sent_at,
      first.last_sent_at === 0 ? now : first.last_sent_at,
    );
    r.setEnabled('g', 'hello', true);
    assert.equal(r.claim('g', 'm2', 'hello'), null);
    now += 11000;
    assert(r.claim('g', 'm2', 'hello'));
    assert.equal(r.claim('g', 'm1', 'hello'), null);
    assert.throws(() => r.setEnabled('other', 'hello', false), /responderNotFound/);
  } finally {
    db.close();
  }
});
test('paused responder state survives SQLite reopen,new rows default active', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luna-responder-pause-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    let r = new Autoresponders(db);
    r.create('g', { trigger: 'one', response: 'one' });
    r.create('g', { trigger: 'two', response: 'two' });
    r.setEnabled('g', 'one', false);
    db.close();
    db = openDatabase(path);
    r = new Autoresponders(db);
    assert.equal(r.find('g', 'one').enabled, 0);
    assert.equal(r.find('g', 'two').enabled, 1);
    assert.equal(r.eligible('g', 'm', 'one'), false);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('responder toggle slash is private localized and pause during native validation prevents reservation', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    x.c.guildConfig.setLanguage('g', locale);
    const i = {
      guildId: 'g',
      user: { id: 'u' },
      guild: {
        id: 'g',
        members: {
          fetch: async () => ({ id: 'u', guild: { id: 'g' }, permissions: { has: () => true } }),
        },
      },
      options: { getSubcommand: () => 'toggle', getString: () => 'hello', getBoolean: () => false },
      reply: async (p) => replies.push(p),
    };
    try {
      await command.execute(i, x.c);
      assert.equal(replies[0].flags, 64);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      x.c.autoresponders.setEnabled('g', 'hello', true);
      const fetch = x.m.guild.channels.fetch;
      x.m.guild.channels.fetch = async (...a) => {
        x.c.autoresponders.setEnabled('g', 'hello', false);
        return fetch(...a);
      };
      await createAutoresponderHandler(x.c)(x.m);
      assert.equal(x.sent.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM autoresponder_deliveries').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('schema23 responder row upgrades enabled without losing response,cooldown or replay receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luna-responder-upgrade-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    db.exec(
      'ALTER TABLE autoresponders DROP COLUMN enabled;DELETE FROM schema_migrations WHERE version=24;',
    );
    db.prepare(
      'INSERT INTO autoresponders(guild_id,trigger,mode,response,cooldown_seconds,created_at,last_sent_at) VALUES(?,?,?,?,?,?,?)',
    ).run('g', 'hello', 'exact', 'old response', 30, 100, 200);
    const id = db.prepare('SELECT id FROM autoresponders').get().id;
    db.prepare('INSERT INTO autoresponder_deliveries VALUES(?,?,?,?,?)').run(
      'old-message',
      'g',
      id,
      'sent',
      200,
    );
    db.close();
    db = openDatabase(path);
    const r = new Autoresponders(db, () => 1000000),
      row = r.find('g', 'hello');
    assert.equal(row.enabled, 1);
    assert.equal(row.response, 'old response');
    assert.equal(row.cooldown_seconds, 30);
    assert.equal(row.last_sent_at, 200);
    assert.equal(r.claim('g', 'old-message', 'hello'), null);
    assert.equal(db.prepare('SELECT status FROM autoresponder_deliveries').get().status, 'sent');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('responder cooldown edit preserves response,mode,enabled,last send and replay while changing elapsed eligibility', () => {
  const db = openDatabase(':memory:');
  let now = 100000;
  try {
    const r = new Autoresponders(db, () => now);
    r.create('g', { trigger: 'hello', response: 'Body', cooldownSeconds: 60 });
    r.claim('g', 'm1', 'hello');
    const before = r.find('g', 'hello');
    r.setCooldown('g', ' HELLO ', 10);
    const after = r.find('g', 'hello');
    assert.deepEqual({ ...after, cooldown_seconds: before.cooldown_seconds }, before);
    assert.equal(r.claim('g', 'm1', 'hello'), null);
    now += 11000;
    assert(r.eligible('g', 'm2', 'hello'));
    r.setCooldown('g', 'hello', 3600);
    assert.equal(r.eligible('g', 'm2', 'hello'), false);
    for (const bad of [9, 3601, 10.5, '10']) assert.throws(() => r.setCooldown('g', 'hello', bad));
    assert.throws(() => r.setCooldown('other', 'hello', 10), /responderNotFound/);
  } finally {
    db.close();
  }
});
test('responder cooldown command is exact-manager private localized and does not send native messages', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const guildConfig = new GuildConfig(new GuildSettings(db)),
        r = new Autoresponders(db);
      guildConfig.setLanguage('g', locale);
      r.create('g', { trigger: 'hello', response: 'Body' });
      const replies = [],
        member = { id: 'user', guild: { id: 'g' }, permissions: { has: () => true } },
        i = {
          user: { id: 'user' },
          guildId: 'g',
          guild: { id: 'g', members: { fetch: async () => member } },
          options: {
            getSubcommand: () => 'cooldown',
            getString: () => 'hello',
            getInteger: () => 10,
          },
          reply: async (p) => replies.push(p),
        },
        c = { guildConfig, autoresponders: r, config: { messageEventsEnabled: false } };
      await command.execute(i, c);
      assert.equal(r.find('g', 'hello').cooldown_seconds, 10);
      assert.equal(replies[0].flags, 64);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      member.guild.id = 'other';
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});

test('responder mode edit changes literal matching while preserving cooldown and replay state', () => {
  const db = openDatabase(':memory:');
  let now = 100000;
  try {
    const r = new Autoresponders(db, () => now);
    r.create('g', { trigger: 'hello', response: 'Body', cooldownSeconds: 10 });
    r.claim('g', 'm1', 'hello');
    const before = r.find('g', 'hello');
    r.setMode('g', ' HELLO ', 'keyword');
    assert.deepEqual({ ...r.find('g', 'hello'), mode: before.mode }, before);
    assert.equal(r.claim('g', 'm1', 'hello again'), null);
    now += 11000;
    assert(r.eligible('g', 'm2', 'hello again'));
    r.setMode('g', 'hello', 'exact');
    assert.equal(r.eligible('g', 'm2', 'hello again'), false);
    assert.throws(() => r.setMode('g', 'hello', 'regex'));
    assert.throws(() => r.setMode('other', 'hello', 'keyword'), /responderNotFound/);
  } finally {
    db.close();
  }
});
test('responder mode command is private localized current-manager only', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const guildConfig = new GuildConfig(new GuildSettings(db)),
        r = new Autoresponders(db);
      guildConfig.setLanguage('g', locale);
      r.create('g', { trigger: 'hello', response: 'Body' });
      const replies = [],
        member = { id: 'user', guild: { id: 'g' }, permissions: { has: () => true } },
        i = {
          user: { id: 'user' },
          guildId: 'g',
          guild: { id: 'g', members: { fetch: async () => member } },
          options: {
            getSubcommand: () => 'mode',
            getString: (k) => (k === 'trigger' ? 'hello' : 'keyword'),
          },
          reply: async (p) => replies.push(p),
        },
        c = { guildConfig, autoresponders: r, config: { messageEventsEnabled: false } };
      await command.execute(i, c);
      assert.equal(r.find('g', 'hello').mode, 'keyword');
      assert.equal(replies[0].flags, 64);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      member.id = 'other';
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});

test('responder delivery completion requires exactly one reserved row', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db);
    r.create('g', { trigger: 'hello', response: 'Body' });
    assert.throws(() => r.finish('missing', 'sent'), /not reserved/);
    r.claim('g', 'm1', 'hello');
    r.finish('m1', 'sent');
    assert.throws(() => r.finish('m1', 'uncertain'), /not reserved/);
    assert.equal(db.prepare('SELECT status FROM autoresponder_deliveries').get().status, 'sent');
  } finally {
    db.close();
  }
});
test('accepted responder send missing identity becomes uncertain without replay', async () => {
  const x = setup();
  try {
    x.m.channel.send = async (p) => {
      x.sent.push(p);
      return {};
    };
    const h = createAutoresponderHandler(x.c);
    await h(x.m);
    assert.equal(
      x.db.prepare('SELECT status FROM autoresponder_deliveries').get().status,
      'uncertain',
    );
    await h(x.m);
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});

test('responder rename normalizes literal trigger while preserving exact row and replay guard', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db, () => 100000);
    r.create('g', { trigger: 'hello', response: 'Body', mode: 'keyword', cooldownSeconds: 10 });
    r.claim('g', 'msg', 'hello');
    const before = r.find('g', 'hello');
    r.rename('g', 'hello', ' NEW  Trigger ');
    assert.equal(r.find('g', 'hello'), undefined);
    assert.deepEqual(r.find('g', 'new trigger'), { ...before, trigger: 'new trigger' });
    assert.equal(r.eligible('g', 'msg', 'new trigger'), false);
    assert.equal(r.find('other', 'new trigger'), undefined);
  } finally {
    db.close();
  }
});
test('responder rename refuses collisions invalid normalization and foreign records atomically', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db);
    r.create('g', { trigger: 'hello', response: 'Body' });
    r.create('g', { trigger: 'other', response: 'Other' });
    const before = r.list('g');
    for (const target of ['OTHER', '   ', 'a'.repeat(101), 'bad\u0000'])
      assert.throws(() => r.rename('g', 'hello', target));
    assert.throws(() => r.rename('foreign', 'hello', 'new'), /responderNotFound/);
    assert.deepEqual(r.list('g'), before);
    r.rename('g', 'hello', ' HELLO ');
    assert.deepEqual(r.list('g'), before);
  } finally {
    db.close();
  }
});
test('responder rename command is private localized exact-manager storage mutation only', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new Autoresponders(db);
      r.create('g', { trigger: 'old', response: 'Body' });
      const replies = [],
        actor = { id: 'a', guild: { id: 'g' }, permissions: { has: () => true } },
        i = {
          guild: { id: 'g', members: { fetch: async () => actor } },
          guildId: 'g',
          user: { id: 'a' },
          reply: async (p) => replies.push(p),
          options: {
            getSubcommand: () => 'rename',
            getString: (n) => (n === 'trigger' ? 'old' : 'new'),
          },
        },
        c = {
          autoresponders: r,
          guildConfig: { get: () => ({ language: locale }) },
          config: { messageEventsEnabled: false },
        };
      await command.execute(i, c);
      assert.equal(replies[0].embeds[0].data.description, translate(locale, 'responderRenamed'));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(r.find('g', 'new'));
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});

test('disable all guild responders changes only enabled bit and preserves unresolved delivery/cooldown/metadata', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new Autoresponders(db, () => 100000);
    r.create('g', { trigger: 'hello', response: 'response' });
    r.create('g', { trigger: 'paused', response: 'paused' });
    r.setEnabled('g', 'paused', false);
    r.create('foreign', { trigger: 'hello', response: 'foreign' });
    r.claim('g', 'm1', 'hello');
    const before = r.list('g'),
      receipt = db.prepare('SELECT * FROM autoresponder_deliveries').get();
    assert.equal(r.disableAll('g'), 1);
    assert.equal(r.disableAll('g'), 0);
    assert.deepEqual(
      r.list('g'),
      before.map((a) => ({ ...a, enabled: 0 })),
    );
    assert.equal(r.find('foreign', 'hello').enabled, 1);
    assert.deepEqual(db.prepare('SELECT * FROM autoresponder_deliveries').get(), receipt);
    assert.equal(r.eligible('g', 'm2', 'hello'), false);
    assert.equal(r.claim('g', 'm2', 'hello'), null);
    r.finish('m1', 'sent');
    assert.equal(db.prepare('SELECT status FROM autoresponder_deliveries').get().status, 'sent');
  } finally {
    db.close();
  }
});
test('disableall command requires exact current manager explicit confirm and privately explains in-flight boundary in three locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const guildConfig = new GuildConfig(new GuildSettings(db));
      guildConfig.setLanguage('g', locale);
      const r = new Autoresponders(db);
      r.create('g', { trigger: 'hello', response: 'x' });
      const replies = [],
        actor = { id: 'u', guild: { id: 'g' }, permissions: { has: () => true } },
        i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: { id: 'g', members: { fetch: async () => actor } },
          options: { getSubcommand: () => 'disableall', getBoolean: () => false },
          reply: async (p) => replies.push(p),
        },
        c = { guildConfig, autoresponders: r, config: { messageEventsEnabled: false } };
      await assert.rejects(() => command.execute(i, c), /responderConfirmRequired/);
      assert.equal(r.find('g', 'hello').enabled, 1);
      i.options.getBoolean = () => true;
      actor.id = 'foreign';
      await assert.rejects(() => command.execute(i, c), /userPermission/);
      actor.id = 'u';
      await command.execute(i, c);
      assert.equal(r.find('g', 'hello').enabled, 0);
      assert.equal(replies[0].flags, 64);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(c.config.messageEventsEnabled, false);
    } finally {
      db.close();
    }
  }
});
test('bulk paused autoresponders and their retained cooldown/receipt survive realSQLite reopen without reenable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luna-responder-bulk-')),
    path = join(dir, 'db');
  let db;
  try {
    db = openDatabase(path);
    let r = new Autoresponders(db, () => 100000);
    r.create('g', { trigger: 'hello', response: 'same', cooldownSeconds: 10 });
    r.claim('g', 'm1', 'hello');
    const before = r.find('g', 'hello');
    r.disableAll('g');
    db.close();
    db = openDatabase(path);
    r = new Autoresponders(db, () => 200000);
    r.recover();
    assert.deepEqual(r.find('g', 'hello'), { ...before, enabled: 0 });
    assert.equal(r.claim('g', 'm2', 'hello'), null);
    assert.equal(
      db.prepare('SELECT status FROM autoresponder_deliveries').get().status,
      'uncertain',
    );
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
