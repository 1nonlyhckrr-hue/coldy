import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import {
  EventLogDelivery,
  createMetadataLogHandler,
  LOG_EVENT_KINDS,
} from '../src/services/eventLogs.js';
import { Localization } from '../src/services/localization.js';
import { ChannelType } from 'discord.js';
function setup() {
  const db = openDatabase(':memory:'),
    sent = [],
    guildConfig = new GuildConfig(new GuildSettings(db));
  guildConfig.patch('g', 'logging', {
    enabled: true,
    channelId: '100000000000000001',
    events: LOG_EVENT_KINDS,
  });
  const guild = {
      id: 'g',
      client: { user: { id: 'b' } },
      members: { fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }) },
      channels: {
        fetch: async () => ({
          id: '100000000000000001',
          guildId: 'g',
          type: ChannelType.GuildText,
          permissionsFor: () => ({ has: () => true }),
          send: async (p) => {
            sent.push(p);
            return { id: 'native-message' };
          },
        }),
      },
    },
    c = {
      guildConfig,
      eventLogs: new EventLogDelivery(db),
      localization: new Localization(guildConfig),
      logger: { warn() {} },
    };
  return { db, sent, guild, c };
}
test('six event handlers send only metadata with localization and replay guard', async () => {
  const s = setup();
  try {
    s.c.guildConfig.setLanguage('g', 'hi');
    for (const kind of LOG_EVENT_KINDS.filter(
      (k) => !['roleupdate', 'channelupdate'].includes(k),
    )) {
      const h = createMetadataLogHandler(s.c, kind);
      await h({
        guild: s.guild,
        id: '100000000000000002',
        name: 'PRIVATE',
        content: 'SECRET',
        joinedTimestamp: 10,
      });
      await h({ guild: s.guild, id: '100000000000000002', joinedTimestamp: 10 });
    }
    assert.equal(s.sent.length, 6);
    for (const p of s.sent) {
      assert.deepEqual(p.allowedMentions.parse, []);
      assert(!JSON.stringify(p).includes('SECRET'));
      assert(!JSON.stringify(p).includes('PRIVATE'));
      assert.match(p.embeds[0].data.description, /अज्ञात/);
    }
  } finally {
    s.db.close();
  }
});
test('unselected/disabled/foreign configuration never sends', async () => {
  const s = setup();
  try {
    s.c.guildConfig.patch('g', 'logging', { events: [] });
    await createMetadataLogHandler(s.c, 'rolecreate')({ guild: s.guild, id: 'r' });
    s.c.guildConfig.patch('g', 'logging', { events: ['rolecreate'], enabled: false });
    await createMetadataLogHandler(s.c, 'rolecreate')({ guild: s.guild, id: 'r' });
    assert.equal(s.sent.length, 0);
  } finally {
    s.db.close();
  }
});
test('rate bound allows20 reservations per minute and releases at window boundary', () => {
  const s = setup();
  try {
    for (let n = 0; n < 20; n++) assert(s.c.eventLogs.reserve(`k${n}`, 'g', 100000));
    assert.equal(s.c.eventLogs.reserve('extra', 'g', 100000), false);
    assert.equal(s.c.eventLogs.reserve('k1', 'g', 200000), false);
    assert(s.c.eventLogs.reserve('extra', 'g', 200000));
  } finally {
    s.db.close();
  }
});
test('unavailable channel and uncertain sends never retry on replay', async () => {
  for (const missing of [true, false]) {
    const s = setup();
    let count = 0;
    s.guild.channels.fetch = async () =>
      missing
        ? null
        : {
            id: '100000000000000001',
            guildId: 'g',
            type: ChannelType.GuildText,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {
              count++;
              throw new Error('SECRET');
            },
          };
    try {
      const h = createMetadataLogHandler(s.c, 'rolecreate');
      await h({ guild: s.guild, id: 'r' });
      await h({ guild: s.guild, id: 'r' });
      assert.equal(count, missing ? 0 : 1);
      assert.equal(
        s.db.prepare('SELECT status FROM event_log_deliveries').get().status,
        missing ? 'unavailable' : 'uncertain',
      );
    } finally {
      s.db.close();
    }
  }
});
test('event reservations recover uncertain and expire after30 days', () => {
  const s = setup();
  try {
    s.c.eventLogs.reserve('one', 'g', 1);
    s.c.eventLogs.recover();
    assert.equal(s.db.prepare('SELECT status FROM event_log_deliveries').get().status, 'uncertain');
    s.c.eventLogs.cleanup(31 * 86400000);
    assert.equal(s.db.prepare('SELECT count(*) n FROM event_log_deliveries').get().n, 0);
  } finally {
    s.db.close();
  }
});

