import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MessageRanks, createMessageRankHandler, utcDay } from '../src/services/leaderboard.js';
import command from '../src/commands/leaderboard/leaderboard.js';
import { translate } from '../src/services/localization.js';
import { ChannelType } from 'discord.js';
const now = Date.parse('2026-10-11T12:00:00Z'),
  user = '100000000000000001',
  channel = '100000000000000002';
const message = (n = 1, extra = {}) => ({
  id: String(100000000000000100n + BigInt(n)),
  guildId: 'g',
  author: { id: user, bot: false },
  channelId: channel,
  createdTimestamp: now,
  ...extra,
});
test('ranks off by default, enabled future counts are replay safe and guild scoped', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    assert.equal(r.record(message(), now), false);
    r.enable('g', true);
    assert(r.record(message(), now));
    assert.equal(r.record(message(), now), false);
    assert.equal(r.stats('g', user, now).today, 1);
    assert.equal(r.stats('other', user, now).today, 0);
    r.enable('g', false);
    assert.equal(r.record(message(2), now), false);
  } finally {
    db.close();
  }
});
test('bots, webhooks, stale/future and invalid event ids are ignored', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    for (const extra of [
      { author: { id: user, bot: true } },
      { webhookId: 'hook' },
      { guildId: null },
      { id: 'bad' },
      { createdTimestamp: now - 300001 },
      { createdTimestamp: now + 30001 },
      { createdTimestamp: NaN },
    ])
      assert.equal(r.record(message(1, extra), now), false);
    assert.equal(r.stats('g', user, now).retained, 0);
  } finally {
    db.close();
  }
});
test('exclusions apply to channel, category and thread ancestor with bounded config', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    r.exclude('g', channel, true);
    assert.equal(r.record(message(), now), false);
    r.exclude('g', channel, false);
    r.exclude('g', '100000000000000003', true);
    assert.equal(r.record(message(1, { channel: { parentId: '100000000000000003' } }), now), false);
    assert.equal(
      r.record(message(2, { channel: { parent: { parentId: '100000000000000003' } } }), now),
      false,
    );
    for (let n = 4; n < 53; n++) r.exclude('g', String(100000000000000000n + BigInt(n)), true);
    assert.throws(() => r.exclude('g', '100000000000000999', true));
  } finally {
    db.close();
  }
});
test('UTC calendar ranges, tie sorting and pagination are deterministic', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    assert.equal(utcDay(now), '2026-10-11');
    for (let n = 0; n < 11; n++)
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
        'g',
        String(100000000000000000n + BigInt(n)),
        '2026-10-11',
        2,
      );
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run('g', user, '2026-10-05', 5);
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run('g', user, '2026-10-04', 7);
    assert.deepEqual(r.stats('g', user, now), { today: 2, week: 7, retained: 14 });
    const top = r.top('g', 'today', 1, now);
    assert.equal(top.rows[0].user_id, '100000000000000000');
    assert.equal(top.pages, 2);
    assert.equal(r.top('g', 'today', 2, now).rows.length, 1);
    for (const page of [0, 3, 1.5, 1001]) assert.throws(() => r.top('g', 'today', page, now));
    assert.throws(() => r.top('g', 'all', 1, now));
  } finally {
    db.close();
  }
});
test('retention clears older days/replay ids, resetmine leaves other users and replay guard', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    r.record(message(), now);
    r.record(message(2, { author: { id: '100000000000000009', bot: false } }), now);
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run('g', user, '2026-01-01', 3);
    db.prepare('INSERT INTO message_rank_seen VALUES(?,?)').run('old', now - 8 * 86400000);
    r.cleanup(now);
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 2);
    r.resetMine('g', user);
    assert.equal(r.record(message(), now), false);
    assert.equal(r.stats('g', user, now).retained, 0);
    assert.equal(r.stats('g', '100000000000000009', now).retained, 1);
  } finally {
    db.close();
  }
});
test('per-user daily contribution limit and transaction failure do not partly record', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,10000)').run('g', user, utcDay(now));
    assert.equal(r.record(message(), now), false);
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 0);
    db.exec('DROP TABLE message_rank_daily');
    assert.throws(() => r.record(message(), now));
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 0);
  } finally {
    db.close();
  }
});
test('message handler contains storage failure without logging content', () => {
  let warning;
  const c = {
    messageRanks: {
      record() {
        throw new Error('SECRET');
      },
    },
    logger: { warn: (...args) => (warning = args) },
  };
  createMessageRankHandler(c)({ ...message(), content: 'SECRET' });
  assert(!JSON.stringify(warning).includes('SECRET'));
});
test('all seven leaderboard commands execute localized private replies', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new MessageRanks(db),
        replies = [],
        c = {
          messageRanks: r,
          config: { messageEventsEnabled: true },
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      let sub = 'enable';
      const i = {
        guildId: 'g',
        user: { id: user },
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({ id: user, guild: { id: 'g' }, permissions: { has: () => true } }),
          },
          channels: {
            fetch: async () => ({ id: channel, guildId: 'g', type: ChannelType.GuildText }),
          },
        },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => sub,
          getString: () => 'week',
          getInteger: () => 1,
          getChannel: () => ({ id: channel }),
          getBoolean: () => true,
        },
      };
      for (const action of [
        'enable',
        'exclude',
        'config',
        'stats',
        'top',
        'resetmine',
        'disable',
      ]) {
        sub = action;
        await command.execute(i, c);
      }
      assert.equal(replies.length, 7);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      db.close();
    }
  }
});
test('leaderboard configuration fresh authorization/runtime gate and foreign channel fail', async () => {
  const db = openDatabase(':memory:');
  try {
    const c = {
      messageRanks: new MessageRanks(db),
      config: { messageEventsEnabled: false },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
    let sub = 'enable';
    const i = {
      guildId: 'g',
      user: { id: user },
      deferReply: async () => {},
      guild: {
        id: 'g',
        members: {
          fetch: async () => ({ id: user, guild: { id: 'g' }, permissions: { has: () => true } }),
        },
        channels: {
          fetch: async () => ({ id: channel, guildId: 'other', type: ChannelType.GuildText }),
        },
      },
      options: {
        getSubcommand: () => sub,
        getChannel: () => ({ id: channel }),
        getBoolean: () => true,
      },
    };
    await assert.rejects(() => command.execute(i, c), /responderRuntimeDisabled/);
    sub = 'exclude';
    await assert.rejects(() => command.execute(i, c), /rankChannelInvalid/);
    i.guild.members.fetch = async () => ({
      id: user,
      guild: { id: 'g' },
      permissions: { has: () => false },
    });
    await assert.rejects(() => command.execute(i, c), /userPermission/);
  } finally {
    db.close();
  }
});

test('message counts and opt-in config survive restart with duplicate protection', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-ranks-')),
    path = join(dir, 'db');
  try {
    let db = openDatabase(path),
      r = new MessageRanks(db);
    r.enable('g', true);
    r.record(message(), now);
    db.close();
    db = openDatabase(path);
    r = new MessageRanks(db);
    assert.equal(r.config('g').enabled, true);
    assert.equal(r.stats('g', user, now).today, 1);
    assert.equal(r.record(message(), now), false);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('optout erases only own server counts, survives config toggles, optin never restores past data', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    r.record(message(), now);
    r.record(message(2, { author: { id: '100000000000000009', bot: false } }), now);
    r.enable('other', true);
    r.record(message(3, { guildId: 'other' }), now);
    assert.equal(r.privacy('g', user, true), 1);
    assert(r.optedOut('g', user));
    assert.equal(r.record(message(4), now), false);
    r.enable('g', false);
    r.enable('g', true);
    assert.equal(r.record(message(5), now), false);
    assert.equal(r.stats('other', user, now).retained, 1);
    assert.equal(r.stats('g', '100000000000000009', now).retained, 1);
    assert.equal(r.top('g', 'retained', 1, now).rows.length, 1);
    r.privacy('g', user, false);
    assert.equal(r.stats('g', user, now).retained, 0);
    assert(r.record(message(6), now));
  } finally {
    db.close();
  }
});
test('optout setting and erase transaction rolls back together on failed deletion', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    db.exec('DROP TABLE message_rank_daily');
    assert.throws(() => r.privacy('g', user, true));
    assert(!r.optedOut('g', user));
    assert.throws(() => r.privacy('g', 'invalid', true));
    assert.throws(() => r.privacy('g', user, 1));
  } finally {
    db.close();
  }
});
test('privacy and admin erase paths respond locally in all languages; confirm and fresh authorization enforced', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new MessageRanks(db),
        replies = [],
        c = {
          messageRanks: r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      let sub = 'optout',
        allowed = true,
        confirm = true;
      const i = {
        guildId: 'g',
        user: { id: user },
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({
              id: user,
              guild: { id: 'g' },
              permissions: { has: () => allowed },
            }),
          },
        },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => sub,
          getBoolean: () => confirm,
          getUser: () => ({ id: user }),
        },
      };
      await command.execute(i, c);
      assert(r.optedOut('g', user));
      sub = 'optin';
      await command.execute(i, c);
      assert(!r.optedOut('g', user));
      r.privacy('g', user, true);
      sub = 'eraseuser';
      allowed = false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
      allowed = true;
      confirm = false;
      await assert.rejects(() => command.execute(i, c), /rankEraseConfirm/);
      confirm = true;
      await command.execute(i, c);
      assert(r.optedOut('g', user));
      assert.equal(replies.length, 3);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      db.close();
    }
  }
});
test('persistent personal privacy preference survives reopening', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-privacy-')),
    path = join(dir, 'db');
  try {
    let db = openDatabase(path);
    new MessageRanks(db).privacy('g', user, true);
    db.close();
    db = openDatabase(path);
    const r = new MessageRanks(db);
    r.enable('g', true);
    assert(r.optedOut('g', user));
    assert.equal(r.record(message(), now), false);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('personal rank uses same UTC window and user-ID tie order without returning other member records', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db),
      put = db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)');
    put.run('g', user, '2026-10-11', 5);
    put.run('g', '100000000000000000', '2026-10-11', 5);
    put.run('g', '100000000000000003', '2026-10-11', 6);
    put.run('g', '100000000000000004', '2026-10-01', 100);
    put.run('other', user, '2026-10-11', 100);
    assert.deepEqual(r.position('g', user, 'week', now), { position: 3, total: 5 });
    assert.deepEqual(r.position('g', user, 'retained', now), { position: 4, total: 5 });
    assert.deepEqual(r.position('g', 'missing', 'week', now), { position: null, total: 0 });
    assert.throws(() => r.position('g', user, 'invalid', now), /rankPeriodInvalid/);
  } finally {
    db.close();
  }
});
test('personal position slash is private localized and shows no other IDs', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new MessageRanks(db),
        replies = [];
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
        'g',
        user,
        utcDay(Date.now()),
        3,
      );
      const i = {
        guildId: 'g',
        user: { id: user },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => replies.push(p),
        options: { getSubcommand: () => 'position', getString: () => 'today' },
      };
      const c = {
        messageRanks: r,
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      await command.execute(i, c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(replies[0].embeds[0].data.description.includes('3'));
      assert(!replies[0].embeds[0].data.description.includes(user));
    } finally {
      db.close();
    }
  }
});

