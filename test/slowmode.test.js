import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { setSlowmode } from '../src/services/slowmode.js';
import command from '../src/commands/moderation/slowmode.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const actor = { id: 'actor', guild: { id: 'g' } },
    bot = { id: 'bot', guild: { id: 'g' } };
  const channel = {
    id,
    guildId: 'g',
    type: ChannelType.GuildText,
    rateLimitPerUser: 0,
    permissionsFor: () => ({ has: () => true }),
    setRateLimitPerUser: async (s) => {
      calls.push(s);
      channel.rateLimitPerUser = s;
    },
  };
  const i = {
    id: 'interaction',
    guildId: 'g',
    user: { id: 'actor' },
    client: { user: { id: 'bot' } },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      members: { fetch: async () => actor, fetchMe: async () => bot },
      channels: { fetch: async () => channel },
    },
  };
  return { db, c: { cases: new ModerationCases(db) }, i, actor, bot, channel, calls };
}
test('slowmode explicit change verifies current exact channel,zero disables and duplicate blocks', async () => {
  const s = setup();
  try {
    let reads = 0;
    s.i.guild.channels.fetch = async (selected, o) => {
      reads++;
      assert.equal(selected, id);
      assert.equal(o.force, true);
      return s.channel;
    };
    const r = await setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true });
    assert(r.changed);
    assert.equal(reads, 2);
    assert.deepEqual(s.calls, [10]);
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'completed');
    assert.equal(
      (await setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true })).changed,
      false,
    );
    await assert.rejects(
      () => setSlowmode(s.i, s.c, { channelId: id, seconds: 0, confirm: true }),
      /modDuplicate/,
    );
    s.i.id = 'disable';
    await setSlowmode(s.i, s.c, { channelId: id, seconds: 0, confirm: true });
    assert.deepEqual(s.calls, [10, 0]);
  } finally {
    s.db.close();
  }
});
test('slowmode confirmation,input,identity,type and permissions fail before reservation/effect', async () => {
  for (const kind of [
    'confirm',
    'seconds',
    'actor',
    'bot',
    'channel',
    'guild',
    'type',
    'actorPermission',
    'appPermission',
  ]) {
    const s = setup();
    if (kind === 'actor') s.actor.id = 'other';
    if (kind === 'bot') s.bot.id = 'other';
    if (kind === 'channel') s.channel.id = 'other';
    if (kind === 'guild') s.channel.guildId = 'other';
    if (kind === 'type') s.channel.type = ChannelType.GuildVoice;
    if (kind === 'actorPermission')
      s.channel.permissionsFor = (m) => ({ has: () => m !== s.actor });
    if (kind === 'appPermission') s.i.appPermissions.has = () => false;
    try {
      await assert.rejects(() =>
        setSlowmode(s.i, s.c, {
          channelId: id,
          seconds: kind === 'seconds' ? 21601 : 10,
          confirm: kind !== 'confirm',
        }),
      );
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('slowmode unknown native verification and storage failures block retries for channel', async () => {
  for (const kind of ['network', 'verify', 'storage', 'reserve']) {
    const s = setup();
    let n = 0;
    s.channel.setRateLimitPerUser = async () => {
      n++;
      if (kind === 'network') throw Error('network');
    };
    if (kind === 'storage')
      s.channel.setRateLimitPerUser = async (v) => {
        n++;
        s.channel.rateLimitPerUser = v;
      };
    if (kind === 'storage')
      s.c.cases.finish = () => {
        throw Error('db');
      };
    if (kind === 'reserve')
      s.c.cases.begin = () => {
        throw Error('db');
      };
    try {
      await assert.rejects(() =>
        setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true }),
      );
      assert.equal(n, kind === 'reserve' ? 0 : 1);
      if (kind !== 'reserve') {
        s.i.id = 'new';
        await assert.rejects(
          () => setSlowmode(s.i, s.c, { channelId: id, seconds: 0, confirm: true }),
          /slowmodeUncertain/,
        );
        assert.equal(n, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('slowmode slash payload private localized no-ping with native maximum bounds', async () => {
  assert.equal(command.data.toJSON().options.find((o) => o.name === 'seconds').max_value, 21600);
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    s.i.options = { getChannel: () => ({ id }), getInteger: () => 10, getBoolean: () => true };
    try {
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.match(replies[0].embeds[0].data.description, /10/);
    } finally {
      s.db.close();
    }
  }
});

test('slowmode post-acceptance REST rejection stays uncertain rather than falsely failed', async () => {
  const s = setup();
  let reads = 0;
  s.i.guild.channels.fetch = async () => {
    if (++reads === 1) return s.channel;
    const e = new Error('gone');
    e.code = 10003;
    e.status = 404;
    throw e;
  };
  try {
    await assert.rejects(
      () => setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true }),
      /slowmodeUncertain/,
    );
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'uncertain');
    assert.deepEqual(s.calls, [10]);
  } finally {
    s.db.close();
  }
});
test('slowmode concurrent channel mutation is blocked by case reservation before native await', async () => {
  const s = setup();
  let release,
    n = 0;
  const wait = new Promise((r) => {
    release = r;
  });
  s.channel.setRateLimitPerUser = async (v) => {
    n++;
    await wait;
    s.channel.rateLimitPerUser = v;
  };
  try {
    const first = setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true });
    // Both requests perform asynchronous native validation before the synchronous reservation guard.
    const second = setSlowmode({ ...s.i, id: 'other' }, s.c, {
      channelId: id,
      seconds: 20,
      confirm: true,
    });
    await assert.rejects(() => second, /slowmodeUncertain/);
    assert.equal(n, 1);
    release();
    await first;
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 1);
    assert.deepEqual(s.calls, []);
    assert.equal(s.channel.rateLimitPerUser, 10);
  } finally {
    release();
    s.db.close();
  }
});
test('slowmode pending native outcome remains blocked after SQLite reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-slow-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    let cases = new ModerationCases(db);
    cases.begin({
      guildId: 'g',
      targetId: id,
      actorId: 'actor',
      action: 'slowmode',
      reason: 'unknown',
      interactionId: 'old',
    });
    db.close();
    db = openDatabase(path);
    cases = new ModerationCases(db);
    const s = setup();
    s.db.close();
    s.c.cases = cases;
    await assert.rejects(
      () => setSlowmode(s.i, s.c, { channelId: id, seconds: 10, confirm: true }),
      /slowmodeUncertain/,
    );
    assert.equal(s.calls.length, 0);
    assert.equal(db.prepare('SELECT status FROM moderation_cases').get().status, 'pending');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
