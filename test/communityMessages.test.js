import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { ServerLogs } from '../src/services/logging.js';
import { createMemberMessageHandler } from '../src/events/memberMessages.js';
import { makeGuild } from './helpers/guild.js';
const logger = { warn: () => {} };
test('logs disabled by default, enabled logs omit content/reasons and suppress pings', async () => {
  const db = openDatabase(':memory:');
  try {
    const c = new GuildConfig(new GuildSettings(db)),
      s = makeGuild(),
      logs = new ServerLogs(c, logger);
    assert.equal((await logs.emit(s.guild, { kind: 'test' })).reason, 'disabled');
    c.patch('g', 'logging', { enabled: true, channelId: '100000000000000001' });
    assert(
      (
        await logs.emit(s.guild, {
          kind: 'moderation',
          action: 'ban',
          reason: 'PRIVATE',
          content: 'PRIVATE',
        })
      ).sent,
    );
    assert(!s.sent[0].embeds[0].data.description.includes('PRIVATE'));
    assert.deepEqual(s.sent[0].allowedMentions, { parse: [] });
    s.guild.channels.fetch = async () => null;
    assert.equal((await logs.emit(s.guild, { kind: 'test' })).reason, 'unavailable');
  } finally {
    db.close();
  }
});
test('welcome and goodbye are separately gated, mentions narrowly allowed, failures contained', async () => {
  const db = openDatabase(':memory:');
  try {
    const guildConfig = new GuildConfig(new GuildSettings(db)),
      s = makeGuild();
    const member = { id: '100000000000000001', user: { username: 'U' }, guild: s.guild };
    const context = { guildConfig, logger };
    await createMemberMessageHandler(context, 'welcome')(member);
    assert.equal(s.sent.length, 0);
    guildConfig.patch('g', 'welcome', {
      enabled: true,
      channelId: '100000000000000001',
      message: 'Hi {user} @everyone',
    });
    await createMemberMessageHandler(context, 'welcome')(member);
    assert.deepEqual(s.sent[0].allowedMentions, { parse: [], users: [member.id] });
    await createMemberMessageHandler(context, 'goodbye')(member);
    assert.equal(s.sent.length, 1);
    guildConfig.patch('g', 'welcome', { goodbyeEnabled: true });
    await createMemberMessageHandler(context, 'goodbye')(member);
    assert.deepEqual(s.sent[1].allowedMentions.users, []);
    s.channel.send = async () => {
      throw new Error('no channel');
    };
    await assert.doesNotReject(() => createMemberMessageHandler(context, 'welcome')(member));
  } finally {
    db.close();
  }
});