test('leaderboard admin rejects mismatched current actor and guild before storage writes', async () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db),
      c = {
        messageRanks: r,
        config: { messageEventsEnabled: true },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    for (const sub of ['enable', 'disable', 'exclude', 'eraseuser'])
      for (const bad of [
        { id: 'wrong', guild: { id: 'g' } },
        { id: user, guild: { id: 'other' } },
        { id: user, guild: { id: 'g' }, wrongGuild: true },
      ]) {
        const i = {
          guildId: 'g',
          user: { id: user },
          deferReply: async () => {},
          options: { getSubcommand: () => sub },
          guild: {
            id: bad.wrongGuild ? 'other' : 'g',
            members: {
              fetch: async (opts) => {
                assert.deepEqual(opts, { user, force: true });
                return { ...bad, permissions: { has: () => true } };
              },
            },
          },
        };
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      }
    assert.equal(r.config('g').enabled, false);
    assert.deepEqual(r.config('g').excluded, []);
  } finally {
    db.close();
  }
});
test('leaderboard exclusion forces exact channel and rechecks actor after fetch', async () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db),
      c = {
        messageRanks: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    let calls = 0,
      wrong = true,
      lost = false;
    const i = {
      guildId: 'g',
      user: { id: user },
      deferReply: async () => {},
      editReply: async () => {},
      options: {
        getSubcommand: () => 'exclude',
        getChannel: () => ({ id: channel }),
        getBoolean: () => true,
      },
      guild: {
        id: 'g',
        members: {
          fetch: async () => ({
            id: user,
            guild: { id: 'g' },
            permissions: { has: () => !(lost && ++calls > 1) },
          }),
        },
        channels: {
          fetch: async (id, opts) => {
            assert.equal(id, channel);
            assert.deepEqual(opts, { force: true });
            return { id: wrong ? 'wrong' : channel, guildId: 'g', type: ChannelType.GuildText };
          },
        },
      },
    };
    await assert.rejects(() => command.execute(i, c), /rankChannelInvalid/);
    wrong = false;
    lost = true;
    calls = 0;
    await assert.rejects(() => command.execute(i, c), /userPermission/);
    assert.deepEqual(r.config('g').excluded, []);
    lost = false;
    await command.execute(i, c);
    assert.deepEqual(r.config('g').excluded, [channel]);
  } finally {
    db.close();
  }
});

