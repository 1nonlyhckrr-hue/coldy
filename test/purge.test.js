import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { PurgePlans, previewPurge, confirmPurge } from '../src/services/purge.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/moderation/moderation.js';
import { translate } from '../src/services/localization.js';
const now = Date.parse('2026-10-11T12:00:00Z'),
  channelId = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    messages = new Map(
      Array.from({ length: 3 }, (_, n) => {
        const id = String(100000000000000100n + BigInt(n));
        return [
          id,
          {
            id,
            guildId: 'g',
            channelId,
            createdTimestamp: now - 1000,
            pinned: false,
            system: false,
            content: 'DO_NOT_STORE',
          },
        ];
      }),
    );
  let allowed = true;
  const channel = {
    id: channelId,
    guildId: 'g',
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => allowed }),
    messages: {
      fetch: async (options) => {
        calls.push(['fetch', options]);
        return options.message ? messages.get(options.message) : messages;
      },
    },
    bulkDelete: async (...args) => calls.push(['delete', ...args]),
  };
  const i = {
    id: 'preview',
    guildId: 'g',
    user: { id: 'staff' },
    guild: {
      members: { fetch: async () => ({}), fetchMe: async () => ({}) },
      channels: {
        fetch: async (_id, opts) => {
          assert.equal(opts.force, true);
          return channel;
        },
      },
    },
  };
  const c = {
    purgePlans: new PurgePlans(db),
    cases: new ModerationCases(db),
    localization: { locale: () => 'en' },
  };
  return { db, c, i, channel, calls, messages, setAllowed: (v) => (allowed = v) };
}
test('preview stores exact IDs only, excludes pinned/system/old and makes no delete', async () => {
  const s = setup();
  try {
    s.messages.get('100000000000000100').pinned = true;
    s.messages.get('100000000000000101').system = true;
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    assert.deepEqual(r.ids, ['100000000000000102']);
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
    assert(!JSON.stringify(s.c.purgePlans.get(r.id, 'g', 'staff')).includes('DO_NOT_STORE'));
    assert.equal(s.c.purgePlans.get(r.id, 'other', 'staff'), undefined);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'other'), undefined);
  } finally {
    s.db.close();
  }
});
test('confirmed exact target request is recorded before effect and never reused', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'confirm';
    await confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now + 1000);
    const d = s.calls.find((c) => c[0] === 'delete');
    assert.deepEqual(d[1], r.ids);
    assert.equal(d[2], false);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'completed');
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'completed');
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now + 1000),
      /purgePlanExpired/,
    );
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 1);
  } finally {
    s.db.close();
  }
});
test('changed/missing/old/pinned messages cause no deletion, new messages never replace targets', async () => {
  for (const kind of ['missing', 'pinned', 'old', 'foreign', 'system']) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'confirm';
      const m = s.messages.get(r.ids[1]);
      if (kind === 'missing') s.messages.delete(m.id);
      if (kind === 'pinned') m.pinned = true;
      if (kind === 'old') m.createdTimestamp = now - 14 * 86400000;
      if (kind === 'foreign') m.guildId = 'foreign';
      if (kind === 'system') m.system = true;
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgeChanged/,
      );
      assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('confirmation,expiry,current channel permission,foreign ownership and limits fail closed', async () => {
  const s = setup();
  try {
    for (const count of [0, 11, 1.5])
      await assert.rejects(() => previewPurge(s.i, s.c, { channelId, count }, now));
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: false }, now),
      /purgeConfirmRequired/,
    );
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now + 120001),
      /purgePlanExpired/,
    );
    s.setAllowed(false);
    await assert.rejects(() => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now));
    s.setAllowed(true);
    s.i.user.id = 'other';
    await assert.rejects(() => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now));
    s.i.user.id = 'staff';
    s.channel.guildId = 'other';
    await assert.rejects(() => previewPurge(s.i, s.c, { channelId, count: 3 }, now));
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
  } finally {
    s.db.close();
  }
});
test('uncertain native send never retries, startup recovery and pre-effect storage failure contain action', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'confirm';
    s.channel.bulkDelete = async () => {
      s.calls.push(['delete']);
      throw new Error('SECRET');
    };
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
      /purgeUncertain/,
    );
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'uncertain');
    await assert.rejects(() => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now));
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 1);
    s.i.id = 'preview2';
    const r2 = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.c.purgePlans.claim(r2.id, now);
    s.c.purgePlans.recover();
    assert.equal(s.c.purgePlans.get(r2.id, 'g', 'staff').status, 'uncertain');
    s.i.id = 'preview3';
    const r3 = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.c.cases.begin = () => {
      throw new Error('db');
    };
    s.i.id = 'confirm3';
    await assert.rejects(() => confirmPurge(s.i, s.c, { id: r3.id, confirm: true }, now));
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 1);
  } finally {
    s.db.close();
  }
});
test('one selected message uses bounded exact-ID API contract and plans capped per guild', async () => {
  const s = setup();
  try {
    const one = [...s.messages.values()][0];
    s.messages.clear();
    s.messages.set(one.id, one);
    const r = await previewPurge(s.i, s.c, { channelId, count: 1 }, now);
    s.i.id = 'confirm';
    await confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now);
    assert.deepEqual(s.calls.find((c) => c[0] === 'delete')[1], [one.id]);
    for (let n = 0; n < 50; n++)
      s.c.purgePlans.reserve({ ...s.i, id: `p${n}` }, channelId, [one.id], now);
    assert.throws(
      () => s.c.purgePlans.reserve({ ...s.i, id: 'over' }, channelId, [one.id], now),
      /purgePlanLimit/,
    );
  } finally {
    s.db.close();
  }
});
test('purge preview/confirm command replies privately in all locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      const replies = [];
      s.c.localization = { locale: () => locale };
      let sub = 'purgepreview';
      s.i.options = {
        getSubcommand: () => sub,
        getChannel: () => ({ id: channelId }),
        getInteger: (name) => (name === 'count' ? 3 : 1),
        getBoolean: () => true,
      };
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => replies.push(p);
      for (const m of s.messages.values()) m.createdTimestamp = Date.now() - 1000;
      await command.execute(s.i, s.c);
      sub = 'purgeconfirm';
      s.i.id = 'confirm';
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 2);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
      assert.match(replies[0].embeds[0].data.description, /100000000000000100/);
    } finally {
      s.db.close();
    }
  }
});
