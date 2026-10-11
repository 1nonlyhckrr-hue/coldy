import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { ServerLogs } from '../src/services/logging.js';
import logging from '../src/commands/logging/logging.js';
import welcome from '../src/commands/welcomer/welcome.js';
import { makeGuild } from './helpers/guild.js';
function setup() {
  const db = openDatabase(':memory:'),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    s = makeGuild(),
    replies = [];
  s.guild.members.fetch = async () => ({
    id: '100000000000000002',
    permissions: { has: () => true },
    user: { username: 'Tester' },
    guild: s.guild,
  });
  const c = {
    guildConfig,
    config: { memberEventsEnabled: true },
    serverLogs: new ServerLogs(guildConfig, { warn: () => {} }),
  };
  let sub = 'config';
  const i = {
    guild: s.guild,
    guildId: 'g',
    user: { id: '100000000000000002' },
    deferReply: async () => {},
    editReply: async (v) => replies.push(v),
    options: {
      getSubcommand: () => sub,
      getChannel: () => ({ id: '100000000000000001' }),
      getString: () => 'Hello {user}',
      getBoolean: () => true,
    },
  };
  return { db, c, i, s, replies, setSub: (v) => (sub = v) };
}
test('logging setup, enable, config, test and disable persist', async () => {
  const x = setup();
  try {
    for (const sub of ['channel', 'enable', 'config', 'test', 'disable']) {
      x.setSub(sub);
      await logging.execute(x.i, x.c);
    }
    assert.equal(x.replies.length, 5);
    assert.equal(x.s.sent.length, 1);
    assert.equal(x.c.guildConfig.get('g').logging.enabled, false);
  } finally {
    x.db.close();
  }
});
test('welcome enable requires runtime member events and destination', async () => {
  const x = setup();
  try {
    x.setSub('enable');
    await assert.rejects(() => welcome.execute(x.i, x.c), /welcomeChannelRequired/);
    x.setSub('channel');
    await welcome.execute(x.i, x.c);
    x.c.config.memberEventsEnabled = false;
    x.setSub('enable');
    await assert.rejects(() => welcome.execute(x.i, x.c), /memberEventsDisabled/);
    x.c.config.memberEventsEnabled = true;
    for (const sub of ['message', 'enable', 'goodbye', 'test', 'config', 'disable']) {
      x.setSub(sub);
      await welcome.execute(x.i, x.c);
    }
    assert.equal(x.s.sent.length, 1);
    assert.equal(x.c.guildConfig.get('g').welcome.enabled, false);
    assert.equal(x.c.guildConfig.get('g').welcome.goodbyeEnabled, true);
  } finally {
    x.db.close();
  }
});
test('Hindi welcome and log configuration replies use localized embeds', async () => {
  const x = setup();
  try {
    x.c.guildConfig.setLanguage('g', 'hi');
    x.setSub('config');
    await welcome.execute(x.i, x.c);
    await logging.execute(x.i, x.c);
    assert.match(x.replies[0].embeds[0].data.description, /स्वागत/);
    assert.match(x.replies[1].embeds[0].data.description, /स्थिति/);
    assert.match(x.replies[0].embeds[0].data.footer.text, /सर्वर/);
  } finally {
    x.db.close();
  }
});
test('branded output channels require Embed Links permission', async () => {
  const { PermissionFlagsBits: P } = await import('discord.js');
  const { validateOutputChannel } = await import('../src/services/guildConfig.js');
  const x = setup();
  try {
    x.s.channel.permissionsFor = () => ({
      has: (permissions) => !permissions.includes(P.EmbedLinks),
    });
    await assert.rejects(
      () => validateOutputChannel(x.s.guild, '100000000000000001'),
      /channelPermissionMissing/,
    );
  } finally {
    x.db.close();
  }
});

test('logging event selection persists and enforces runtime plus current authority', async () => {
  const x = setup();
  try {
    x.setSub('event');
    x.i.options.getString = () => 'memberjoin';
    x.c.config.memberEventsEnabled = false;
    await assert.rejects(() => logging.execute(x.i, x.c), /logMemberRuntime/);
    x.c.config.memberEventsEnabled = true;
    await logging.execute(x.i, x.c);
    assert.deepEqual(x.c.guildConfig.get('g').logging.events, ['memberjoin']);
    x.i.options.getBoolean = () => false;
    await logging.execute(x.i, x.c);
    assert.deepEqual(x.c.guildConfig.get('g').logging.events, []);
    x.s.guild.members.fetch = async () => ({ permissions: { has: () => false } });
    await assert.rejects(() => logging.execute(x.i, x.c), /userPermission/);
  } finally {
    x.db.close();
  }
});

