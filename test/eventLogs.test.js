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
      members: { fetchMe: async () => ({}) },
      channels: {
        fetch: async () => ({
          guildId: 'g',
          type: ChannelType.GuildText,
          permissionsFor: () => ({ has: () => true }),
          send: async (p) => sent.push(p),
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
    for (const kind of LOG_EVENT_KINDS) {
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
