import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AfkStates, createAfkHandler } from '../src/services/afk.js';
import command from '../src/commands/utility/afk.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const db = openDatabase(':memory:'),
    sent = [],
    replies = [];
  let now = Date.now() - 1000;
  const afk = new AfkStates(db, () => now),
    c = {
      afk,
      config: { messageEventsEnabled: true },
      localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      logger: { warn: () => {} },
    },
    m = {
      id: '100000000000000001',
      guildId: 'g',
      channelId: 'c',
      author: { id: 'sender', bot: false },
      createdTimestamp: Date.now(),
      mentions: { users: new Map([['away', {}]]) },
      guild: {
        id: 'g',
        client: { user: { id: 'b' } },
        members: { fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }) },
      },
      channel: {
        id: 'c',
        guildId: 'g',
        type: 0,
        permissionsFor: () => ({ has: () => true }),
        send: async (p) => sent.push(p),
      },
    };
  m.guild.channels = { fetch: async () => m.channel };
  const i = {
    guildId: 'g',
    channelId: 'c',
    user: { id: 'away' },
    deferReply: async (p) => assert.equal(p.flags, 64),
    editReply: async (p) => replies.push(p),
  };
  return { db, afk, c, m, i, sent, replies, advance: (ms) => (now += ms) };
}
test('explicit status set/get/clear isolated per server and expires after7days', () => {
  const s = setup();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    assert.equal(s.afk.get('g', 'away').reason, 'Lunch');
    assert.equal(s.afk.get('other', 'away'), undefined);
    s.advance(7 * 86400000 + 1);
    assert.equal(s.afk.get('g', 'away'), undefined);
    for (const reason of ['', 'a\nb', 'a'.repeat(201)])
      assert.throws(() => s.afk.set('g', 'away', 'c', reason));
  } finally {
    s.db.close();
  }
});
test('notice only exact consented channel,current locale,no mention pings,replay/cooldown bounded', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      const h = createAfkHandler(s.c);
      await h({ ...s.m, channelId: 'other' });
      assert.equal(s.sent.length, 0);
      await h(s.m);
      assert.equal(s.sent.length, 1);
      assert.deepEqual(s.sent[0].allowedMentions.parse, []);
      assert.equal(
        s.sent[0].embeds[0].data.description,
        translate(locale, 'afkNotice', { user: 'away', reason: 'Lunch', minutes: 0 }),
      );
      await h(s.m);
      await h({ ...s.m, id: '100000000000000002' });
      assert.equal(s.sent.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('new own message clears status without sending a return announcement;stale/bot/webhook ignored', async () => {
  const s = setup();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    const h = createAfkHandler(s.c);
    await h({ ...s.m, author: { id: 'away', bot: true } });
    assert(s.afk.get('g', 'away'));
    await h({ ...s.m, author: { id: 'away', bot: false }, createdTimestamp: 0 });
    assert(s.afk.get('g', 'away'));
    await h({ ...s.m, author: { id: 'away', bot: false }, webhookId: 'w' });
    assert(s.afk.get('g', 'away'));
    await h({ ...s.m, author: { id: 'away', bot: false }, mentions: { users: new Map() } });
    assert.equal(s.afk.get('g', 'away'), undefined);
    assert.equal(s.sent.length, 0);
  } finally {
    s.db.close();
  }
});
test('permission/unknown send outcome and state changed during fetch never leak/retry notice', async () => {
  for (const kind of ['denied', 'unknown', 'clear']) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      const h = createAfkHandler(s.c);
      if (kind === 'denied') s.m.channel.permissionsFor = () => ({ has: () => false });
      if (kind === 'unknown')
        s.m.channel.send = async () => {
          s.sent.push({});
          throw new Error('SECRET');
        };
      if (kind === 'clear')
        s.m.guild.members.fetchMe = async () => {
          s.afk.clear('g', 'away');
          return { id: 'b', guild: { id: 'g' } };
        };
      await h(s.m);
      await h(s.m);
      assert.equal(s.sent.length, kind === 'unknown' ? 1 : 0);
    } finally {
      s.db.close();
    }
  }
});
test('AFK paths require runtime+reason disclosure confirmation and private localized output', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    try {
      let sub = 'set',
        share = false;
      s.i.options = { getSubcommand: () => sub, getBoolean: () => share, getString: () => 'Lunch' };
      await assert.rejects(() => command.execute(s.i, s.c), /afkShareConfirm/);
      share = true;
      s.c.config.messageEventsEnabled = false;
      await assert.rejects(() => command.execute(s.i, s.c), /responderRuntimeDisabled/);
      s.c.config.messageEventsEnabled = true;
      await command.execute(s.i, s.c);
      sub = 'status';
      await command.execute(s.i, s.c);
      sub = 'clear';
      await command.execute(s.i, s.c);
      assert.equal(s.replies.length, 3);
      assert.equal(s.afk.get('g', 'away'), undefined);
      for (const p of s.replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});

test('AFK notice forces exact channel and bot identity;invalid native/runtime state never reserves or sends', async () => {
  for (const kind of [
    'channel',
    'channelGuild',
    'channelType',
    'bot',
    'botGuild',
    'guild',
    'runtime',
  ]) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      const fresh = { ...s.m.channel };
      s.m.guild.channels.fetch = async (id, o) => {
        assert.equal(id, 'c');
        assert.deepEqual(o, { force: true });
        if (kind === 'runtime') s.c.config.messageEventsEnabled = false;
        return fresh;
      };
      if (kind === 'channel') fresh.id = 'wrong';
      if (kind === 'channelGuild') fresh.guildId = 'other';
      if (kind === 'channelType') fresh.type = 2;
      if (kind === 'guild') s.m.guild.id = 'other';
      if (kind === 'bot' || kind === 'botGuild')
        s.m.guild.members.fetchMe = async () => ({
          id: kind === 'bot' ? 'wrong' : 'b',
          guild: { id: kind === 'botGuild' ? 'other' : 'g' },
        });
      await createAfkHandler(s.c)(s.m);
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('AFK sends only through forced fresh destination;threads require SendMessagesInThreads', async () => {
  const { PermissionFlagsBits: P, ChannelType } = await import('discord.js');
  for (const thread of [false, true]) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      let freshSent = 0;
      s.m.channel.send = async () => {
        throw Error('must not use event channel');
      };
      const fresh = {
        id: 'c',
        guildId: 'g',
        type: thread ? ChannelType.PrivateThread : ChannelType.GuildText,
        isThread: () => thread,
        permissionsFor: () => ({
          has: (perms) => {
            assert(perms.includes(thread ? P.SendMessagesInThreads : P.SendMessages));
            return true;
          },
        }),
        send: async () => {
          freshSent++;
        },
      };
      s.m.guild.channels.fetch = async () => fresh;
      await createAfkHandler(s.c)(s.m);
      assert.equal(freshSent, 1);
    } finally {
      s.db.close();
    }
  }
});

test('AFK status cleared while native lookup waits does not consume notice quota', async () => {
  const s = setup();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    s.m.guild.members.fetchMe = async () => {
      s.afk.clear('g', 'away');
      return { id: 'b', guild: { id: 'g' } };
    };
    await createAfkHandler(s.c)(s.m);
    assert.equal(s.sent.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    s.afk.set('g', 'away', 'c', 'Back away');
    s.m.guild.members.fetchMe = async () => ({ id: 'b', guild: { id: 'g' } });
    await createAfkHandler(s.c)({ ...s.m, id: '100000000000000002' });
    assert.equal(s.sent.length, 1);
  } finally {
    s.db.close();
  }
});
test('AFK notice becomes stale or outside future tolerance during native lookup without reservation', async () => {
  for (const future of [false, true]) {
    const s = setup();
    let now = Date.now();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      s.m.createdTimestamp = future ? now : now - 299999;
      s.m.guild.members.fetchMe = async () => {
        now += future ? -300001 : 2;
        return { id: 'b', guild: { id: 'g' } };
      };
      await createAfkHandler(s.c, () => now)(s.m);
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
      assert(s.afk.get('g', 'away'));
    } finally {
      s.db.close();
    }
  }
});
test('AFK exact freshness boundary uses current reason only and changed reason does not consume quota', async () => {
  const s = setup();
  let now = Date.now();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    s.m.createdTimestamp = now - 299999;
    s.m.guild.members.fetchMe = async () => {
      now++;
      s.afk.set('g', 'away', 'c', 'Changed');
      return { id: 'b', guild: { id: 'g' } };
    };
    const h = createAfkHandler(s.c, () => now);
    await h(s.m);
    assert.equal(s.sent.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    s.m.guild.members.fetchMe = async () => ({ id: 'b', guild: { id: 'g' } });
    await h(s.m);
    assert.equal(s.sent.length, 1);
    assert.match(s.sent[0].embeds[0].data.description, /Changed/);
  } finally {
    s.db.close();
  }
});

