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
    bulkDelete: async (...args) => {
      calls.push(['delete', ...args]);
      return new Map(args[0].map((id) => [id, undefined]));
    },
  };
  const i = {
    id: 'preview',
    guildId: 'g',
    client: { user: { id: 'bot' } },
    appPermissions: { has: () => true },
    user: { id: 'staff' },
    guild: {
      id: 'g',
      members: {
        fetch: async () => ({ id: 'staff', guild: { id: 'g' } }),
        fetchMe: async () => ({ id: 'bot', guild: { id: 'g' } }),
      },
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

test('purge preview requires exact current actor/bot/guild identity before history read or plan reservation', async () => {
  for (const kind of ['actor', 'actorGuild', 'bot', 'botGuild', 'guild', 'client', 'app']) {
    const s = setup();
    try {
      if (kind === 'actor' || kind === 'actorGuild')
        s.i.guild.members.fetch = async () => ({
          id: kind === 'actor' ? 'foreign' : 'staff',
          guild: { id: kind === 'actorGuild' ? 'foreign' : 'g' },
        });
      if (kind === 'bot' || kind === 'botGuild')
        s.i.guild.members.fetchMe = async () => ({
          id: kind === 'bot' ? 'foreign' : 'bot',
          guild: { id: kind === 'botGuild' ? 'foreign' : 'g' },
        });
      if (kind === 'guild') s.i.guild.id = 'foreign';
      if (kind === 'client') s.i.client.user.id = null;
      if (kind === 'app') s.i.appPermissions.has = () => false;
      await assert.rejects(() => previewPurge(s.i, s.c, { channelId, count: 3 }, now));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM purge_plans').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('purge confirmation final identity refresh rejects changed actor or bot before deletion/claim', async () => {
  for (const kind of ['actor', 'bot']) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'confirm';
      let calls = 0;
      if (kind === 'actor')
        s.i.guild.members.fetch = async () => ({
          id: ++calls === 2 ? 'foreign' : 'staff',
          guild: { id: 'g' },
        });
      else
        s.i.guild.members.fetchMe = async () => ({
          id: ++calls === 2 ? 'foreign' : 'bot',
          guild: { id: 'g' },
        });
      await assert.rejects(() => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now));
      assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
      assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'preview');
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('purge final application permission loss leaves exact preview intact with no destructive call', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'confirm';
    let calls = 0;
    s.i.guild.members.fetchMe = async () => {
      if (++calls === 2) s.i.appPermissions.has = () => false;
      return { id: 'bot', guild: { id: 'g' } };
    };
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
      /purgeBotPermission/,
    );
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'preview');
  } finally {
    s.db.close();
  }
});

test('purge accepted deletion cannot promote a plan recovered uncertain while native call waits', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'recovered';
    s.channel.bulkDelete = async (ids) => {
      s.c.purgePlans.recover();
      return new Map(ids.map((id) => [id, undefined]));
    };
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
      /purgeUncertain/,
    );
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'uncertain');
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'pending');
  } finally {
    s.db.close();
  }
});
test('purge late native failure cannot demote completed receipt or recreate deleted plan', async () => {
  for (const state of ['completed', 'deleted']) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'late';
      s.channel.bulkDelete = async () => {
        if (state === 'completed') s.c.purgePlans.finish(r.id, 'completed');
        else s.db.prepare('DELETE FROM purge_plans WHERE id=?').run(r.id);
        throw Error('late failure');
      };
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgeUncertain/,
      );
      assert.equal(
        s.c.purgePlans.get(r.id, 'g', 'staff')?.status,
        state === 'completed' ? 'completed' : undefined,
      );
      assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'uncertain');
    } finally {
      s.db.close();
    }
  }
});
test('purge finish requires one executing plan and preserves previews/final receipts', () => {
  const s = setup();
  try {
    const id = s.c.purgePlans.reserve(s.i, channelId, ['100000000000000100'], now);
    assert.throws(() => s.c.purgePlans.finish(id, 'completed'), /not executing/);
    assert.throws(() => s.c.purgePlans.finish(999, 'uncertain'), /not executing/);
    assert.equal(s.c.purgePlans.get(id, 'g', 'staff').status, 'preview');
    s.c.purgePlans.claim(id, now);
    s.c.purgePlans.finish(id, 'completed');
    assert.throws(() => s.c.purgePlans.finish(id, 'uncertain'), /not executing/);
    assert.equal(s.c.purgePlans.get(id, 'g', 'staff').status, 'completed');
  } finally {
    s.db.close();
  }
});

