import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import {
  AutoReactions,
  reactTrigger,
  reactEmojis,
  createAutoReactHandler,
} from '../src/services/autoreact.js';
import command from '../src/commands/automations/react.js';
import { ChannelType } from 'discord.js';
const g = '100000000000000001',
  actorId = '100000000000000002',
  botId = '100000000000000003',
  senderId = '100000000000000004',
  channelId = '100000000000000005',
  messageId = '100000000000000006',
  now = 1000000;
function setup() {
  const db = openDatabase(':memory:'),
    autoReactions = new AutoReactions(db, () => now),
    calls = [];
  const actor = { id: actorId, guild: { id: g }, permissions: { has: () => true } },
    bot = { id: botId, guild: { id: g } },
    guild = {
      id: g,
      members: { fetch: async () => actor, fetchMe: async () => bot },
      channels: { fetch: async () => channel },
      emojis: { fetch: async (id) => ({ id, guild: { id: g }, name: 'test', animated: false }) },
    },
    client = { user: { id: botId } };
  const channel = {
    id: channelId,
    guildId: g,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    messages: { fetch: async () => message },
  };
  const message = {
    id: messageId,
    guild,
    client,
    channel,
    channelId,
    author: { id: senderId, bot: false },
    content: 'Hello, world!',
    createdTimestamp: now,
    reactions: { cache: new Map() },
    react: async (emoji) => {
      const key = typeof emoji === 'string' ? emoji : emoji.id;
      calls.push(key);
      message.reactions.cache.set(key, { me: true, message: { id: messageId } });
    },
  };
  const c = {
    db,
    autoReactions,
    config: { messageEventsEnabled: true },
    logger: { warn: () => {} },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return {
    db,
    c,
    autoReactions,
    calls,
    actor,
    bot,
    guild,
    client,
    channel,
    message,
    rule: () => autoReactions.add(g, 'hello', '["💖","😀"]'),
  };
}
test('autoreact bounded singleword unicodeemojiJSON strict validation deterministic persistencecap', () => {
  assert.equal(reactTrigger('ＨＥＬＬＯ'), 'hello');
  assert.deepEqual(reactEmojis('["💖","🇮🇳","👨‍👩‍👧","1️⃣"]'), ['💖', '🇮🇳', '👨‍👩‍👧', '1️⃣']);
  for (const text of [
    '[]',
    '["abc"]',
    '["😀","😀"]',
    '[true]',
    '["😀😀"]',
    '["<@100000000000000001>"]',
  ])
    assert.throws(() => reactEmojis(text), /autoreactInput/);
  for (const word of ['two words', ' hello', 'x\n', 'a-b', ''])
    assert.throws(() => reactTrigger(word), /autoreactInput/);
  const s = setup();
  try {
    s.rule();
    assert.equal(new AutoReactions(s.db).list(g).length, 1);
    assert.equal(s.autoReactions.list('other').length, 0);
    for (let n = 1; n <= 9; n++) s.autoReactions.add(g, 'word' + n, '["💖"]');
    assert.throws(() => s.autoReactions.add(g, 'extra', '["💖"]'), /autoreactLimit/);
    assert.equal(s.autoReactions.remove(g, 'hello'), 1);
    assert.equal(s.autoReactions.reset(g), 9);
  } finally {
    s.db.close();
  }
});
test('autoreact wholeword normalization exactnative2emoji postobserve persistentdedup sharedemoji', async () => {
  const s = setup();
  try {
    s.rule();
    s.autoReactions.add(g, 'world', '["💖"]');
    const h = createAutoReactHandler(s.c);
    await h(s.message);
    assert.deepEqual(s.calls, ['💖', '😀']);
    assert.deepEqual(
      s.db
        .prepare('SELECT status FROM autoreact_receipts')
        .all()
        .map((r) => r.status),
      ['completed', 'completed'],
    );
    await h(s.message);
    assert.equal(s.calls.length, 2);
  } finally {
    s.db.close();
  }
});
test('autoreact ignores bots edits webhook stale partialwords threads missingnativepermissions', async () => {
  for (const mutate of [
    (s) => (s.message.author.bot = true),
    (s) => (s.message.webhookId = 'x'),
    (s) => (s.message.editedTimestamp = now),
    (s) => (s.message.createdTimestamp = now - 300000),
    (s) => (s.message.content = 'helloworld'),
    (s) => (s.channel.type = ChannelType.PublicThread),
    (s) => (s.channel.permissionsFor = () => ({ has: () => false })),
    (s) => (s.bot.guild.id = 'other'),
    (s) => (s.c.config.messageEventsEnabled = false),
  ]) {
    const s = setup();
    try {
      s.rule();
      mutate(s);
      await createAutoReactHandler(s.c)(s.message);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('autoreact policy/nativecontent races prevent effect ambiguousreaction freeze no retry', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => ({ ...s.message, content: 'unmatched' });
    await createAutoReactHandler(s.c)(s.message);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
  const race = setup();
  try {
    race.rule();
    race.channel.messages.fetch = async () => {
      race.autoReactions.reset(g);
      return race.message;
    };
    await createAutoReactHandler(race.c)(race.message);
    assert.equal(race.calls.length, 0);
  } finally {
    race.db.close();
  }
  const bad = setup();
  try {
    bad.autoReactions.add(g, 'hello', '["💖"]');
    bad.message.react = async () => {
      bad.calls.push('attempt');
      throw Error('network');
    };
    const h = createAutoReactHandler(bad.c);
    await h(bad.message);
    await h(bad.message);
    assert.equal(bad.calls.length, 1);
    assert.equal(bad.db.prepare('SELECT status FROM autoreact_receipts').get().status, 'uncertain');
    bad.autoReactions.recover();
    assert.equal(bad.db.prepare('SELECT status FROM autoreact_receipts').get().status, 'uncertain');
  } finally {
    bad.db.close();
  }
});
test('autoreact guildcustomemoji forcedidentity no foreign emoji reservedrestart uncertain', async () => {
  const s = setup();
  try {
    s.autoReactions.add(g, 'hello', '["100000000000000009"]');
    await createAutoReactHandler(s.c)(s.message);
    assert.deepEqual(s.calls, ['100000000000000009']);
    s.autoReactions.reserve('reserved', '💖', g);
    s.autoReactions.recover();
    assert.equal(
      s.db.prepare('SELECT status FROM autoreact_receipts WHERE message_id=?').get('reserved')
        .status,
      'uncertain',
    );
  } finally {
    s.db.close();
  }
  const foreign = setup();
  try {
    foreign.autoReactions.add(g, 'hello', '["100000000000000009"]');
    foreign.guild.emojis.fetch = async (id) => ({
      id,
      guild: { id: 'other' },
      name: 'x',
      animated: false,
    });
    await createAutoReactHandler(foreign.c)(foreign.message);
    assert.equal(foreign.calls.length, 0);
  } finally {
    foreign.db.close();
  }
});
test('4reactpaths managerprivate3locale exactpolicybytes commandno reactions denial', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let reply;
      s.c.guildConfig.get = () => ({ language });
      const i = {
        guildId: g,
        guild: s.guild,
        user: { id: actorId },
        options: {
          getSubcommand: () => 'add',
          getString: (key) => (key === 'trigger' ? 'hello' : '["💖"]'),
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(s.autoReactions.list(g).length, 1);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), {
        records: [{ trigger: 'hello', emojis: ['💖'] }],
      });
      for (const sub of ['list', 'remove', 'reset']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
      }
      assert.equal(s.calls.length, 0);
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
