import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases, moderate, parseDuration } from '../src/services/moderation.js';
const ids = {
  actor: '100000000000000001',
  bot: '100000000000000002',
  target: '100000000000000003',
  owner: '100000000000000004',
};
function setup() {
  const calls = [];
  const db = openDatabase(':memory:');
  const context = { cases: new ModerationCases(db) };
  const member = (id, n) => ({
    id,
    user: { bot: false },
    permissions: { has: (permission) => permission !== P.Administrator },
    roles: { highest: { position: n, comparePositionTo: (other) => n - other.position } },
  });
  const actor = member(ids.actor, 5),
    bot = member(ids.bot, 8),
    target = member(ids.target, 2);
  target.timeout = async (...a) => calls.push(['timeout', ...a]);
  target.kick = async (...a) => calls.push(['kick', ...a]);
  target.ban = async (...a) => calls.push(['ban', ...a]);
  const i = {
    id: 'interaction-1',
    guildId: 'guild',
    user: { id: ids.actor },
    inGuild: () => true,
    appPermissions: { has: () => true },
    guild: {
      ownerId: ids.owner,
      members: {
        fetch: async ({ user }) => (user === ids.actor ? actor : target),
        fetchMe: async () => bot,
      },
      bans: { remove: async (...a) => calls.push(['unban', ...a]) },
    },
  };
  return { db, context, i, actor, bot, target, calls };
}
test('duration validation bounds and units', () => {
  assert.equal(parseDuration('28d'), 2419200000);
  for (const v of ['0s', '29d', '1w', '-1h', '1.5h', '999999999999999999d'])
    assert.throws(() => parseDuration(v));
});
test('warning records are transactional, guild scoped and duplicate guarded', async () => {
  const s = setup();
  try {
    await moderate(s.i, s.context, { action: 'warn', targetId: ids.target, reason: 'One' });
    assert.equal(s.context.cases.warnings('guild', ids.target).length, 1);
    assert.equal(s.context.cases.warnings('other', ids.target).length, 0);
    await assert.rejects(() => moderate(s.i, s.context, { action: 'warn', targetId: ids.target }));
    assert.equal(s.context.cases.warnings('guild', ids.target).length, 1);
    s.i.id = '2';
    const r = await moderate(s.i, s.context, { action: 'clearwarns', targetId: ids.target });
    assert.equal(r.count, 1);
  } finally {
    s.db.close();
  }
});
test('permission denied before any external write or case', async () => {
  const s = setup();
  s.actor.permissions.has = () => false;
  try {
    await assert.rejects(() => moderate(s.i, s.context, { action: 'ban', targetId: ids.target }));
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});
test('bot permission denial, hierarchy and owner protections', async () => {
  for (const change of [
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.target.roles.highest.position = 9),
    (s) => (s.target.id = ids.owner),
  ]) {
    const s = setup();
    change(s);
    try {
      await assert.rejects(() =>
        moderate(s.i, s.context, { action: 'kick', targetId: ids.target }),
      );
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('timeout refuses administrator and bot', async () => {
  for (const type of ['administrator', 'bot']) {
    const s = setup();
    if (type === 'bot') s.target.user.bot = true;
    else s.target.permissions.has = () => true;
    try {
      await assert.rejects(() =>
        moderate(s.i, s.context, { action: 'timeout', targetId: ids.target, duration: '1h' }),
      );
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('external action recorded completed without deleting prior messages', async () => {
  const s = setup();
  try {
    const r = await moderate(s.i, s.context, {
      action: 'ban',
      targetId: ids.target,
      reason: 'Spam',
    });
    assert.equal(s.calls[0][1].deleteMessageSeconds, 0);
    assert.equal(
      s.db.prepare('SELECT status FROM moderation_cases WHERE id=?').get(r.id).status,
      'completed',
    );
  } finally {
    s.db.close();
  }
});
test('API rejection and ambiguous network failures never auto-retry', async () => {
  for (const definite of [true, false]) {
    const s = setup();
    let n = 0;
    s.target.kick = async () => {
      n++;
      throw Object.assign(new Error('secret'), definite ? { code: 50013, status: 403 } : {});
    };
    try {
      await assert.rejects(
        () => moderate(s.i, s.context, { action: 'kick', targetId: ids.target }),
        (e) => !e.message.includes('secret'),
      );
      assert.equal(n, 1);
      assert.equal(
        s.db.prepare('SELECT status FROM moderation_cases').get().status,
        definite ? 'failed' : 'uncertain',
      );
    } finally {
      s.db.close();
    }
  }
});
test('database failure prevents external action', async () => {
  const s = setup();
  s.context.cases.begin = () => {
    throw new Error('DB unavailable');
  };
  try {
    await assert.rejects(() => moderate(s.i, s.context, { action: 'kick', targetId: ids.target }));
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('completed Discord action with case-finalization failure does not report action failure', async () => {
  const s = setup();
  s.context.cases.finish = () => {
    throw new Error('DB unavailable');
  };
  try {
    await assert.rejects(
      () => moderate(s.i, s.context, { action: 'kick', targetId: ids.target }),
      /modStorageIncomplete/,
    );
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('unban does not require target membership but checks permission', async () => {
  const s = setup();
  try {
    await moderate(s.i, s.context, { action: 'unban', targetId: ids.target });
    assert.equal(s.calls[0][0], 'unban');
  } finally {
    s.db.close();
  }
});
test('moderation slash wrapper defers, selects validated inputs and edits without mentions', async () => {
  const s = setup();
  const { default: command } = await import('../src/commands/moderation/moderation.js');
  const edits = [];
  let deferred = false;
  s.i.deferReply = async () => {
    deferred = true;
  };
  s.i.editReply = async (v) => edits.push(v);
  s.i.options = {
    getSubcommand: () => 'warn',
    getUser: () => ({ id: ids.target }),
    getString: (key) => (key === 'reason' ? 'Recorded' : null),
  };
  try {
    await command.execute(s.i, s.context);
    assert(deferred);
    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0].allowedMentions, { parse: [] });
    assert.match(edits[0].embeds[0].data.description, /Case #1/);
  } finally {
    s.db.close();
  }
});
test('successful timeout and untimeout call the matching Discord method', async () => {
  const s = setup();
  try {
    await moderate(s.i, s.context, { action: 'timeout', targetId: ids.target, duration: '1h' });
    assert.equal(s.calls[0][1], 3600000);
    s.i.id = 'two';
    await moderate(s.i, s.context, { action: 'untimeout', targetId: ids.target });
    assert.equal(s.calls[1][1], null);
  } finally {
    s.db.close();
  }
});
test('warnings is read-only and invalid inputs never make a case', async () => {
  const s = setup();
  try {
    const r = await moderate(s.i, s.context, { action: 'warnings', targetId: ids.target });
    assert.deepEqual(r.warnings, []);
    for (const input of [
      { action: 'ban', targetId: 'bad' },
      { action: 'bad', targetId: ids.target },
      { action: 'ban', targetId: ids.target, reason: 'x'.repeat(401) },
      { action: 'timeout', targetId: ids.target, duration: '29d' },
    ])
      await assert.rejects(() => moderate(s.i, s.context, input));
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});
test('Hindi moderation replies and default reasons follow guild locale', async () => {
  const s = setup();
  const { default: command } = await import('../src/commands/moderation/moderation.js');
  s.context.localization = { locale: () => 'hi' };
  const edits = [];
  s.i.deferReply = async () => {};
  s.i.editReply = async (p) => edits.push(p);
  s.i.options = {
    getSubcommand: () => 'warn',
    getUser: () => ({ id: ids.target }),
    getString: () => null,
  };
  try {
    await command.execute(s.i, s.context);
    assert.match(edits[0].embeds[0].data.description, /केस/);
    assert.match(s.context.cases.warnings('guild', ids.target)[0].reason, /कारण/);
  } finally {
    s.db.close();
  }
});
