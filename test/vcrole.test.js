import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { VoiceRoles, createVoiceRoleHandler } from '../src/services/vcrole.js';
import command from '../src/commands/voice/vcrole.js';
const g = '100000000000000001',
  actorId = '100000000000000002',
  botId = '100000000000000003',
  userId = '100000000000000004',
  roleId = '100000000000000005',
  channelId = '100000000000000006';
function setup() {
  const db = openDatabase(':memory:'),
    voiceRoles = new VoiceRoles(db),
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
    id: userId,
    guild: { id: g },
    user: { bot: false },
    voice: { channelId },
    roles: {
      highest: {},
      cache: new Map(),
      add: async (r) => {
        calls.push('add');
        member.roles.cache.set(r.id, r);
      },
      remove: async (r) => {
        calls.push('remove');
        member.roles.cache.delete(r.id);
      },
    },
  };
  const members = new Map([
    [actorId, actor],
    [userId, member],
  ]);
  const guild = {
      id: g,
      ownerId: '100000000000000099',
      members: { fetch: async ({ user }) => members.get(user), fetchMe: async () => bot },
      roles: { fetch: async () => role },
    },
    client = { user: { id: botId } };
  const state = { id: userId, guild, client, channelId },
    old = { ...state, channelId: null };
  const c = {
    db,
    voiceRoles,
    voiceReadiness: { require: () => {} },
    config: { voiceEventsEnabled: true },
    guildConfig: { get: () => ({ language: 'en' }) },
    logger: { warn: () => {} },
  };
  return {
    db,
    c,
    calls,
    voiceRoles,
    actor,
    bot,
    member,
    role,
    guild,
    client,
    state,
    old,
    rule: () => voiceRoles.set(g, roleId, actorId),
  };
}
test('vcrole policy persistentisolated replace/remove keeps retainedownedgrants restartambiguityfreeze', () => {
  const s = setup();
  try {
    s.rule();
    const old = s.voiceRoles.get(g);
    s.rule();
    assert.notEqual(s.voiceRoles.get(g).revision, old.revision);
    assert.equal(s.voiceRoles.get('other'), null);
    assert(s.voiceRoles.reserve(g, userId, roleId));
    s.voiceRoles.recover();
    assert.equal(s.voiceRoles.grants(g, userId)[0].status, 'uncertain');
    s.voiceRoles.remove(g);
    assert.equal(s.voiceRoles.grants(g, userId).length, 1);
  } finally {
    s.db.close();
  }
});
test('vcrole futurejoin ownedgrant forcedobserve disconnectcleanup afterpolicyremoved no preexistingrole strip', async () => {
  const s = setup();
  try {
    s.rule();
    const handler = createVoiceRoleHandler(s.c);
    await handler(s.old, s.state);
    assert.deepEqual(s.calls, ['add']);
    assert.equal(s.voiceRoles.grants(g, userId)[0].status, 'granted');
    s.voiceRoles.remove(g);
    s.member.voice.channelId = null;
    await handler(s.state, { ...s.state, channelId: null });
    assert.deepEqual(s.calls, ['add', 'remove']);
    assert.equal(s.voiceRoles.grants(g, userId).length, 0);
  } finally {
    s.db.close();
  }
  const pre = setup();
  try {
    pre.rule();
    pre.member.roles.cache.set(roleId, pre.role);
    const handler = createVoiceRoleHandler(pre.c);
    await handler(pre.old, pre.state);
    assert.equal(pre.voiceRoles.grants(g, userId).length, 0);
    pre.member.voice.channelId = null;
    await handler(pre.state, { ...pre.state, channelId: null });
    assert.equal(pre.calls.length, 0);
    assert(pre.member.roles.cache.has(roleId));
  } finally {
    pre.db.close();
  }
});
test('vcrole strict nativepermission hierarchy botkind identity voice/config races no grants', async () => {
  for (const mutate of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.role.permissions.has = () => true),
    (s) => (s.role.managed = true),
    (s) => (s.member.user.bot = true),
    (s) => (s.member.voice.channelId = null),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.role.guild.id = 'other'),
    (s) => (s.c.config.voiceEventsEnabled = false),
    (s) =>
      (s.c.voiceReadiness.require = () => {
        throw Error('shard');
      }),
  ]) {
    const s = setup();
    try {
      s.rule();
      mutate(s);
      await createVoiceRoleHandler(s.c)(s.old, s.state);
      assert.equal(s.calls.length, 0);
      assert.equal(s.voiceRoles.grants(g, userId).length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    s.rule();
    s.guild.roles.fetch = async () => {
      s.voiceRoles.remove(g);
      return s.role;
    };
    await createVoiceRoleHandler(s.c)(s.old, s.state);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('vcrole ambiguousgrant or removal frozen no repeat effects retainedpolicy independent', async () => {
  const s = setup();
  try {
    s.rule();
    s.member.roles.add = async () => {
      s.calls.push('attempt');
      throw Error('network');
    };
    const h = createVoiceRoleHandler(s.c);
    await h(s.old, s.state);
    await h(s.old, s.state);
    assert.equal(s.calls.length, 1);
    assert.equal(s.voiceRoles.grants(g, userId)[0].status, 'uncertain');
    s.member.voice.channelId = null;
    await h(s.state, { ...s.state, channelId: null });
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
  const r = setup();
  try {
    r.rule();
    const h = createVoiceRoleHandler(r.c);
    await h(r.old, r.state);
    r.member.voice.channelId = null;
    r.member.roles.remove = async () => {
      r.calls.push('removeattempt');
      throw Error('network');
    };
    await h(r.state, { ...r.state, channelId: null });
    await h(r.state, { ...r.state, channelId: null });
    assert.deepEqual(r.calls, ['add', 'removeattempt']);
    assert.equal(r.voiceRoles.grants(g, userId)[0].status, 'uncertain');
  } finally {
    r.db.close();
  }
});
test('vcrole unchangedchannel muteupdates ignored and overlappingstate changes failclosed postobserve', async () => {
  const s = setup();
  try {
    s.rule();
    const h = createVoiceRoleHandler(s.c);
    await h(s.state, s.state);
    assert.equal(s.calls.length, 0);
    s.member.roles.add = async (r) => {
      s.calls.push('add');
      s.member.roles.cache.set(r.id, r);
      s.member.voice.channelId = null;
      await h(s.state, { ...s.state, channelId: null });
    };
    await h(s.old, s.state);
    assert.equal(s.voiceRoles.grants(g, userId)[0].status, 'uncertain');
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('3vcrolepaths private3locale exactpolicy JSON no configeffects currentmanagerdenied', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let reply;
      s.c.guildConfig.get = () => ({ language });
      const i = {
        guildId: g,
        guild: s.guild,
        user: { id: actorId },
        client: s.client,
        appPermissions: { has: () => true },
        options: { getSubcommand: () => 'add', getRole: () => s.role },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), { roleId, grants: [] });
      assert.equal(s.calls.length, 0);
      for (const sub of ['show', 'remove']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
      }
      assert.equal(s.voiceRoles.get(g), null);
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
    } finally {
      s.db.close();
    }
  }
});
