import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AntiBot, createAntiBotHandler } from '../src/services/antibot.js';
import command from '../src/commands/automod/antibot.js';
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
    antiBot = new AntiBot(db, () => now),
    calls = [];
  let deleted = false;
  const actor = { id: actorId, guild: { id: g }, permissions: { has: () => true } },
    sender = {
      id: senderId,
      guild: { id: g },
      user: { bot: true },
      permissions: { has: () => false },
    },
    bot = { id: botId, guild: { id: g } };
  const members = new Map([
    [actorId, actor],
    [senderId, sender],
  ]);
  const guild = {
    id: g,
    ownerId: '100000000000000099',
    members: { fetch: async ({ user }) => members.get(user), fetchMe: async () => bot },
    channels: { fetch: async () => channel },
  };
  const client = { user: { id: botId } },
    channel = {
      id: channelId,
      guildId: g,
      type: ChannelType.GuildText,
      permissionsFor: () => ({ has: () => true }),
      messages: {
        fetch: async () => {
          if (deleted) throw { code: 10008, status: 404 };
          return message;
        },
      },
    };
  const message = {
    id: messageId,
    guild,
    client,
    author: { id: senderId, bot: true },
    channel,
    channelId,
    attachments: { size: 0 },
    createdTimestamp: now,
    delete: async () => {
      calls.push('delete');
      deleted = true;
    },
  };
  const c = {
    db,
    antiBot,
    config: { messageEventsEnabled: true },
    logger: { warn: () => {} },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return {
    db,
    c,
    antiBot,
    calls,
    actor,
    sender,
    bot,
    guild,
    channel,
    message,
    client,
    rule: () => antiBot.add(g, channelId),
  };
}
test('antibot policy isolatedpersistent channel/whitelist cap/resetconfig revisions and reservedrestartuncertain', () => {
  const s = setup();
  try {
    s.rule();
    assert.equal(new AntiBot(s.db).get(g, channelId).channel_id, channelId);
    assert.equal(s.antiBot.get('other', channelId), null);
    for (let n = 0; n < 24; n++) s.antiBot.add(g, String(300000000000000000n + BigInt(n)));
    assert.throws(() => s.antiBot.add(g, '300000000000000099'), /antibotLimit/);
    const rev = s.antiBot.get(g, channelId).revision;
    s.rule();
    assert.notEqual(s.antiBot.get(g, channelId).revision, rev);
    for (let n = 0; n < 100; n++) s.antiBot.wlAdd(g, String(200000000000000000n + BigInt(n)));
    assert.throws(() => s.antiBot.wlAdd(g, senderId), /antibotLimit/);
    assert.equal(s.antiBot.wlRemove(g, '200000000000000000'), 1);
    s.antiBot.wlAdd(g, senderId);
    s.antiBot.reserve(messageId, g);
    s.antiBot.recover();
    assert.equal(s.db.prepare('SELECT status FROM antibot_receipts').get().status, 'uncertain');
    s.antiBot.remove(g, channelId);
    assert.equal(s.antiBot.whitelist(g).length, 100);
    s.antiBot.reset(g);
    assert.equal(s.antiBot.channels(g).length, 0);
    assert.equal(s.antiBot.whitelist(g).length, 0);
    assert.equal(s.db.prepare('SELECT status FROM antibot_receipts').get().status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('antibot freshbot includingattachments deletion exactnativeabsence completed persistentreplaydedup', async () => {
  const s = setup();
  try {
    s.rule();
    s.message.attachments.size = 2;
    const h = createAntiBotHandler(s.c);
    assert.equal(await h(s.message), true);
    assert.deepEqual(s.calls, ['delete']);
    assert.equal(s.db.prepare('SELECT status FROM antibot_receipts').get().status, 'completed');
    await h(s.message);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('antibot humans Emika webhooks edits whitelist stale foreign permissionfail no effects', async () => {
  for (const change of [
    (s) => (s.message.author.bot = false),
    (s) => (s.message.system = true),
    (s) => (s.message.createdTimestamp = now + 1),
    (s) => (s.message.webhookId = 'x'),
    (s) => (s.message.editedTimestamp = now),
    (s) => (s.message.author.id = botId),
    (s) => s.antiBot.wlAdd(g, senderId),
    (s) => (s.message.createdTimestamp = now - 300000),
    (s) => (s.channel.permissionsFor = () => ({ has: () => false })),
    (s) => (s.bot.guild.id = 'other'),
    (s) => (s.channel.type = ChannelType.GuildAnnouncement),
    (s) => (s.c.config.messageEventsEnabled = false),
  ]) {
    const s = setup();
    try {
      s.rule();
      change(s);
      await createAntiBotHandler(s.c)(s.message);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('antibot configrace afternativefetch no delete unknownsubmittednetwork freezes no retry', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => {
      s.antiBot.remove(g, channelId);
      return s.message;
    };
    await createAntiBotHandler(s.c)(s.message);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
  const b = setup();
  try {
    b.rule();
    b.message.delete = async () => {
      b.calls.push('attempt');
      throw Error('network');
    };
    const h = createAntiBotHandler(b.c);
    await h(b.message);
    await h(b.message);
    assert.equal(b.calls.length, 1);
    assert.equal(b.db.prepare('SELECT status FROM antibot_receipts').get().status, 'uncertain');
  } finally {
    b.db.close();
  }
});
test('antibot whitelistrace before reservation prevents effect', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => {
      s.antiBot.wlAdd(g, senderId);
      return s.message;
    };
    await createAntiBotHandler(s.c)(s.message);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('antibot nativehuman protects cachedbot event and unverifiabledelete not completed', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => ({ ...s.message, author: { id: senderId, bot: false } });
    await createAntiBotHandler(s.c)(s.message);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
  const b = setup();
  try {
    b.rule();
    b.message.delete = async () => b.calls.push('delete');
    await createAntiBotHandler(b.c)(b.message);
    assert.equal(b.db.prepare('SELECT status FROM antibot_receipts').get().status, 'uncertain');
  } finally {
    b.db.close();
  }
});
test('6antibotpaths private3locale exactconfigguard confirm required commandsno delete', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let reply;
      s.c.guildConfig.get = () => ({ language });
      const i = {
        guildId: g,
        guild: s.guild,
        user: { id: actorId },
        client: s.client,
        options: {
          getSubcommand: () => 'add',
          getChannel: () => s.channel,
          getBoolean: () => true,
          getUser: () => ({ id: senderId }),
          getString: () => senderId,
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(s.antiBot.get(g, channelId).channel_id, channelId);
      for (const sub of ['wladd', 'wlremove', 'config', 'remove', 'reset']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.calls.length, 0);
      i.options.getSubcommand = () => 'add';
      i.options.getBoolean = () => false;
      await assert.rejects(() => command.execute(i, s.c), /antibotConfirm/);
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
