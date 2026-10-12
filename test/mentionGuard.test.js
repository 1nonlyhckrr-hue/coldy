import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import {
  MentionGuard,
  mentionDuration,
  createMentionGuardHandler,
} from '../src/services/mentionGuard.js';
import command from '../src/commands/automod/mentionguard.js';
const targetId = '100000000000000001',
  senderId = '100000000000000002',
  ownerId = '100000000000000003',
  botId = '100000000000000004',
  g = '100000000000000005',
  now = 2000000;
function setup() {
  const db = openDatabase(':memory:'),
    guard = new MentionGuard(db, () => now),
    calls = [];
  const bot = {
    id: botId,
    guild: { id: g },
    permissions: { has: () => true },
    roles: { highest: { comparePositionTo: () => 1 } },
  };
  const sender = {
    id: senderId,
    guild: { id: g },
    user: { bot: false },
    permissions: { has: () => false },
    moderatable: true,
    communicationDisabledUntilTimestamp: null,
    roles: { highest: {} },
    disableCommunicationUntil: async (until, reason) => {
      calls.push({ until, reason });
      sender.communicationDisabledUntilTimestamp = until;
    },
  };
  const guild = {
    id: g,
    ownerId,
    members: { fetchMe: async () => bot, fetch: async () => sender },
  };
  const c = {
    config: { messageEventsEnabled: true, ownerIds: [ownerId] },
    mentionGuard: guard,
    logger: { warn: () => {} },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  const message = (n) => ({
    id: String(200000000000000000n + BigInt(n)),
    guild,
    author: { id: senderId, bot: false },
    client: { user: { id: botId } },
    content: 'hi <@' + targetId + '> <@!' + targetId + '>',
    createdTimestamp: now,
    mentions: { users: { has: (id) => id === targetId } },
  });
  return { db, guard, c, calls, bot, sender, guild, message };
}
test('mentionguard strict duration/defaultoff revision resets and guildisolated saved policy', () => {
  for (const [text, n] of [
    ['1s', 1000],
    ['10m', 600000],
    ['1h', 3600000],
    ['28d', 2419200000],
  ])
    assert.equal(mentionDuration(text), n);
  for (const v of [null, '', '0s', '01s', '1.5h', '29d', '1w', '1S', ' 1s', '99999999d'])
    assert.throws(() => mentionDuration(v), /mentionGuardDuration/);
  const s = setup();
  try {
    assert.equal(s.guard.get(g).enabled, 0);
    s.guard.set(g, targetId, '10m');
    assert.equal(s.guard.get('other').enabled, 0);
    assert.equal(new MentionGuard(s.db).get(g).duration_ms, 600000);
    s.guard.off(g);
    assert.equal(s.guard.get(g).enabled, 0);
    assert.equal(s.guard.get(g).revision, 2);
  } finally {
    s.db.close();
  }
});
test('mentionguard fourth distinct directmention message singleattempt persisteddedup exacttimeout verified no alert', async () => {
  const s = setup();
  try {
    s.guard.set(g, targetId, '10m');
    const handler = createMentionGuardHandler(s.c);
    for (let n = 1; n <= 3; n++) assert.equal(await handler(s.message(n)), false);
    await handler(s.message(3));
    assert.equal(s.calls.length, 0);
    assert.equal(await handler(s.message(4)), true);
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].until, now + 600000);
    assert.equal(
      s.calls[0].reason,
      'Mention spam: 4 direct mentions of protected member within 10 minutes',
    );
    assert.equal(s.guard.get(g).last_result, 'completed');
    for (let n = 4; n <= 10; n++) await handler(s.message(n));
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('mentionguard ignores bot webhook edits self replyonly roleeveryone stale and off', async () => {
  const s = setup();
  try {
    s.guard.set(g, targetId, '1s');
    const handler = createMentionGuardHandler(s.c);
    for (const patch of [
      { author: { id: senderId, bot: true } },
      { webhookId: 'x' },
      { system: true },
      { editedTimestamp: now },
      { author: { id: targetId, bot: false } },
      { content: 'reply only' },
      { content: '<@&' + targetId + '> @everyone' },
      { createdTimestamp: now - 30000 },
      { createdTimestamp: now + 1 },
    ])
      await handler({ ...s.message(1), ...patch });
    assert.equal(s.db.prepare('SELECT count(*) n FROM mention_guard_messages').get().n, 0);
    s.guard.off(g);
    await handler(s.message(1));
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('mentionguard fresh native guard matrix existingtimeout unchanged no retry on ambiguous effect', async () => {
  for (const mutate of [
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.sender.permissions.has = () => true),
    (s) => (s.sender.moderatable = false),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.bot.roles = {}),
    (s) => (s.sender.id = ownerId),
    (s) => (s.sender.communicationDisabledUntilTimestamp = now + 1),
    (s) => (s.sender.communicationDisabledUntilTimestamp = undefined),
  ]) {
    const s = setup();
    try {
      s.guard.set(g, targetId, '1s');
      mutate(s);
      const handler = createMentionGuardHandler(s.c);
      for (let n = 1; n <= 5; n++) await handler(s.message(n));
      assert.equal(s.calls.length, 0);
      assert.equal(s.guard.get(g).last_result, 'skipped');
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    s.guard.set(g, targetId, '1s');
    s.sender.disableCommunicationUntil = async () => {
      s.calls.push('attempt');
      throw Error('network');
    };
    const handler = createMentionGuardHandler(s.c);
    for (let n = 1; n <= 6; n++) await handler(s.message(n));
    assert.equal(s.calls.length, 1);
    assert.equal(s.guard.get(g).last_result, 'uncertain');
    s.guard.recover();
    assert.equal(s.guard.get(g).last_result, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('mentionguard reservedrestart uncertain rollingwindow boundary and policy race block', async () => {
  const s = setup();
  try {
    s.guard.set(g, targetId, '1s');
    const saved = s.guard.get(g);
    for (let n = 1; n <= 4; n++) s.guard.count(s.message(n), saved);
    s.guard.recover();
    assert.equal(s.guard.get(g).last_result, 'uncertain');
    s.guard.set(g, targetId, '1s');
    const latest = s.guard.get(g);
    s.guard.now = () => now + 600000;
    assert.equal(s.guard.count(s.message(5), latest), false);
    assert.equal(s.db.prepare('SELECT count(*) n FROM mention_guard_messages').get().n, 1);
    s.guard.off(g);
    assert.equal(s.guard.count(s.message(6), latest), false);
  } finally {
    s.db.close();
  }
});
test('3mentionguardpaths directowner gate private3locale savedstatus no native action config fresh guards', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        guildId: g,
        user: { id: ownerId },
        guild: s.guild,
        client: { user: { id: botId } },
        appPermissions: { has: () => true },
        options: {
          getSubcommand: () => 'set',
          getUser: () => ({ id: senderId }),
          getString: () => '10m',
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(s.guard.get(g).target_id, senderId);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(s.calls.length, 0);
      for (const sub of ['status', 'off']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
      }
      assert.equal(s.guard.get(g).enabled, 0);
      i.user.id = senderId;
      await assert.rejects(() => command.execute(i, s.c), /ownerOnly/);
    } finally {
      s.db.close();
    }
  }
});
test('mentionguard config disable and policy revision race after fresh fetch prevents timeout', async () => {
  for (const change of [
    (s) => s.guard.off(g),
    (s) => s.guard.set(g, targetId, '2s'),
    (s) => (s.c.config.messageEventsEnabled = false),
  ]) {
    const s = setup();
    try {
      s.guard.set(g, targetId, '1s');
      const fetch = s.guild.members.fetch;
      s.guild.members.fetch = async (...args) => {
        change(s);
        return fetch(...args);
      };
      const handler = createMentionGuardHandler(s.c);
      for (let n = 1; n <= 4; n++) await handler(s.message(n));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('mentionguard window excludes exact10minute boundary and denied configset never changes policy', async () => {
  const s = setup();
  try {
    s.guard.set(g, targetId, '1s');
    const saved = s.guard.get(g);
    for (let n = 1; n <= 3; n++) assert.equal(s.guard.count(s.message(n), saved), false);
    s.guard.now = () => now + 600000;
    assert.equal(s.guard.count(s.message(4), saved), false);
    assert.equal(s.db.prepare('SELECT count(*) n FROM mention_guard_messages').get().n, 1);
    s.c.config.messageEventsEnabled = false;
    const i = { guildId: g, user: { id: ownerId }, options: { getSubcommand: () => 'set' } };
    await assert.rejects(() => command.execute(i, s.c), /mentionGuardEvents/);
    assert.equal(s.guard.get(g).duration_ms, 1000);
  } finally {
    s.db.close();
  }
});