test('metadata destination or event consent changed during native channel fetch blocks stale send', async () => {
  for (const change of [
    (s) => s.c.guildConfig.patch('g', 'logging', { enabled: false }),
    (s) => s.c.guildConfig.patch('g', 'logging', { events: [] }),
    (s) => s.c.guildConfig.patch('g', 'logging', { channelId: '100000000000000009' }),
  ]) {
    const s = setup(),
      fetch = s.guild.channels.fetch;
    s.guild.channels.fetch = async (...args) => {
      change(s);
      return fetch(...args);
    };
    try {
      await createMetadataLogHandler(s.c, 'rolecreate')({ guild: s.guild, id: 'r' });
      assert.equal(s.sent.length, 0);
      assert.equal(
        s.db.prepare('SELECT status FROM event_log_deliveries').get().status,
        'unavailable',
      );
    } finally {
      s.db.close();
    }
  }
});
test('case log destination consent changed during fetch blocks stale send', async () => {
  const { ServerLogs } = await import('../src/services/logging.js');
  for (const change of [
    (s) => s.c.guildConfig.patch('g', 'logging', { enabled: false }),
    (s) => s.c.guildConfig.patch('g', 'logging', { channelId: '100000000000000009' }),
  ]) {
    const s = setup(),
      fetch = s.guild.channels.fetch;
    s.guild.channels.fetch = async (...args) => {
      change(s);
      return fetch(...args);
    };
    try {
      const result = await new ServerLogs(s.c.guildConfig, s.c.logger).emit(s.guild, {
        kind: 'case',
      });
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'changed');
      assert.equal(s.sent.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('role update logs distinct reviewed changes as metadata only with replay and no-op suppression', async () => {
  const { createRoleUpdateLogHandler } = await import('../src/services/eventLogs.js');
  const s = setup();
  const old = {
    id: '100000000000000002',
    guild: s.guild,
    name: 'PRIVATE OLD',
    permissions: { bitfield: 0n },
    position: 2,
    colors: { primaryColor: 0 },
    hoist: false,
    mentionable: false,
    managed: false,
  };
  const after = { ...old, name: 'PRIVATE NEW' },
    next = { ...after, permissions: { bitfield: 8n } };
  try {
    const h = createRoleUpdateLogHandler(s.c);
    await h(old, old);
    assert.equal(s.sent.length, 0);
    await h(old, after);
    await h(old, after);
    await h(after, next);
    assert.equal(s.sent.length, 2);
    for (const p of s.sent) {
      assert(!JSON.stringify(p).includes('PRIVATE'));
      assert.deepEqual(p.allowedMentions.parse, []);
    }
    assert(
      !JSON.stringify(s.db.prepare('SELECT * FROM event_log_deliveries').all()).includes('PRIVATE'),
    );
    await h(old, { ...after, id: 'other' });
    await h(old, { ...after, guild: { id: 'other' } });
    assert.equal(s.sent.length, 2);
  } finally {
    s.db.close();
  }
});
test('role update events require explicit opt-in and preserve metadata no-ping across locales', async () => {
  const { createRoleUpdateLogHandler } = await import('../src/services/eventLogs.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    s.c.guildConfig.setLanguage('g', locale);
    const old = {
        id: 'r',
        guild: s.guild,
        name: 'old',
        permissions: { bitfield: 0n },
        position: 1,
        colors: { primaryColor: 0 },
        hoist: false,
        mentionable: false,
        managed: false,
      },
      after = { ...old, name: 'new' };
    try {
      s.c.guildConfig.patch('g', 'logging', { events: [] });
      await createRoleUpdateLogHandler(s.c)(old, after);
      assert.equal(s.sent.length, 0);
      s.c.guildConfig.patch('g', 'logging', { events: ['roleupdate'] });
      await createRoleUpdateLogHandler(s.c)(old, after);
      assert.equal(s.sent.length, 1);
      assert.deepEqual(s.sent[0].allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});

test('logging event metadata exposes exactly eight unique opted-in kinds', async () => {
  const { default: command } = await import('../src/commands/logging/logging.js');
  const choices = command.data
    .toJSON()
    .options.find((s) => s.name === 'event')
    .options.find((o) => o.name === 'kind')
    .choices.map((o) => o.value);
  assert.equal(choices.length, 8);
  assert.equal(new Set(choices).size, 8);
  assert.deepEqual([...choices].sort(), [...LOG_EVENT_KINDS].sort());
});

test('role update incomplete snapshots fail closed and stored receipts use ephemeral keyed hashes', async () => {
  const s = setup();
  const { createRoleUpdateLogHandler } = await import('../src/services/eventLogs.js');
  const old = {
      id: 'r',
      guild: s.guild,
      name: 'old',
      permissions: { bitfield: 0n },
      position: 1,
      colors: { primaryColor: 0 },
      hoist: false,
      mentionable: false,
      managed: false,
    },
    after = { ...old, name: 'new' };
  try {
    const one = createRoleUpdateLogHandler(s.c);
    await one({ ...old, permissions: undefined }, after);
    await one(old, { ...after, name: undefined });
    assert.equal(s.sent.length, 0);
    await one(old, after);
    const first = s.db.prepare('SELECT event_key FROM event_log_deliveries').get().event_key;
    await one(old, after);
    assert.equal(s.sent.length, 1);
    await createRoleUpdateLogHandler(s.c)(old, after);
    assert.equal(s.sent.length, 2);
    const keys = s.db
      .prepare('SELECT event_key FROM event_log_deliveries')
      .all()
      .map((r) => r.event_key);
    assert.equal(new Set(keys).size, 2);
    assert(keys.every((k) => !k.includes('old') && !k.includes('new')));
    assert(first.includes('roleupdate'));
  } finally {
    s.db.close();
  }
});

test('channel update logs opt-in reviewed metadata only,with keyed replay and no private names/topic/overwrites', async () => {
  const { createChannelUpdateLogHandler } = await import('../src/services/eventLogs.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.setLanguage('g', locale);
      const old = {
          id: 'channel',
          guild: s.guild,
          name: 'SECRET_OLD',
          type: 0,
          rawPosition: 1,
          parentId: null,
          nsfw: false,
          topic: 'PRIVATE_TOPIC',
          permissionOverwrites: { secret: 'OVERWRITES' },
        },
        after = { ...old, name: 'SECRET_NEW' };
      s.c.guildConfig.patch('g', 'logging', { events: [] });
      const h = createChannelUpdateLogHandler(s.c);
      await h(old, after);
      assert.equal(s.sent.length, 0);
      s.c.guildConfig.patch('g', 'logging', { events: ['channelupdate'] });
      await h(old, after);
      await h(old, after);
      assert.equal(s.sent.length, 1);
      for (const secret of ['SECRET_OLD', 'SECRET_NEW', 'PRIVATE_TOPIC', 'OVERWRITES'])
        assert(!JSON.stringify(s.sent).includes(secret));
      const key = s.db.prepare('SELECT event_key FROM event_log_deliveries').get().event_key;
      assert.match(key, /channelupdate:channel:[a-f0-9]{32}$/);
      assert(!key.includes('SECRET'));
      await h(after, { ...after, topic: 'OTHER_TOPIC' });
      assert.equal(s.sent.length, 1);
      await h(after, { ...after, rawPosition: 2 });
      assert.equal(s.sent.length, 2);
    } finally {
      s.db.close();
    }
  }
});
test('channel update rejects foreign/incomplete/no-op native snapshots without event receipts', async () => {
  const { createChannelUpdateLogHandler } = await import('../src/services/eventLogs.js');
  for (const kind of ['guild', 'id', 'missing', 'noop']) {
    const s = setup();
    try {
      const old = {
          id: 'channel',
          guild: s.guild,
          name: 'old',
          type: 0,
          rawPosition: 1,
          parentId: null,
          nsfw: false,
        },
        after = { ...old, name: 'new' };
      if (kind === 'guild') after.guild = { id: 'foreign' };
      if (kind === 'id') after.id = 'other';
      if (kind === 'missing') delete after.nsfw;
      if (kind === 'noop') after.name = 'old';
      await createChannelUpdateLogHandler(s.c)(old, after);
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM event_log_deliveries').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('event delivery completion requires exactly one reserved receipt and preserves terminal state', () => {
  const s = setup();
  try {
    assert.equal(s.c.eventLogs.finish('missing', 'sent'), false);
    s.c.eventLogs.reserve('receipt', 'g');
    assert.equal(s.c.eventLogs.finish('receipt', 'sent'), true);
    for (const status of ['sent', 'uncertain', 'unavailable'])
      assert.equal(s.c.eventLogs.finish('receipt', status), false);
    assert.equal(s.db.prepare('SELECT status FROM event_log_deliveries').get().status, 'sent');
    assert.throws(() => s.c.eventLogs.finish('receipt', 'invalid'), TypeError);
  } finally {
    s.db.close();
  }
});
test('accepted metadata send without nonempty string native identity stays uncertain and never replays', async () => {
  for (const returned of [undefined, {}, { id: 0 }, { id: '' }, { id: '  ' }]) {
    const s = setup();
    try {
      const fetch = s.guild.channels.fetch;
      let calls = 0;
      s.guild.channels.fetch = async (...a) => {
        const channel = await fetch(...a);
        channel.send = async () => {
          calls++;
          return returned;
        };
        return channel;
      };
      const h = createMetadataLogHandler(s.c, 'rolecreate');
      await h({ guild: s.guild, id: 'role' });
      await h({ guild: s.guild, id: 'role' });
      assert.equal(calls, 1);
      assert.equal(
        s.db.prepare('SELECT status FROM event_log_deliveries').get().status,
        'uncertain',
      );
    } finally {
      s.db.close();
    }
  }
});
test('metadata send with accepted native identity completes reserved receipt once', async () => {
  const s = setup();
  try {
    await createMetadataLogHandler(s.c, 'channelcreate')({ guild: s.guild, id: 'channel' });
    assert.equal(s.sent.length, 1);
    assert.equal(s.db.prepare('SELECT status FROM event_log_deliveries').get().status, 'sent');
  } finally {
    s.db.close();
  }
});