test('removeexclude deletes only exact stored guild exclusion with no native target lookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new MessageRanks(db),
        other = '100000000000000009',
        replies = [];
      r.enable('g', true);
      r.exclude('g', channel, true);
      r.exclude('g', other, true);
      r.exclude('other', channel, true);
      const i = {
        guildId: 'g',
        user: { id: user },
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({ id: user, guild: { id: 'g' }, permissions: { has: () => true } }),
          },
          channels: {
            fetch: async () => {
              throw Error('no native lookup');
            },
          },
        },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => 'removeexclude',
          getBoolean: () => true,
          getString: () => channel,
        },
      };
      await command.execute(i, {
        messageRanks: r,
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.deepEqual(r.config('g'), { enabled: true, excluded: [other] });
      assert.deepEqual(r.config('other').excluded, [channel]);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
    } finally {
      db.close();
    }
  }
});
test('removeexclude confirmation/ID/current authority rejects without clearing unrelated config', async () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.exclude('g', channel, true);
    let confirm = false,
      id = channel,
      allowed = true;
    const i = {
        guildId: 'g',
        user: { id: user },
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({
              id: user,
              guild: { id: 'g' },
              permissions: { has: () => allowed },
            }),
          },
        },
        deferReply: async () => {},
        editReply: async () => {},
        options: {
          getSubcommand: () => 'removeexclude',
          getBoolean: () => confirm,
          getString: () => id,
        },
      },
      c = {
        messageRanks: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    await assert.rejects(() => command.execute(i, c), /rankExcludeConfirm/);
    confirm = true;
    id = 'bad';
    await assert.rejects(() => command.execute(i, c), /rankChannelInvalid/);
    id = channel;
    allowed = false;
    await assert.rejects(() => command.execute(i, c), /userPermission/);
    assert.deepEqual(r.config('g').excluded, [channel]);
  } finally {
    db.close();
  }
});

