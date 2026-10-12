import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { assignSafeRole, createSafeRole } from '../src/services/roleAssignments.js';
import command from '../src/commands/moderation/role.js';
import { translate } from '../src/services/localization.js';
const g = '100000000000000001',
  actorId = '100000000000000002',
  botId = '100000000000000003',
  targetId = '100000000000000004',
  roleId = '100000000000000005';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const actor = {
      id: actorId,
      guild: { id: g },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 1 } },
    },
    bot = {
      id: botId,
      guild: { id: g },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 1 } },
    };
  const role = {
    id: roleId,
    guild: { id: g },
    name: 'Test',
    managed: false,
    hoist: false,
    mentionable: false,
    permissions: { has: () => false, bitfield: 0n },
  };
  const target = {
    id: targetId,
    guild: { id: g },
    user: { bot: false },
    roles: {
      highest: {},
      cache: new Map(),
      add: async (r) => {
        calls.push('add');
        target.roles.cache.set(r.id, r);
      },
      remove: async (r) => {
        calls.push('remove');
        target.roles.cache.delete(r.id);
      },
    },
  };
  const members = new Map([
    [actorId, actor],
    [targetId, target],
  ]);
  const i = {
    id: 'test',
    guildId: g,
    user: { id: actorId },
    client: { user: { id: botId } },
    appPermissions: { has: () => true },
    guild: {
      id: g,
      ownerId: '100000000000000099',
      members: { fetch: async ({ user }) => members.get(user), fetchMe: async () => bot },
      roles: {
        fetch: async () => role,
        create: async (opts) => {
          calls.push(opts);
          role.name = opts.name;
          return role;
        },
      },
    },
  };
  return { db, c: { cases: new ModerationCases(db) }, calls, actor, bot, target, role, i };
}
test('reference role singlehuman add/remove exactmembership postobserve cases no-op no permission edit', async () => {
  const s = setup();
  try {
    await assignSafeRole(s.i, s.c, { targetId, roleId, confirm: true });
    assert.deepEqual(s.calls, ['add']);
    assert.equal(
      (await assignSafeRole({ ...s.i, id: 'noop' }, s.c, { targetId, roleId, confirm: true }))
        .changed,
      false,
    );
    await assignSafeRole({ ...s.i, id: 'remove' }, s.c, {
      targetId,
      roleId,
      remove: true,
      confirm: true,
    });
    assert.deepEqual(s.calls, ['add', 'remove']);
    assert.deepEqual(
      s.db
        .prepare('SELECT status FROM moderation_cases')
        .all()
        .map((r) => r.status),
      ['completed', 'completed'],
    );
  } finally {
    s.db.close();
  }
});
test('reference role assignments strictconfirm nativeidentity dangerousroles hierarchy deny no effects', async () => {
  for (const mutate of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.actor.roles.highest.comparePositionTo = () => 0),
    (s) => (s.target.user.bot = true),
    (s) => (s.role.permissions.has = () => true),
    (s) => (s.role.managed = true),
    (s) => (s.target.guild.id = 'other'),
    (s) => (s.i.appPermissions.has = () => false),
  ]) {
    const s = setup();
    try {
      mutate(s);
      await assert.rejects(() => assignSafeRole(s.i, s.c, { targetId, roleId, confirm: true }));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    await assert.rejects(
      () => assignSafeRole(s.i, s.c, { targetId, roleId, confirm: false }),
      /safeRoleEditConfirm/,
    );
    s.db
      .prepare("INSERT INTO autorole_policy VALUES(?, 'humans',?,?,?)")
      .run(g, roleId, actorId, 'r');
    await assert.rejects(
      () => assignSafeRole(s.i, s.c, { targetId, roleId, confirm: true }),
      /roleInvalid/,
    );
  } finally {
    s.db.close();
  }
});
test('reference role unknownassignment freezes subsequenttarget actions and doesnot retry', async () => {
  const s = setup();
  try {
    s.target.roles.add = async () => {
      s.calls.push('attempt');
      throw Error('network');
    };
    await assert.rejects(
      () => assignSafeRole(s.i, s.c, { targetId, roleId, confirm: true }),
      /safeRoleEditUncertain/,
    );
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'uncertain');
    await assert.rejects(
      () => assignSafeRole({ ...s.i, id: 'retry' }, s.c, { targetId, roleId, confirm: true }),
      /safeRoleEditUncertain/,
    );
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('reference safe role create exactzero permissions flags no assignments unknowncreationguildfreeze', async () => {
  const s = setup();
  try {
    const result = await createSafeRole(s.i, s.c, { name: 'New', confirm: true });
    assert.equal(result.roleId, roleId);
    assert.deepEqual(s.calls[0].permissions, []);
    assert.equal(s.calls[0].mentionable, false);
    assert.equal(s.calls[0].hoist, false);
    assert.equal(s.target.roles.cache.size, 0);
    for (const name of ['', ' New', 'x@everyone', 'x\n'])
      await assert.rejects(
        () => createSafeRole(s.i, s.c, { name, confirm: true }),
        /safeRoleEditInput/,
      );
  } finally {
    s.db.close();
  }
  const bad = setup();
  try {
    bad.i.guild.roles.create = async () => {
      bad.calls.push('attempt');
      return {};
    };
    await assert.rejects(
      () => createSafeRole(bad.i, bad.c, { name: 'New', confirm: true }),
      /safeRoleEditUncertain/,
    );
    await assert.rejects(
      () => createSafeRole({ ...bad.i, id: 'retry' }, bad.c, { name: 'Again', confirm: true }),
      /safeRoleEditUncertain/,
    );
    assert.equal(bad.calls.length, 1);
  } finally {
    bad.db.close();
  }
});
test('3reference rolepaths private3locale confirmedoutput branding noping precise effect routing', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['add', 'remove', 'create']) {
      const s = setup();
      try {
        let deferred, reply;
        if (sub === 'remove') s.target.roles.cache.set(roleId, s.role);
        s.c.localization = { locale: () => locale, t: (_, key) => translate(locale, key) };
        s.i.options = {
          getSubcommand: () => sub,
          getUser: () => ({ id: targetId }),
          getRole: () => s.role,
          getBoolean: () => true,
          getString: () => 'New',
        };
        s.i.deferReply = async (p) => (deferred = p);
        s.i.editReply = async (p) => (reply = p);
        await command.execute(s.i, s.c);
        assert.equal(deferred.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds[0].data.description, translate(locale, 'safeRoleEditSaved'));
      } finally {
        s.db.close();
      }
    }
});
