import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MediaPolicy, createMediaHandler } from '../src/services/mediaPolicy.js';
import command from '../src/commands/automod/media.js';
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
    mediaPolicy = new MediaPolicy(db, () => now),
    calls = [];
  let deleted = false;
  const actor = { id: actorId, guild: { id: g }, permissions: { has: () => true } },
    sender = {
      id: senderId,
      guild: { id: g },
      user: { bot: false },
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
    author: { id: senderId, bot: false },
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
    mediaPolicy,
    config: { messageEventsEnabled: true },
    logger: { warn: () => {} },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return {
    db,
    c,
    mediaPolicy,
    calls,
    actor,
    sender,
    bot,
    guild,
    channel,
    message,
    client,
    rule: () => mediaPolicy.setup(g, channelId),
  };
}
test('media policy isolatedpersistent bypass cap/resetconfig revisions and reservedrestartuncertain', () => {
  const s = setup();
  try {
    s.rule();
    assert.equal(new MediaPolicy(s.db).get(g).channel_id, channelId);
    assert.equal(s.mediaPolicy.get('other'), null);
    const rev = s.mediaPolicy.get(g).revision;
    s.rule();
    assert.notEqual(s.mediaPolicy.get(g).revision, rev);
    for (let n = 0; n < 100; n++)
      s.mediaPolicy.addBypass(g, String(200000000000000000n + BigInt(n)));
    assert.throws(() => s.mediaPolicy.addBypass(g, senderId), /mediaLimit/);
    assert.equal(s.mediaPolicy.removeBypass(g, '200000000000000000'), 1);
    s.mediaPolicy.addBypass(g, senderId);
    s.mediaPolicy.reserve(messageId, g);
    s.mediaPolicy.recover();
    assert.equal(s.db.prepare('SELECT status FROM media_receipts').get().status, 'uncertain');
    s.mediaPolicy.remove(g);
    assert.equal(s.mediaPolicy.bypasses(g).length, 100);
  } finally {
    s.db.close();
  }
});
test('media freshnonattachment deletion exactnativeabsence completed persistentreplaydedup', async () => {
  const s = setup();
  try {
    s.rule();
    const h = createMediaHandler(s.c);
    assert.equal(await h(s.message), true);
    assert.deepEqual(s.calls, ['delete']);
    assert.equal(s.db.prepare('SELECT status FROM media_receipts').get().status, 'completed');
    await h(s.message);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('media attachments bots webhooks edits staff bypass stale foreign permissionfail no effects', async () => {
  for (const change of [
    (s) => (s.message.attachments.size = 1),
    (s) => (s.message.author.bot = true),
    (s) => (s.message.webhookId = 'x'),
    (s) => (s.message.editedTimestamp = now),
    (s) => (s.sender.permissions.has = () => true),
    (s) => s.mediaPolicy.addBypass(g, senderId),
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
      await createMediaHandler(s.c)(s.message);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('media configrace afternativefetch no delete unknownsubmittednetwork freezes no retry', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => {
      s.mediaPolicy.remove(g);
      return s.message;
    };
    await createMediaHandler(s.c)(s.message);
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
    const h = createMediaHandler(b.c);
    await h(b.message);
    await h(b.message);
    assert.equal(b.calls.length, 1);
    assert.equal(b.db.prepare('SELECT status FROM media_receipts').get().status, 'uncertain');
  } finally {
    b.db.close();
  }
});
test('media nativefreshattachment protects text-onlycached event and unverifiabledelete not completed', async () => {
  const s = setup();
  try {
    s.rule();
    s.channel.messages.fetch = async () => ({ ...s.message, attachments: { size: 1 } });
    await createMediaHandler(s.c)(s.message);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
  const b = setup();
  try {
    b.rule();
    b.message.delete = async () => b.calls.push('delete');
    await createMediaHandler(b.c)(b.message);
    assert.equal(b.db.prepare('SELECT status FROM media_receipts').get().status, 'uncertain');
  } finally {
    b.db.close();
  }
});
test('6mediapaths private3locale exactconfigguard confirm required commandsno delete', async () => {
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
          getSubcommand: () => 'setup',
          getChannel: () => s.channel,
          getBoolean: () => true,
          getUser: () => ({ id: senderId }),
          getString: () => senderId,
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(s.mediaPolicy.get(g).channel_id, channelId);
      for (const sub of ['bypassadd', 'bypassshow', 'bypassremove', 'config', 'remove']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.calls.length, 0);
      i.options.getSubcommand = () => 'setup';
      i.options.getBoolean = () => false;
      await assert.rejects(() => command.execute(i, s.c), /mediaConfirm/);
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
test('media deletion posts one localized no-ping notice that deletes itself, media is untouched', async () => {
  const s = setup();
  try {
    s.rule();
    const sent = [];
    s.channel.send = async (payload) => {
      const record = { payload, deleted: false };
      record.delete = async () => {
        record.deleted = true;
      };
      sent.push(record);
      return record;
    };
    s.c.localization = { t: (_g, key, p) => `${key}:${p.user}`, locale: () => 'en' };
    const h = createMediaHandler(s.c, { noticeMs: 20 });
    assert.equal(await h(s.message), true);
    assert.deepEqual(s.calls, ['delete']);
    assert.equal(sent.length, 1);
    assert.match(JSON.stringify(sent[0].payload), /mediaNotice:<@/);
    assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] });
    assert.equal(sent[0].deleted, false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sent[0].deleted, true);
    // A message with an attachment is never deleted and gets no notice.
    s.message.attachments = { size: 1 };
    s.message.id = '100000000000000777';
    await h(s.message);
    assert.equal(s.calls.length, 1);
    assert.equal(sent.length, 1);
  } finally {
    s.db.close();
  }
});