test('daily retained series bounds ten UTC dates includes zero and isolates exact user guild', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    for (const [g, u, day, count] of [
      ['g', user, '2026-10-11', 2],
      ['g', user, '2026-10-02', 5],
      ['g', user, '2026-10-01', 8],
      ['foreign', user, '2026-10-11', 99],
      ['g', 'other', '2026-10-11', 99],
    ])
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(g, u, day, count);
    const page = r.daily('g', user, 1, now);
    assert.equal(page.length, 10);
    assert.deepEqual(page[0], { day: '2026-10-11', count: 2 });
    assert.deepEqual(page[9], { day: '2026-10-02', count: 5 });
    assert.deepEqual(page[1], { day: '2026-10-10', count: 0 });
    assert.equal(r.daily('g', user, 2, now)[0].count, 8);
    assert.equal(r.daily('g', user, 9, now)[9].day, '2026-07-14');
    for (const p of [0, 10, 1.5, NaN])
      assert.throws(() => r.daily('g', user, p, now), /rankPageInvalid/);
  } finally {
    db.close();
  }
});
test('daily counts are caller-only private localized storage reads and preserve optout and counts', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const ranks = new MessageRanks(db);
      ranks.privacy('g', user, true);
      const before = db.prepare('SELECT * FROM message_rank_privacy').all(),
        replies = [];
      let queried;
      const c = {
        messageRanks: {
          daily: (g, u, p) => {
            queried = [g, u, p];
            return ranks.daily(g, u, p, now);
          },
        },
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      await command.execute(
        {
          guildId: 'g',
          user: { id: user },
          deferReply: async (p) => assert(p.flags),
          editReply: async (p) => replies.push(p),
          options: { getSubcommand: () => 'daily', getInteger: () => null },
        },
        c,
      );
      assert.deepEqual(queried, ['g', user, 1]);
      assert(
        replies[0].embeds[0].data.description.includes(translate(locale, 'rankDaily', { page: 1 })),
      );
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.deepEqual(db.prepare('SELECT * FROM message_rank_privacy').all(), before);
      assert.equal(db.prepare('SELECT count(*) n FROM message_rank_daily').get().n, 0);
    } finally {
      db.close();
    }
  }
});
test('daily retained series observes UTC midnight across month boundary and has fixed ninety-day window', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    const rows = Array.from({ length: 9 }, (_, p) =>
      r.daily('g', user, p + 1, Date.parse('2027-01-01T00:00:01Z')),
    ).flat();
    assert.equal(rows.length, 90);
    assert.equal(new Set(rows.map((r) => r.day)).size, 90);
    assert.equal(rows[0].day, '2027-01-01');
    assert.equal(rows[1].day, '2026-12-31');
    assert.equal(rows.at(-1).day, '2026-10-04');
  } finally {
    db.close();
  }
});