test('purge confirmation refuses changed exact preview IDs after awaited message verification', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'changed-preview';
    const fetch = s.channel.messages.fetch;
    s.channel.messages.fetch = async (options) => {
      const m = await fetch(options);
      s.db
        .prepare('UPDATE purge_plans SET ids_json=? WHERE id=?')
        .run(JSON.stringify([r.ids[0]]), r.id);
      return m;
    };
    await assert.rejects(
      () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
      /purgeChanged/,
    );
    assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'preview');
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});
test('purge final preview reread rejects replaced actor/channel/created/interaction identity', async () => {
  for (const [field, value] of [
    ['actor_id', 'foreign'],
    ['channel_id', '100000000000000999'],
    ['created_at', now + 1],
    ['interaction_id', 'replacement'],
  ]) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'changed-identity';
      let calls = 0;
      s.i.guild.members.fetchMe = async () => {
        if (++calls === 2)
          s.db.prepare(`UPDATE purge_plans SET ${field}=? WHERE id=?`).run(value, r.id);
        return { id: 'bot', guild: { id: 'g' } };
      };
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgeChanged/,
      );
      assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
      const stored = s.db.prepare('SELECT * FROM purge_plans WHERE id=?').get(r.id);
      assert.equal(stored[field], value);
      assert.equal(stored.status, 'preview');
    } finally {
      s.db.close();
    }
  }
});
test('purge deleted or completed preview during final refresh cannot create destructive case', async () => {
  for (const state of ['deleted', 'completed']) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'final-state';
      let calls = 0;
      s.i.guild.members.fetchMe = async () => {
        if (++calls === 2) {
          if (state === 'deleted') s.db.prepare('DELETE FROM purge_plans WHERE id=?').run(r.id);
          else s.db.prepare("UPDATE purge_plans SET status='completed' WHERE id=?").run(r.id);
        }
        return { id: 'bot', guild: { id: 'g' } };
      };
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgeChanged/,
      );
      assert.equal(s.calls.filter((c) => c[0] === 'delete').length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('purge missing/partial/foreign deletion receipts remain uncertain and cannot be retried', async () => {
  for (const kind of ['missing', 'partial', 'foreign', 'fake']) {
    const s = setup();
    try {
      const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
      s.i.id = 'receipt';
      let attempts = 0;
      s.channel.bulkDelete = async (ids) => {
        attempts++;
        if (kind === 'missing') return undefined;
        if (kind === 'partial') return new Map([[ids[0], undefined]]);
        if (kind === 'foreign') return new Map(['1', '2', '3'].map((id) => [id, undefined]));
        return { size: ids.length };
      };
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgeUncertain/,
      );
      assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'uncertain');
      assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'uncertain');
      await assert.rejects(
        () => confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now),
        /purgePlanExpired/,
      );
      assert.equal(attempts, 1);
    } finally {
      s.db.close();
    }
  }
});
test('purge exact deletion ID collection accepts undefined message values and reports requested count', async () => {
  const s = setup();
  try {
    const r = await previewPurge(s.i, s.c, { channelId, count: 3 }, now);
    s.i.id = 'exact-receipt';
    s.channel.bulkDelete = async (ids) => new Map([...ids].reverse().map((id) => [id, undefined]));
    const result = await confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now);
    assert.equal(result.count, 3);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'completed');
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'completed');
  } finally {
    s.db.close();
  }
});

test('purge one-message uncached deletion honors discord.js documented empty collection after accepted REST delete', async () => {
  const s = setup();
  try {
    const first = [...s.messages.entries()][0];
    s.messages.clear();
    s.messages.set(...first);
    const r = await previewPurge(s.i, s.c, { channelId, count: 1 }, now);
    s.i.id = 'single-empty';
    s.channel.bulkDelete = async () => new Map();
    const result = await confirmPurge(s.i, s.c, { id: r.id, confirm: true }, now);
    assert.equal(result.count, 1);
    assert.equal(s.c.purgePlans.get(r.id, 'g', 'staff').status, 'completed');
  } finally {
    s.db.close();
  }
});