test('welcomer administration refetches current ManageGuild and rejects wrong identity', async () => {
  for (const actor of [
    { id: '100000000000000002', permissions: { has: () => false } },
    { id: 'other', permissions: { has: () => true } },
  ]) {
    const x = setup();
    x.setSub('disable');
    x.s.guild.members.fetch = async (options) => {
      assert.equal(options.force, true);
      return actor;
    };
    try {
      await assert.rejects(() => welcome.execute(x.i, x.c), /userPermission/);
      assert.equal(x.replies.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('welcomer test refuses destination changed while fetching current member', async () => {
  const x = setup();
  x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000001' });
  x.setSub('test');
  let n = 0;
  const fetch = x.s.guild.members.fetch;
  x.s.guild.members.fetch = async (...args) => {
    n++;
    if (n === 2) x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000009' });
    return fetch(...args);
  };
  try {
    await assert.rejects(() => welcome.execute(x.i, x.c), /welcomeChannelRequired/);
    assert.equal(x.s.sent.length, 0);
  } finally {
    x.db.close();
  }
});

test('welcome preview privately renders both templates across locales without channel/intents/enable', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    x.setSub('preview');
    x.c.config.memberEventsEnabled = false;
    x.c.guildConfig.setLanguage('g', locale);
    x.c.guildConfig.patch('g', 'welcome', {
      message: 'Verbatim {username} {count} @everyone',
      messageCustom: true,
      goodbyeMessage: 'Goodbye {username}',
      goodbyeCustom: true,
    });
    try {
      for (const kind of ['welcome', 'goodbye']) {
        x.i.options.getString = () => kind;
        await welcome.execute(x.i, x.c);
      }
      assert.equal(x.s.sent.length, 0);
      assert.equal(x.replies.length, 2);
      assert.match(x.replies[0].embeds[0].data.description, /Verbatim Tester 5 @everyone/);
      assert.match(x.replies[1].embeds[0].data.description, /Goodbye Tester/);
      for (const r of x.replies) assert.deepEqual(r.allowedMentions.parse, []);
    } finally {
      x.db.close();
    }
  }
});
test('welcome preview rejects invalid template kind and unavailable/wrong actor without output', async () => {
  const x = setup();
  x.setSub('preview');
  x.i.options.getString = () => 'invalid';
  try {
    await assert.rejects(() => welcome.execute(x.i, x.c), /unknownCommand/);
    assert.equal(x.replies.length, 0);
    x.i.options.getString = () => 'welcome';
    x.s.guild.members.fetch = async () => {
      throw new Error('unavailable');
    };
    await assert.rejects(() => welcome.execute(x.i, x.c));
    assert.equal(x.s.sent.length, 0);
  } finally {
    x.db.close();
  }
});

test('welcome color validates bounded hex,persists guild style and preview uses it without server sends', async () => {
  const x = setup();
  let hex = '#12aBcD';
  x.i.options.getString = () => hex;
  try {
    x.setSub('color');
    await welcome.execute(x.i, x.c);
    assert.equal(x.c.guildConfig.get('g').welcome.color, 0x12abcd);
    assert.equal(x.c.guildConfig.get('other').welcome.color, undefined);
    x.setSub('preview');
    x.i.options.getString = () => 'welcome';
    await welcome.execute(x.i, x.c);
    assert.equal(x.replies.at(-1).embeds[0].data.color, 0x12abcd);
    assert.equal(x.s.sent.length, 0);
    x.setSub('color');
    for (const v of ['GGGGGG', '12345', 'https://x', '-00001']) {
      x.i.options.getString = () => v;
      await assert.rejects(() => welcome.execute(x.i, x.c), /welcomeColorInvalid/);
    }
    x.i.options.getString = () => null;
    await welcome.execute(x.i, x.c);
    assert.equal(x.c.guildConfig.get('g').welcome.color, undefined);
  } finally {
    x.db.close();
  }
});

test('welcome test uses current persisted locale and color after async member refresh', async () => {
  const x = setup();
  let n = 0;
  x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000001' });
  x.setSub('test');
  const fetch = x.s.guild.members.fetch;
  x.s.guild.members.fetch = async (...args) => {
    if (++n === 2) {
      x.c.guildConfig.setLanguage('g', 'hi');
      x.c.guildConfig.patch('g', 'welcome', { color: 0 });
    }
    return fetch(...args);
  };
  try {
    await welcome.execute(x.i, x.c);
    assert.equal(x.s.sent.length, 1);
    assert.equal(x.s.sent[0].embeds[0].data.color, 0);
    assert.match(x.s.sent[0].embeds[0].data.footer.text, /सर्वर/);
  } finally {
    x.db.close();
  }
});
test('welcomer enabling refuses destination/runtime changes during channel validation', async () => {
  for (const sub of ['enable', 'goodbye'])
    for (const kind of ['destination', 'runtime']) {
      const x = setup();
      x.setSub(sub);
      x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000001' });
      const fetch = x.s.guild.channels.fetch;
      x.s.guild.channels.fetch = async (...args) => {
        if (kind === 'destination')
          x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000009' });
        else x.c.config.memberEventsEnabled = false;
        return fetch(...args);
      };
      try {
        await assert.rejects(() => welcome.execute(x.i, x.c));
        const cfg = x.c.guildConfig.get('g').welcome;
        assert.equal(cfg.enabled, false);
        assert.equal(cfg.goodbyeEnabled, false);
        assert.equal(x.s.sent.length, 0);
      } finally {
        x.db.close();
      }
    }
});

test('welcomer template reset is confirmed,localized and preserves all other delivery settings', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const kind of ['welcome', 'goodbye']) {
      const x = setup();
      x.c.guildConfig.setLanguage('g', locale);
      x.c.guildConfig.patch('g', 'welcome', {
        channelId: '100000000000000001',
        enabled: true,
        goodbyeEnabled: true,
        color: 0,
        message: 'CUSTOM WELCOME',
        messageCustom: true,
        goodbyeMessage: 'CUSTOM GOODBYE',
        goodbyeCustom: true,
      });
      x.setSub('resettemplate');
      let confirm = false;
      x.i.options.getString = () => kind;
      x.i.options.getBoolean = () => confirm;
      try {
        const before = x.c.guildConfig.get('g').welcome;
        await assert.rejects(() => welcome.execute(x.i, x.c), /welcomeResetConfirm/);
        assert.deepEqual(x.c.guildConfig.get('g').welcome, before);
        confirm = true;
        await welcome.execute(x.i, x.c);
        const after = x.c.guildConfig.get('g').welcome;
        for (const field of ['channelId', 'enabled', 'goodbyeEnabled', 'color'])
          assert.equal(after[field], before[field]);
        assert.equal(after[kind === 'welcome' ? 'messageCustom' : 'goodbyeCustom'], false);
        assert.equal(
          after[kind === 'welcome' ? 'goodbyeMessage' : 'message'],
          before[kind === 'welcome' ? 'goodbyeMessage' : 'message'],
        );
        assert.equal(x.s.sent.length, 0);
        x.setSub('preview');
        await welcome.execute(x.i, x.c);
        assert(!x.replies.at(-1).embeds[0].data.description.includes('CUSTOM'));
        assert.equal(x.replies.at(-1).embeds[0].data.color, 0);
        assert.deepEqual(x.replies.at(-1).allowedMentions.parse, []);
        assert.equal(x.c.guildConfig.get('other').welcome.messageCustom, undefined);
      } finally {
        x.db.close();
      }
    }
});
test('welcomer template reset refuses unknown kind or lost permission without overwriting custom text', async () => {
  const x = setup();
  x.c.guildConfig.patch('g', 'welcome', { message: 'keep', messageCustom: true });
  x.setSub('resettemplate');
  x.i.options.getBoolean = () => true;
  x.i.options.getString = () => 'invalid';
  try {
    await assert.rejects(() => welcome.execute(x.i, x.c), /unknownCommand/);
    x.i.options.getString = () => 'welcome';
    x.s.guild.members.fetch = async () => ({ id: x.i.user.id, permissions: { has: () => false } });
    await assert.rejects(() => welcome.execute(x.i, x.c), /userPermission/);
    assert.equal(x.c.guildConfig.get('g').welcome.message, 'keep');
    assert.equal(x.s.sent.length, 0);
  } finally {
    x.db.close();
  }
});

test('logging management refuses wrong current actor identity/guild without config disclosure or change', async () => {
  for (const kind of ['id', 'guild']) {
    const x = setup();
    x.setSub('config');
    x.s.guild.members.fetch = async () => ({
      id: kind === 'id' ? 'other' : x.i.user.id,
      guild: { id: kind === 'guild' ? 'other' : 'g' },
      permissions: { has: () => true },
    });
    try {
      await assert.rejects(() => logging.execute(x.i, x.c), /userPermission/);
      assert.equal(x.replies.length, 0);
      assert.equal(x.c.guildConfig.get('g').logging.enabled, false);
    } finally {
      x.db.close();
    }
  }
});
test('logging enable refuses destination or authority changes during asynchronous validation', async () => {
  for (const kind of ['destination', 'permission']) {
    const x = setup();
    x.setSub('enable');
    x.c.guildConfig.patch('g', 'logging', { channelId: '100000000000000001' });
    const fetch = x.s.guild.channels.fetch;
    let n = 0;
    const members = x.s.guild.members.fetch;
    x.s.guild.channels.fetch = async (...args) => {
      if (kind === 'destination')
        x.c.guildConfig.patch('g', 'logging', { channelId: '100000000000000009' });
      return fetch(...args);
    };
    x.s.guild.members.fetch = async (...args) => {
      const actor = await members(...args);
      if (++n === 2 && kind === 'permission') actor.permissions = { has: () => false };
      return actor;
    };
    try {
      await assert.rejects(() => logging.execute(x.i, x.c));
      assert.equal(x.c.guildConfig.get('g').logging.enabled, false);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('welcome checks exact member guild and repeats authority after destination awaits', async () => {
  for (const sub of ['channel', 'enable', 'goodbye', 'test'])
    for (const kind of ['guild', 'permissionRace']) {
      const x = setup();
      try {
        x.setSub(sub);
        x.c.guildConfig.patch('g', 'welcome', { channelId: '100000000000000001' });
        const before = x.c.guildConfig.get('g').welcome;
        const fetch = x.s.guild.members.fetch;
        let lost = false;
        x.s.guild.members.fetch = async () => {
          const m = await fetch();
          if (kind === 'guild') m.guild = { id: 'other' };
          if (lost) m.permissions = { has: () => false };
          return m;
        };
        const channelFetch = x.s.guild.channels.fetch;
        x.s.guild.channels.fetch = async (...a) => {
          lost = true;
          return channelFetch(...a);
        };
        await assert.rejects(() => welcome.execute(x.i, x.c), /userPermission/);
        assert.deepEqual(x.c.guildConfig.get('g').welcome, before);
        assert.equal(x.s.sent.length, 0);
      } finally {
        x.db.close();
      }
    }
});

test('logging destination config and test reread admin authority after native awaits', async () => {
  for (const sub of ['channel', 'test']) {
    const x = setup();
    try {
      x.setSub(sub);
      x.c.guildConfig.patch('g', 'logging', { enabled: true, channelId: '100000000000000001' });
      const before = x.c.guildConfig.get('g').logging;
      let lost = false;
      const fetch = x.s.guild.members.fetch;
      x.s.guild.members.fetch = async () => {
        const actor = await fetch();
        if (lost) actor.permissions = { has: () => false };
        return actor;
      };
      const channels = x.s.guild.channels.fetch;
      x.s.guild.channels.fetch = async (...args) => {
        lost = true;
        return channels(...args);
      };
      if (sub === 'channel')
        await assert.rejects(() => logging.execute(x.i, x.c), /userPermission/);
      else await logging.execute(x.i, x.c);
      assert.deepEqual(x.c.guildConfig.get('g').logging, before);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('welcome static titles persist separately,preview verbatim and reset without delivery changes', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      let kind = 'welcome',
        title = 'Our {server} title';
      x.i.options.getString = (k) => (k === 'kind' ? kind : title);
      x.setSub('title');
      await welcome.execute(x.i, x.c);
      kind = 'goodbye';
      title = 'See you';
      await welcome.execute(x.i, x.c);
      assert.equal(x.c.guildConfig.get('g').welcome.title, 'Our {server} title');
      x.setSub('preview');
      await welcome.execute(x.i, x.c);
      assert.equal(x.replies.at(-1).embeds[0].data.title, 'See you');
      kind = 'welcome';
      await welcome.execute(x.i, x.c);
      assert.equal(x.replies.at(-1).embeds[0].data.title, 'Our {server} title');
      x.setSub('title');
      for (const bad of [' ', '@everyone', 'a\nb', 'x'.repeat(121)]) {
        title = bad;
        await assert.rejects(() => welcome.execute(x.i, x.c), /welcomeTitleInvalid/);
      }
      title = null;
      await welcome.execute(x.i, x.c);
      assert.equal(x.c.guildConfig.get('g').welcome.title, undefined);
      assert.equal(x.c.guildConfig.get('g').welcome.goodbyeTitle, 'See you');
      assert.equal(x.c.guildConfig.get('g').welcome.enabled, false);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('member event messages use kind-specific stored title and preserve default footer/no-ping rules', async () => {
  const { createMemberMessageHandler } = await import('../src/events/memberMessages.js');
  const x = setup();
  try {
    x.c.logger = { warn: () => {} };
    x.c.guildConfig.patch('g', 'welcome', {
      channelId: '100000000000000001',
      enabled: true,
      goodbyeEnabled: true,
      title: 'Hello title',
      goodbyeTitle: 'Bye title',
    });
    const member = await x.s.guild.members.fetch();
    await createMemberMessageHandler(x.c, 'welcome')(member);
    await createMemberMessageHandler(x.c, 'goodbye')(member);
    assert.equal(x.s.sent[0].embeds[0].data.title, 'Hello title');
    assert.equal(x.s.sent[1].embeds[0].data.title, 'Bye title');
    assert(x.s.sent[0].embeds[0].data.footer.text);
    assert.deepEqual(x.s.sent[1].allowedMentions.users, []);
  } finally {
    x.db.close();
  }
});