test('own activity summarizes only retained UTC days with gaps longest run and earliest peak ties', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    for (const [day, count] of [
      ['2026-07-13', 999],
      ['2026-07-14', 2],
      ['2026-10-06', 5],
      ['2026-10-07', 5],
      ['2026-10-08', 1],
      ['2026-10-10', 3],
      ['2026-10-11', 2],
      ['2026-10-12', 999],
    ])
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run('g', user, day, count);
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
      'other',
      user,
      '2026-10-09',
      999,
    );
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
      'g',
      '100000000000000004',
      '2026-10-09',
      999,
    );
    assert.deepEqual(r.activity('g', user, now), {
      total: 18,
      activeDays: 6,
      longest: 3,
      peakCount: 5,
      peakDay: '2026-10-06',
    });
    assert.deepEqual(r.activity('empty', user, now), {
      total: 0,
      activeDays: 0,
      longest: 0,
      peakCount: 0,
      peakDay: null,
    });
  } finally {
    db.close();
  }
});
test('activity honors optout/reset deletion and never recreates erased or disabled tracking counts', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    r.record(message(), now);
    assert.equal(r.activity('g', user, now).total, 1);
    r.privacy('g', user, true);
    assert.equal(r.activity('g', user, now).total, 0);
    r.privacy('g', user, false);
    assert.equal(r.activity('g', user, now).total, 0);
    assert.equal(r.record(message(), now), false);
    r.enable('g', false);
    assert.equal(r.record(message(2), now), false);
  } finally {
    db.close();
  }
});
test('activity and privacy slash output own data only privately in three locales without storage mutations', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['activity', 'privacy']) {
      const db = openDatabase(':memory:');
      try {
        const r = new MessageRanks(db);
        r.enable('g', true);
        r.record({ ...message(), createdTimestamp: Date.now() }, Date.now());
        let reply;
        const i = {
          guildId: 'g',
          user: { id: user },
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => {
            reply = p;
          },
        };
        const c = {
          messageRanks: r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        const before = r.config('g');
        await command.execute(i, c);
        assert.deepEqual(r.config('g'), before);
        assert(!r.optedOut('g', user));
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(reply.embeds[0].data.description.length < 2000);
        assert(reply.embeds[0].data.footer.text.includes('Luna'));
        assert(!reply.embeds[0].data.description.includes(user));
      } finally {
        db.close();
      }
    }
});
test('privacy reports no optout as no personal consent proof with server switch and erasure unchanged', async () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    let reply;
    const i = {
      guildId: 'g',
      user: { id: user },
      options: { getSubcommand: () => 'privacy' },
      deferReply: async () => {},
      editReply: async (p) => {
        reply = p;
      },
    };
    const c = {
      messageRanks: r,
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
    await command.execute(i, c);
    assert(reply.embeds[0].data.description.includes('not opted out'));
    assert(reply.embeds[0].data.description.includes(translate('en', 'disabled')));
    r.privacy('g', user, true);
    await command.execute(i, c);
    assert(reply.embeds[0].data.description.includes('opted out'));
    assert(r.optedOut('g', user));
    assert.equal(r.config('g').enabled, false);
  } finally {
    db.close();
  }
});
test('activity tracks consecutive calendar days across month/year boundaries without assuming elapsed local time', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    for (const day of ['2026-12-30', '2026-12-31', '2027-01-01'])
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,1)').run('g', user, day);
    assert.equal(r.activity('g', user, Date.parse('2027-01-01T00:00:00Z')).longest, 3);
  } finally {
    db.close();
  }
});

