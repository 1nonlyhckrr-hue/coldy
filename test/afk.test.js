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
      guild: { members: { fetchMe: async () => ({}) } },
      channel: { permissionsFor: () => ({ has: () => true }), send: async (p) => sent.push(p) },
    };
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
    await h({ ...s.m, author: { id: 'away' }, createdTimestamp: 0 });
    assert(s.afk.get('g', 'away'));
    await h({ ...s.m, author: { id: 'away' }, webhookId: 'w' });
    assert(s.afk.get('g', 'away'));
    await h({ ...s.m, author: { id: 'away' }, mentions: { users: new Map() } });
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
          return {};
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
