import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AutoRoles, createAutoRoleHandler } from '../src/services/autorole.js';
import command from '../src/commands/automations/autorole.js';
import { PermissionFlagsBits as P } from 'discord.js';
const g = '100000000000000001',
  actorId = '100000000000000002',
  botId = '100000000000000003',
  targetId = '100000000000000004',
  roleId = '100000000000000005',
  now = 1000000;
function setup(isBot = false) {
  const db = openDatabase(':memory:'),
    autoroles = new AutoRoles(db, () => now),
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
  const role = { id: roleId, guild: { id: g }, managed: false, permissions: { has: () => false } };
  const member = {
    id: targetId,
    guild: { id: g },
    user: { bot: isBot },
    joinedTimestamp: now,
    roles: {
      highest: {},
      cache: new Map(),
      add: async (r) => {
        calls.push(r.id);
        member.roles.cache.set(r.id, r);
      },
    },
  };
  const members = new Map([
    [actorId, actor],
    [botId, bot],
    [targetId, member],
  ]);
  const guild = {
    id: g,
    ownerId: '100000000000000099',
    members: { fetch: async ({ user }) => members.get(user), fetchMe: async () => bot },
    roles: { fetch: async () => role },
  };
  const event = { ...member, guild, client: { user: { id: botId } } };
  const c = {
    db,
    autoroles,
    config: { memberEventsEnabled: true },
    logger: { warn: () => {} },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return {
    db,
    autoroles,
    c,
    calls,
    actor,
    bot,
    role,
    member,
    members,
    guild,
    event,
    rule: () => autoroles.add(g, isBot ? 'bots' : 'humans', roleId, actorId),
  };
}
test('autorole persistentisolatedhumanbotpolicy caps exact removal/reset unique revision safe input', () => {
  const s = setup();
  try {
    s.rule();
    assert.equal(new AutoRoles(s.db).list(g).length, 1);
    assert.equal(s.autoroles.list('other').length, 0);
    const previous = s.autoroles.list(g)[0];
    s.rule();
    assert.equal(s.autoroles.matches(g, previous), false);
    assert.equal(s.autoroles.list(g, 'bots').length, 0);
    for (let n = 1; n <= 9; n++)
      s.autoroles.add(g, 'humans', String(BigInt(roleId) + BigInt(n)), actorId);
    assert.throws(
      () => s.autoroles.add(g, 'humans', String(BigInt(roleId) + 10n), actorId),
      /autoroleLimit/,
    );
    assert.throws(() => s.autoroles.add(g, 'all', roleId, actorId), /autoroleInput/);
    assert.equal(s.autoroles.remove(g, 'humans', roleId), 1);
    s.autoroles.add(g, 'bots', roleId, actorId);
    assert.equal(s.autoroles.reset(g, 'humans'), 9);
    assert.equal(s.autoroles.list(g).length, 1);
    assert.equal(s.autoroles.reset(g, 'all'), 1);
  } finally {
    s.db.close();
  }
});
test('autorole human/bot futurejoin exactgrant forcedobserve replaydedup no retroactive behavior', async () => {
  for (const isBot of [false, true]) {
    const s = setup(isBot);
    try {
      s.rule();
      const handler = createAutoRoleHandler(s.c);
      await handler(s.event);
      assert.deepEqual(s.calls, [roleId]);
      assert.equal(s.db.prepare('SELECT status FROM autorole_receipts').get().status, 'completed');
      s.member.roles.cache.clear();
      await handler(s.event);
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('autorole dangerousrole hierarchy foreign actor/member/bot joinstale and disabled guard matrix', async () => {
  for (const mutate of [
    (s) => (s.role.permissions.has = (p) => p === P.Administrator),
    (s) => (s.role.managed = true),
    (s) => (s.role.guild.id = 'other'),
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.actor.roles.highest.comparePositionTo = () => 0),
    (s) => (s.member.guild.id = 'other'),
    (s) => (s.member.user.bot = true),
    (s) => (s.c.config.memberEventsEnabled = false),
    (s) => (s.event.joinedTimestamp = now - 300000),
    (s) => (s.event.joinedTimestamp = now + 1),
    (s) => (s.role.id = g),
  ]) {
    const s = setup();
    try {
      s.rule();
      mutate(s);
      await createAutoRoleHandler(s.c)(s.event);
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM autorole_receipts').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('autorole submittedfailure restart uncertainty no retry and policyremove race prevents grant', async () => {
  const s = setup();
  try {
    s.rule();
    s.member.roles.add = async () => {
      s.calls.push('attempt');
      throw Error('network');
    };
    const handler = createAutoRoleHandler(s.c);
    await handler(s.event);
    await handler(s.event);
    assert.equal(s.calls.length, 1);
    assert.equal(s.db.prepare('SELECT status FROM autorole_receipts').get().status, 'uncertain');
    assert(s.autoroles.reserve('reserved', g));
    s.autoroles.recover();
    assert.equal(
      s.db.prepare('SELECT status FROM autorole_receipts WHERE event_key=?').get('reserved').status,
      'uncertain',
    );
  } finally {
    s.db.close();
  }
  const race = setup();
  try {
    race.rule();
    race.guild.roles.fetch = async () => {
      race.autoroles.reset(g, 'all');
      return race.role;
    };
    await createAutoRoleHandler(race.c)(race.event);
    assert.equal(race.calls.length, 0);
  } finally {
    race.db.close();
  }
});
test('4autorolepaths freshmanager gates private3locale policybytes roles unchanged no commandgrant', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let reply;
      s.c.guildConfig.get = () => ({ language });
      const i = {
        guildId: g,
        guild: s.guild,
        user: { id: actorId },
        client: { user: { id: botId } },
        appPermissions: { has: () => true },
        options: {
          getSubcommand: () => 'add',
          getString: (key) => (key === 'kind' ? 'humans' : roleId),
          getRole: () => s.role,
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(s.autoroles.list(g).length, 1);
      assert.equal(s.calls.length, 0);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), {
        records: [{ kind: 'humans', roleId }],
      });
      for (const sub of ['config', 'remove', 'reset']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
      }
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
test('autorole missingverification fields failclosed and deniedadd leavespolicy empty', async () => {
  const s = setup();
  try {
    s.c.config.memberEventsEnabled = false;
    const i = {
      guildId: g,
      guild: s.guild,
      user: { id: actorId },
      options: { getSubcommand: () => 'add' },
    };
    await assert.rejects(() => command.execute(i, s.c), /autoroleEvents/);
    assert.equal(s.autoroles.list(g).length, 0);
    s.c.config.memberEventsEnabled = true;
    s.rule();
    s.member.joinedTimestamp = null;
    await createAutoRoleHandler(s.c)(s.event);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