test('rank totals and tie positions exclude future UTC dates in every calendar window without mutating storage', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db),
      q = db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)');
    q.run('g', user, '2026-10-11', 5);
    q.run('g', user, '2026-10-10', 2);
    q.run('g', user, '2026-10-12', 9000);
    q.run('g', '100000000000000003', '2026-10-12', 10000);
    q.run('g', '100000000000000000', '2026-10-11', 5);
    q.run('foreign', user, '2026-10-11', 8000);
    for (const period of ['today', 'week', 'retained']) {
      const top = r.top('g', period, 1, now);
      assert.equal(top.pages, 1);
      assert.equal(top.rows.length, 2);
      assert(!top.rows.some((a) => a.user_id === '100000000000000003'));
      const mine = top.rows.find((a) => a.user_id === user);
      assert.equal(mine.total, period === 'today' ? 5 : 7);
      assert.equal(r.position('g', user, period, now).total, mine.total);
    }
    assert.deepEqual(r.stats('g', user, now), { today: 5, week: 7, retained: 7 });
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_daily').get().n, 6);
  } finally {
    db.close();
  }
});
test('future-only rank records are not numbered and do not inflate page count or rank zero', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    for (let n = 0; n < 12; n++)
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
        'g',
        String(100000000000000000n + BigInt(n)),
        '2026-10-12',
        99,
      );
    for (const period of ['today', 'week', 'retained']) {
      assert.deepEqual(r.top('g', period, 1, now), { rows: [], pages: 1, page: 1 });
      assert.deepEqual(r.position('g', user, period, now), { position: null, total: 0 });
      assert.throws(() => r.top('g', period, 2, now));
    }
    assert.deepEqual(r.stats('g', user, now), { today: 0, week: 0, retained: 0 });
  } finally {
    db.close();
  }
});
test('near-midnight legitimate thirty-second future event only contributes when its UTC day starts', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db),
      anchor = Date.parse('2026-10-11T23:59:50Z');
    r.enable('g', true);
    assert.equal(r.record(message(100, { createdTimestamp: anchor + 20000 }), anchor), true);
    assert.deepEqual(r.stats('g', user, anchor), { today: 0, week: 0, retained: 0 });
    assert.deepEqual(r.top('g', 'today', 1, anchor).rows, []);
    assert.equal(r.position('g', user, 'today', anchor).position, null);
    assert.equal(r.stats('g', user, anchor + 20000).today, 1);
    assert.equal(r.top('g', 'today', 1, anchor + 20000).rows[0].total, 1);
    assert.equal(r.position('g', user, 'today', anchor + 20000).position, 1);
  } finally {
    db.close();
  }
});

test('message ranks ignore system events and unknown author bot flags without stored contribution', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    for (const extra of [
      { system: true },
      { author: { id: user } },
      { author: { id: user, bot: null } },
      { author: { id: user, bot: 0 } },
      { author: { id: user, bot: 'false' } },
    ])
      assert.equal(r.record(message(1, extra), now), false);
    assert.equal(r.stats('g', user, now).retained, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 0);
    assert(r.record(message(1, { system: false }), now));
    assert.equal(r.stats('g', user, now).today, 1);
  } finally {
    db.close();
  }
});