test('AFK malformed truthy runtime flag cannot clear own state or disclose notice', async () => {
  for (const value of ['true', 'false', 1, {}, null]) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      s.c.config.messageEventsEnabled = value;
      await createAfkHandler(s.c)({ ...s.m, author: { id: 'away', bot: false } });
      assert(s.afk.get('g', 'away'));
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('AFK requires positively human author before clearing own consented state or disclosing notice', async () => {
  for (const flag of [undefined, null, 0, '', 'false', {}, true]) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      s.m.author = { id: 'away', bot: flag };
      await createAfkHandler(s.c)(s.m);
      assert.equal(s.afk.get('g', 'away').reason, 'Lunch');
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('AFK set refuses malformed runtime consent without saving reason or disclosure scope', async () => {
  for (const flag of [undefined, null, 1, 'true', 'false', {}]) {
    const s = setup();
    try {
      s.c.config.messageEventsEnabled = flag;
      s.i.options = {
        getSubcommand: () => 'set',
        getBoolean: () => true,
        getString: () => 'Lunch',
      };
      await assert.rejects(() => command.execute(s.i, s.c), /responderRuntimeDisabled/);
      assert.equal(s.afk.get('g', 'away'), undefined);
      assert.equal(s.replies.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('AFK invalid initial/final clock cannot disclose notice or reserve quota and initial invalid cannot clear own state', async () => {
  for (const value of [NaN, Infinity, -1, undefined, '123', null, 1.5]) {
    for (const stage of ['initial', 'final']) {
      const s = setup();
      let clock = stage === 'initial' ? value : Date.now();
      try {
        s.afk.set('g', 'away', 'c', 'Lunch');
        s.m.guild.members.fetchMe = async () => {
          clock = value;
          return { id: 'b', guild: { id: 'g' } };
        };
        await createAfkHandler(s.c, () => clock)(s.m);
        assert.equal(s.sent.length, 0);
        assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
        assert(s.afk.get('g', 'away'));
        if (stage === 'initial') {
          s.m.author = { id: 'away', bot: false };
          await createAfkHandler(s.c, () => clock)(s.m);
          assert(s.afk.get('g', 'away'));
        }
      } finally {
        s.db.close();
      }
    }
  }
});

test('AFK throwing clock at initial/final gate is contained with no notice,quota or own-state clearing', async () => {
  for (const stage of ['initial', 'final']) {
    const s = setup();
    let fail = stage === 'initial';
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      s.m.guild.members.fetchMe = async () => {
        fail = true;
        return { id: 'b', guild: { id: 'g' } };
      };
      const clock = () => {
        if (fail) throw new Error('SECRET_CLOCK');
        return Date.now();
      };
      await createAfkHandler(s.c, clock)(s.m);
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
      assert(s.afk.get('g', 'away'));
      s.m.author = { id: 'away', bot: false };
      await createAfkHandler(s.c, clock)(s.m);
      assert(s.afk.get('g', 'away'));
    } finally {
      s.db.close();
    }
  }
});

test('AFK post-lookup author/system/webhook changes cannot disclose or reserve quota', async () => {
  for (const change of [
    { author: { id: 'sender', bot: true } },
    { author: { id: 'sender' } },
    { system: true },
    { webhookId: 'hook' },
  ]) {
    const s = setup();
    try {
      s.afk.set('g', 'away', 'c', 'Lunch');
      s.m.guild.members.fetchMe = async () => {
        Object.assign(s.m, change);
        return { id: 'b', guild: { id: 'g' } };
      };
      await createAfkHandler(s.c)(s.m);
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('AFK own reason/move preserve expiry/scope and confirmed guild erasure retains notice guards', () => {
  const s = setup();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    s.afk.set('g', 'other', 'c', 'Secret');
    s.afk.set('other', 'away', 'foreign', 'Foreign');
    const created = s.afk.get('g', 'away').created_at;
    s.afk.reserve('event', 'g', 'c');
    s.advance(1000);
    s.afk.updateReason('g', 'away', 'New reason');
    s.afk.move('g', 'away', 'new');
    assert.equal(s.afk.get('g', 'away').created_at, created);
    assert.equal(s.afk.get('g', 'away').channel_id, 'new');
    assert.equal(s.afk.get('g', 'away').reason, 'New reason');
    assert.equal(s.afk.get('g', 'other').reason, 'Secret');
    assert.throws(() => s.afk.updateReason('g', 'missing', 'a'), /afkNotSet/);
    assert.throws(() => s.afk.move('g', 'missing', 'c'), /afkNotSet/);
    assert.equal(s.afk.clearAll('g'), 2);
    assert.equal(s.afk.clearAll('g'), 0);
    assert.equal(s.afk.get('other', 'away').reason, 'Foreign');
    assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 1);
    s.advance(7 * 86400000);
    assert.throws(() => s.afk.move('other', 'away', 'c'), /afkNotSet/);
  } finally {
    s.db.close();
  }
});
test('AFK edited/moved reasons disclose only latest exact channel;clearall during lookup suppresses notice', async () => {
  const s = setup();
  try {
    s.afk.set('g', 'away', 'c', 'Lunch');
    s.afk.updateReason('g', 'away', 'Updated');
    s.afk.move('g', 'away', 'new');
    const h = createAfkHandler(s.c);
    await h(s.m);
    assert.equal(s.sent.length, 0);
    s.m.channelId = 'new';
    s.m.channel.id = 'new';
    await h(s.m);
    assert.match(s.sent[0].embeds[0].data.description, /Updated/);
    s.m.id = '100000000000000002';
    s.m.guild.members.fetchMe = async () => {
      s.afk.clearAll('g');
      return { id: 'b', guild: { id: 'g' } };
    };
    await h(s.m);
    assert.equal(s.sent.length, 1);
    assert.equal(s.db.prepare('SELECT count(*) n FROM afk_notices').get().n, 1);
  } finally {
    s.db.close();
  }
});
test('AFK reason/move/clearall private3locale consent/currentidentity/exactchannel/recheck no native send', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    try {
      s.afk.set('g', 'away', 'old', 'Lunch');
      let sub = 'reason',
        share = false,
        confirm = false;
      const actor = { id: 'away', guild: { id: 'g' }, permissions: { has: () => true } };
      const channel = {
        id: 'c',
        guildId: 'g',
        type: 0,
        permissionsFor: () => ({ has: () => true }),
      };
      s.i.guild = {
        id: 'g',
        members: { fetch: async () => actor },
        channels: { fetch: async () => channel },
      };
      s.i.options = {
        getSubcommand: () => sub,
        getBoolean: (n) => (n === 'share' ? share : confirm),
        getString: () => 'Edited',
      };
      await assert.rejects(() => command.execute(s.i, s.c), /afkShareConfirm/);
      share = true;
      await command.execute(s.i, s.c);
      assert.equal(s.afk.get('g', 'away').reason, 'Edited');
      sub = 'move';
      channel.guildId = 'foreign';
      await assert.rejects(() => command.execute(s.i, s.c), /afkMoveDenied/);
      assert.equal(s.afk.get('g', 'away').channel_id, 'old');
      channel.guildId = 'g';
      await command.execute(s.i, s.c);
      assert.equal(s.afk.get('g', 'away').channel_id, 'c');
      s.i.guild.channels.fetch = async () => {
        actor.id = 'wrong';
        return channel;
      };
      await assert.rejects(() => command.execute(s.i, s.c), /userPermission/);
      actor.id = 'away';
      sub = 'clearall';
      await assert.rejects(() => command.execute(s.i, s.c), /afkClearConfirm/);
      confirm = true;
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(s.i, s.c), /userPermission/);
      actor.permissions.has = () => true;
      await command.execute(s.i, s.c);
      assert.equal(s.afk.get('g', 'away'), undefined);
      assert.equal(s.sent.length, 0);
      assert.equal(s.replies.length, 3);
      for (const p of s.replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});
