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
    guild: { id: 'guild' },
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
      id: 'guild',
      client: { user: { id: ids.bot } },
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

test('moderation verifies exact actor bot target guild before any warning record or external effect', async () => {
  for (const change of [
    (s) => (s.actor.id = ids.owner),
    (s) => (s.actor.guild.id = 'foreign'),
    (s) => (s.bot.id = ids.owner),
    (s) => (s.bot.guild.id = 'foreign'),
    (s) => (s.target.id = ids.owner),
    (s) => (s.target.guild.id = 'foreign'),
    (s) => (s.i.guild.id = 'foreign'),
    (s) => (s.i.guild.client.user.id = 'foreign'),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(
        () => moderate(s.i, s.context, { action: 'warn', targetId: ids.target }),
        /modIdentityInvalid/,
      );
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('moderation rechecks actor permission identity bot permission and hierarchy after target lookup', async () => {
  for (const change of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.actor.id = ids.owner),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.actor.roles.highest.comparePositionTo = () => 0),
  ]) {
    const s = setup();
    try {
      const fetch = s.i.guild.members.fetch;
      s.i.guild.members.fetch = async (args) => {
        if (args.user === ids.target) change(s);
        return fetch(args);
      };
      await assert.rejects(() =>
        moderate(s.i, s.context, { action: 'kick', targetId: ids.target }),
      );
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('case finish requires one pending reservation and terminal/missing states cannot rewrite', () => {
  const s = setup();
  try {
    const id = s.context.cases.begin({
      guildId: 'guild',
      targetId: ids.target,
      actorId: ids.actor,
      action: 'kick',
      reason: 'x',
      interactionId: 'guard',
    });
    s.context.cases.finish(id, 'completed');
    for (const status of ['completed', 'failed', 'uncertain'])
      assert.throws(() => s.context.cases.finish(id, status));
    assert.throws(() => s.context.cases.finish(999, 'failed'));
    assert.equal(
      s.db.prepare('SELECT status FROM moderation_cases WHERE id=?').get(id).status,
      'completed',
    );
  } finally {
    s.db.close();
  }
});

test('warning pages expose every active stored reason complete with deterministic ordering and strict bounds', () => {
  const s = setup();
  try {
    for (let n = 0; n < 7; n++)
      s.context.cases.warn({
        guildId: 'guild',
        targetId: ids.target,
        actorId: ids.actor,
        action: 'warn',
        reason: 'Reason' + n,
        interactionId: 'w' + n,
      });
    s.db.prepare('UPDATE warnings SET cleared_at=1 WHERE id=1').run();
    s.context.cases.warn({
      guildId: 'other',
      targetId: ids.target,
      actorId: ids.actor,
      action: 'warn',
      reason: 'FOREIGN',
      interactionId: 'foreign',
    });
    const all = [];
    for (let p = 1; p <= 3; p++) {
      const r = s.context.cases.warningPage('guild', ids.target, p);
      assert.equal(r.total, 6);
      assert.equal(r.pages, 3);
      assert.equal(r.rows.length, 2);
      all.push(...r.rows);
    }
    assert.equal(new Set(all.map((r) => r.id)).size, 6);
    assert.equal(all[0].reason, 'Reason6');
    assert.equal(s.context.cases.warningPage('empty', ids.target).total, 0);
    for (const p of [0, 4, 1001, 1.5, '1'])
      assert.throws(
        () => s.context.cases.warningPage('guild', ids.target, p),
        /modWarningPageInvalid/,
      );
  } finally {
    s.db.close();
  }
});
test('warning listing paginated moderation path retains current permission/hierarchy and makes no case/effects', async () => {
  const s = setup();
  try {
    for (let n = 0; n < 3; n++)
      s.context.cases.warn({
        guildId: 'guild',
        targetId: ids.target,
        actorId: ids.actor,
        action: 'warn',
        reason: 'Reason' + n,
        interactionId: 'w' + n,
      });
    const count = s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n;
    const r = await moderate(s.i, s.context, { action: 'warnings', targetId: ids.target, page: 2 });
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warningPage.total, 3);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, count);
    assert.equal(s.calls.length, 0);
    await assert.rejects(
      () => moderate(s.i, s.context, { action: 'warnings', targetId: ids.target, page: 3 }),
      /modWarningPageInvalid/,
    );
  } finally {
    s.db.close();
  }
});
test('warning slash renders worst-case complete escaped reasons privately in3locales without silent cutoff', async () => {
  const { default: cmd } = await import('../src/commands/moderation/moderation.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      const reason = '*'.repeat(390) + ' @everyone';
      for (let n = 0; n < 2; n++)
        s.context.cases.warn({
          guildId: 'guild',
          targetId: ids.target,
          actorId: ids.actor,
          action: 'warn',
          reason,
          interactionId: 'w' + n,
        });
      s.context.localization = { locale: () => locale };
      let reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => 'warnings',
        getInteger: () => 1,
        getUser: () => ({ id: ids.target }),
      };
      await cmd.execute(s.i, s.context);
      const text = reply.embeds[0].data.description;
      assert(text.length < 2000);
      assert.equal(text.split('@everyone').length, 3);
      assert(text.includes('\\*'));
      assert(text.includes(translate(locale, 'modWarningPage', { page: 1, pages: 1, total: 2 })));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(s.context.cases.warnings('guild', ids.target)[0].reason, reason);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('warning slash rejects invalid pages before reply and normalizes display controls without stored mutation', async () => {
  const { default: cmd } = await import('../src/commands/moderation/moderation.js');
  const s = setup();
  try {
    const reason = 'line\n**two**\tend';
    s.context.cases.warn({
      guildId: 'guild',
      targetId: ids.target,
      actorId: ids.actor,
      action: 'warn',
      reason,
      interactionId: 'w',
    });
    let reply;
    s.i.deferReply = async () => {};
    s.i.editReply = async (p) => {
      reply = p;
    };
    let page = 2;
    s.i.options = {
      getSubcommand: () => 'warnings',
      getInteger: () => page,
      getUser: () => ({ id: ids.target }),
    };
    await assert.rejects(() => cmd.execute(s.i, s.context), /modWarningPageInvalid/);
    assert.equal(reply, undefined);
    page = 1;
    await cmd.execute(s.i, s.context);
    assert(reply.embeds[0].data.description.includes('line \\*\\*two\\*\\* end'));
    assert.equal(s.context.cases.warnings('guild', ids.target)[0].reason, reason);
  } finally {
    s.db.close();
  }
});

test('individual warning edit/clear exact active target/guild transactional case and bounded active-only export', async () => {
  const s = setup();
  try {
    await moderate(s.i, s.context, { action: 'warn', targetId: ids.target, reason: 'Original' });
    const warning = s.context.cases.warnings('guild', ids.target)[0];
    s.i.id = 'edit';
    await moderate(s.i, s.context, {
      action: 'editwarning',
      targetId: ids.target,
      warningId: warning.id,
      reason: 'New reason',
      confirm: true,
    });
    assert.equal(s.context.cases.warnings('guild', ids.target)[0].reason, 'New reason');
    const exported = await moderate(s.i, s.context, {
      action: 'exportwarnings',
      targetId: ids.target,
    });
    assert.equal(exported.warningExport.total, 1);
    assert.deepEqual(Object.keys(exported.warningExport.rows[0]).sort(), [
      'created_at',
      'id',
      'reason',
    ]);
    assert.throws(() => s.context.cases.activeWarning(warning.id, 'other', ids.target));
    assert.throws(() => s.context.cases.activeWarning(warning.id, 'guild', ids.owner));
    s.i.id = 'clear';
    await moderate(s.i, s.context, {
      action: 'clearwarning',
      targetId: ids.target,
      warningId: warning.id,
      confirm: true,
    });
    assert.equal(s.context.cases.exportWarnings('guild', ids.target).total, 0);
    s.i.id = 'again';
    await assert.rejects(() =>
      moderate(s.i, s.context, {
        action: 'editwarning',
        targetId: ids.target,
        warningId: warning.id,
        reason: 'x',
        confirm: true,
      }),
    );
    assert.equal(s.calls.length, 0);
    const insert = s.db.prepare(
      'INSERT INTO warnings(guild_id,target_id,actor_id,reason,created_at) VALUES(?,?,?,?,?)',
    );
    s.db.transaction(() => {
      for (let n = 0; n < 2001; n++) insert.run('guild', ids.target, ids.actor, 'r', n);
    })();
    const r = s.context.cases.exportWarnings('guild', ids.target);
    assert.equal(r.rows.length, 2000);
    assert.equal(r.total, 2001);
    assert.equal(r.truncated, true);
  } finally {
    s.db.close();
  }
});
test('individual warning mutations require confirmation/currentauthority/hierarchy and rollback on case storage failure', async () => {
  for (const kind of ['confirm', 'permission', 'hierarchy', 'storage']) {
    const s = setup();
    try {
      await moderate(s.i, s.context, { action: 'warn', targetId: ids.target, reason: 'Original' });
      const id = s.context.cases.warnings('guild', ids.target)[0].id;
      s.i.id = 'edit';
      if (kind === 'permission') s.actor.permissions.has = () => false;
      if (kind === 'hierarchy') s.target.roles.highest.position = 9;
      if (kind === 'storage')
        s.context.cases.finish = () => {
          throw Error('db');
        };
      await assert.rejects(() =>
        moderate(s.i, s.context, {
          action: 'editwarning',
          targetId: ids.target,
          warningId: id,
          reason: 'New',
          confirm: kind !== 'confirm',
        }),
      );
      assert.equal(s.context.cases.warnings('guild', ids.target)[0].reason, 'Original');
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 1);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('individual warning three commands private3locale embeds/JSON bytes/exact records no native action', async () => {
  const { default: command } = await import('../src/commands/moderation/moderation.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      await moderate(s.i, s.context, { action: 'warn', targetId: ids.target, reason: 'Original' });
      const id = s.context.cases.warnings('guild', ids.target)[0].id;
      s.context.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'exportwarnings',
        reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => sub,
        getUser: () => ({ id: ids.target }),
        getInteger: () => id,
        getBoolean: () => true,
        getString: () => 'Updated',
      };
      await command.execute(s.i, s.context);
      assert.equal(JSON.parse(reply.files[0].attachment.toString()).rows[0].reason, 'Original');
      for (sub of ['editwarning', 'clearwarning']) {
        s.i.id = sub;
        await command.execute(s.i, s.context);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.calls.length, 0);
      assert.equal(s.context.cases.exportWarnings('guild', ids.target).total, 0);
    } finally {
      s.db.close();
    }
  }
});