test('leaderboard enable refuses malformed operator runtime consent without storing tracking', async () => {
  for (const flag of [undefined, null, 1, 'true', 'false', {}]) {
    const db = openDatabase(':memory:');
    try {
      const c = {
        messageRanks: new MessageRanks(db),
        config: { messageEventsEnabled: flag },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
      const i = {
        guildId: 'g',
        user: { id: user },
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({ id: user, guild: { id: 'g' }, permissions: { has: () => true } }),
          },
        },
        options: { getSubcommand: () => 'enable' },
        deferReply: async () => {},
        editReply: async () => {
          throw new Error('unexpected reply');
        },
      };
      await assert.rejects(() => command.execute(i, c), /responderRuntimeDisabled/);
      assert.equal(c.messageRanks.config('g').enabled, false);
      assert.equal(db.prepare('SELECT count(*) n FROM message_rank_config').get().n, 0);
    } finally {
      db.close();
    }
  }
});

test('rank invalid event clock refuses replay/count mutation and preserves cleanup watermark', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    for (const clock of [NaN, Infinity, -1, '123', null, 1.5]) {
      assert.equal(r.record(message(), clock), false);
      assert.equal(r.lastCleanup, 0);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_seen').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM message_rank_daily').get().n, 0);
    assert.equal(r.record(message(), now), true);
  } finally {
    db.close();
  }
});

test('rank ownexport/overview exact90UTCday window/guildscope aggregates do not expose foreign/old/future rows', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    for (const [g, u, day, count] of [
      ['g', user, '2026-10-11', 2],
      ['g', 'other', '2026-10-11', 3],
      ['other', user, '2026-10-11', 9],
      ['g', user, '2025-01-01', 10],
      ['g', user, '2027-01-01', 10],
    ])
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(g, u, day, count);
    assert.deepEqual(r.exportMine('g', user, now), [{ day: '2026-10-11', count: 2 }]);
    assert.deepEqual(r.overview('g', now), { contributors: 2, messages: 5, days: 1 });
    assert.deepEqual(r.overview('none', now), { contributors: 0, messages: 0, days: 0 });
  } finally {
    db.close();
  }
});
test('rank resetall preserves optouts/config/replay and foreigncounts;idempotent no event replay', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new MessageRanks(db);
    r.enable('g', true);
    r.record(message(), now);
    r.record(message(2, { guildId: 'other' }), now);
    r.privacy('g', '100000000000000009', true);
    db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
      'other',
      user,
      '2026-10-11',
      5,
    );
    assert.equal(r.resetAll('g'), 1);
    assert.equal(r.resetAll('g'), 0);
    assert.equal(r.config('g').enabled, true);
    assert(r.optedOut('g', '100000000000000009'));
    assert.equal(r.record(message(), now), false);
    assert.equal(r.stats('other', user, now).today, 5);
  } finally {
    db.close();
  }
});
test('rank exportmine private3locale exactcaller CSV/no otherusers and bulk controls manager/confirmation gates', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const r = new MessageRanks(db);
      db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
        'g',
        user,
        new Date().toISOString().slice(0, 10),
        2,
      );
      let sub = 'exportmine',
        confirm = false,
        reply;
      const actor = { id: user, guild: { id: 'g' }, permissions: { has: () => true } };
      const i = {
        guildId: 'g',
        guild: { id: 'g', members: { fetch: async () => actor } },
        user: { id: user },
        options: { getSubcommand: () => sub, getBoolean: () => confirm },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
      };
      const c = {
        messageRanks: r,
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      await command.execute(i, c);
      assert.equal(reply.files.length, 1);
      assert(reply.files[0].attachment.toString().startsWith('utc_day,message_count\n'));
      assert(!reply.files[0].attachment.toString().includes(user));
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'overview';
      await command.execute(i, c);
      assert.equal(reply.files, undefined);
      sub = 'resetall';
      await assert.rejects(() => command.execute(i, c), /rankResetAllConfirm/);
      confirm = true;
      await command.execute(i, c);
      assert.equal(db.prepare('SELECT count(*) n FROM message_rank_daily').get().n, 0);
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});
