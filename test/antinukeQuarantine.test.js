import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import {
  AntinukeAlerts,
  createAntinukeHandler,
  ensureQuarantineRole,
  validatePunishRole,
  releaseQuarantine,
} from '../src/services/antinuke.js';
const ids = {
  actor: '100000000000000001',
  owner: '100000000000000002',
  bot: '100000000000000003',
  trusted: '100000000000000005',
};
let seq = 0;
const entry = (action, executorId = ids.actor) => ({
  id: String(100000000000001000n + BigInt(seq++)),
  executorId,
  action,
  createdTimestamp: Date.now(),
});
function fakeGuild({
  actorPosition = 1,
  botPosition = 10,
  botCanManageRoles = true,
  failSet = false,
} = {}) {
  const added = [],
    sets = [],
    adminRole = { id: '900000000000000050', name: 'Admin', managed: false },
    integrationRole = { id: '900000000000000051', name: 'Bot', managed: true };
  const roles = new Map();
  roles.find = (fn) => [...roles.values()].find(fn);
  const created = [];
  const makeChannel = (id) => {
    const cache = new Map();
    return {
      id,
      isThread: () => false,
      permissionOverwrites: {
        cache,
        edit: async (role, perms) => {
          cache.set(role.id, {
            deny: { has: (f) => perms.ViewChannel === false && f === P.ViewChannel },
          });
        },
      },
    };
  };
  const channels = new Map([
    ['c1', makeChannel('c1')],
    ['c2', makeChannel('c2')],
    ['c3', makeChannel('c3')],
  ]);
  const members = new Map([
    [
      ids.actor,
      {
        id: ids.actor,
        roles: {
          highest: { position: actorPosition },
          cache: new Map([
            [adminRole.id, adminRole],
            [integrationRole.id, integrationRole],
          ]),
          add: async (r) => added.push(r.id),
          set: async (list) => {
            if (failSet) throw new Error('missing permissions');
            sets.push(list);
            for (const id of list) if (id !== integrationRole.id) added.push(id);
          },
        },
      },
    ],
  ]);
  const bot = {
    id: ids.bot,
    permissions: { has: () => botCanManageRoles },
    roles: { highest: { position: botPosition } },
  };
  return {
    id: 'g',
    ownerId: ids.owner,
    client: { user: { id: ids.bot } },
    added,
    sets,
    memberMap: members,
    adminRole,
    integrationRole,
    created,
    channels: { cache: channels, fetch: async () => {} },
    roles: {
      cache: roles,
      fetch: async () => {},
      create: async (o) => {
        const r = { id: '900000000000000001', name: o.name, position: 1, managed: false };
        created.push(o);
        roles.set(r.id, r);
        return r;
      },
    },
    members: { me: bot, fetch: async (id) => members.get(id) ?? null },
  };
}
function setup(config = {}) {
  const db = openDatabase(':memory:'),
    antinuke = new AntinukeAlerts(db);
  antinuke.patch('g', { enabled: true, ...config });
  const c = {
    config: { auditEventsEnabled: true },
    antinuke,
    localization: { locale: () => 'en', t: (_g, k) => k },
    logger: { warn() {} },
  };
  return { db, antinuke, c, handler: createAntinukeHandler(c) };
}
async function fire(handler, guild, action, n, executorId) {
  for (let i = 0; i < n; i++) await handler(entry(action, executorId), guild);
}
test('3 channel deletes quarantine the actor with a role that hides every channel', async () => {
  const { db, handler } = setup();
  try {
    const guild = fakeGuild();
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 2);
    assert.equal(guild.added.length, 0);
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 1);
    assert.equal(guild.added.length, 1);
    assert.equal(guild.created[0].name, 'Quarantine');
    assert.deepEqual(guild.created[0].permissions, []);
    for (const ch of guild.channels.cache.values())
      assert.equal(ch.permissionOverwrites.cache.size, 1);
  } finally {
    db.close();
  }
});
test('3 bans or 3 kicks quarantine, 2 do not, and kinds are not mixed', async () => {
  for (const action of [AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberKick]) {
    const { db, handler } = setup();
    try {
      const guild = fakeGuild();
      await fire(handler, guild, action, 2);
      assert.equal(guild.added.length, 0);
      await fire(handler, guild, action, 1);
      assert.equal(guild.added.length, 1);
    } finally {
      db.close();
    }
  }
  const { db, handler } = setup();
  try {
    const guild = fakeGuild();
    await fire(handler, guild, AuditLogEvent.MemberBanAdd, 2);
    await fire(handler, guild, AuditLogEvent.MemberKick, 2);
    assert.equal(guild.added.length, 0);
  } finally {
    db.close();
  }
});
test('owner, bot and trusted users are never quarantined', async () => {
  const { db, antinuke, handler } = setup();
  try {
    antinuke.trust('g', ids.trusted, true);
    const guild = fakeGuild();
    for (const who of [ids.owner, ids.bot, ids.trusted])
      await fire(handler, guild, AuditLogEvent.ChannelDelete, 5, who);
    assert.equal(guild.added.length, 0);
    assert.equal(guild.created.length, 0);
  } finally {
    db.close();
  }
});
test('actor at or above the bot in the hierarchy is skipped', async () => {
  const { db, handler } = setup();
  try {
    const guild = fakeGuild({ actorPosition: 10, botPosition: 10 });
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 3);
    assert.equal(guild.added.length, 0);
  } finally {
    db.close();
  }
});
test('quarantine off or missing Manage Roles does nothing', async () => {
  const off = setup({ quarantine: { enabled: false } });
  const noPerm = setup();
  try {
    const a = fakeGuild();
    await fire(off.handler, a, AuditLogEvent.ChannelDelete, 3);
    assert.equal(a.added.length, 0);
    const b = fakeGuild({ botCanManageRoles: false });
    await fire(noPerm.handler, b, AuditLogEvent.ChannelDelete, 3);
    assert.equal(b.added.length, 0);
  } finally {
    off.db.close();
    noPerm.db.close();
  }
});
test('ensureQuarantineRole reuses the role and is idempotent on channels', async () => {
  const { db, antinuke } = setup();
  try {
    const guild = fakeGuild();
    const first = await ensureQuarantineRole(guild, antinuke);
    assert.equal(first.created, true);
    assert.equal(first.hidden, 3);
    const second = await ensureQuarantineRole(guild, antinuke);
    assert.equal(second.created, false);
    assert.equal(second.hidden, 0);
    assert.equal(guild.created.length, 1);
    assert.equal(antinuke.get('g').quarantine.roleId, first.role.id);
  } finally {
    db.close();
  }
});
test('admin-chosen punish role is used, revalidated at apply time, never replaced silently', async () => {
  const { db, antinuke, handler } = setup();
  try {
    const guild = fakeGuild();
    const chosen = {
      id: '900000000000000077',
      name: 'Jail',
      position: 3,
      managed: false,
      guild: { id: 'g' },
    };
    guild.roles.cache.set(chosen.id, chosen);
    antinuke.setPunishRole('g', chosen.id);
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 3);
    assert.deepEqual(guild.added, [chosen.id]);
    assert.equal(guild.created.length, 0);
    for (const ch of guild.channels.cache.values())
      assert.equal(ch.permissionOverwrites.cache.has(chosen.id), true);
    // Role becomes managed or rises above the bot: nothing is applied and no default role appears.
    for (const bad of [{ managed: true }, { position: 10 }]) {
      Object.assign(chosen, { managed: false, position: 3 }, bad);
      const g2 = fakeGuild();
      g2.roles.cache.set(chosen.id, chosen);
      const m = await g2.members.fetch(ids.actor);
      m.roles.cache.clear();
      await fire(handler, g2, AuditLogEvent.MemberKick, 3);
      assert.equal(g2.added.length, 0);
      assert.equal(g2.created.length, 0);
    }
    // Missing role also blocks, and clearing falls back to the default Quarantine role.
    const g3 = fakeGuild();
    await fire(handler, g3, AuditLogEvent.MemberBanAdd, 3);
    assert.equal(g3.added.length, 0);
    antinuke.setPunishRole('g', null);
    assert.equal(antinuke.get('g').quarantine.punishRoleId, undefined);
    await fire(handler, g3, AuditLogEvent.ChannelDelete, 3);
    assert.equal(g3.created[0].name, 'Quarantine');
  } finally {
    db.close();
  }
});

test('quarantine strips every removable role, keeps managed ones, leaves only the punish role', async () => {
  const { db, handler } = setup();
  try {
    const guild = fakeGuild();
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 3);
    assert.equal(guild.sets.length, 1);
    assert.deepEqual(guild.sets[0], [guild.integrationRole.id, '900000000000000001']);
    assert.ok(!guild.sets[0].includes(guild.adminRole.id));
  } finally {
    db.close();
  }
});
test('if roles cannot be replaced the punish role is still added', async () => {
  const { db, handler } = setup();
  try {
    const guild = fakeGuild({ failSet: true });
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 3);
    assert.deepEqual(guild.added, ['900000000000000001']);
  } finally {
    db.close();
  }
});
test('a punish role with dangerous permissions is refused at set and apply time', async () => {
  const { db, antinuke, handler } = setup();
  try {
    const guild = fakeGuild();
    const risky = {
      id: '900000000000000088',
      name: 'Risky',
      position: 3,
      managed: false,
      guild: { id: 'g' },
      permissions: { has: (f) => f === P.Administrator },
    };
    guild.roles.cache.set(risky.id, risky);
    assert.throws(() => validatePunishRole(risky, guild.members.me, guild), {
      message: 'roleDangerous',
    });
    antinuke.setPunishRole('g', risky.id);
    await fire(handler, guild, AuditLogEvent.ChannelDelete, 3);
    assert.equal(guild.added.length, 0);
    assert.equal(guild.sets.length, 0);
    assert.equal(guild.created.length, 0);
  } finally {
    db.close();
  }
});

async function quarantined(config = {}) {
  const ctx = setup({ quarantine: { tamperHold: false, ...config } });
  const guild = fakeGuild();
  await fire(ctx.handler, guild, AuditLogEvent.ChannelDelete, 3);
  const member = guild.memberMap.get(ids.actor);
  return { ...ctx, guild, member };
}
const roleUpdate = (
  targetId,
  action = AuditLogEvent.MemberRoleUpdate,
  executorId = ids.trusted,
) => ({
  ...entry(action, executorId),
  targetId,
});
test('tamper-hold is off by default and changes nothing', async () => {
  const { db, antinuke, handler, guild, member } = await quarantined();
  try {
    assert.equal(antinuke.get('g').quarantine.tamperHold, false);
    member.roles.cache = new Map();
    const before = guild.sets.length;
    await handler(roleUpdate(ids.actor), guild);
    assert.equal(guild.sets.length, before);
  } finally {
    db.close();
  }
});
test('tamper-hold re-applies the punish role and strips regained roles when enabled', async () => {
  const { db, antinuke, handler, guild, member } = await quarantined();
  try {
    antinuke.setTamperHold('g', true);
    const before = guild.sets.length;
    member.roles.cache = new Map([[guild.adminRole.id, guild.adminRole]]);
    await handler(roleUpdate(ids.actor), guild);
    assert.equal(guild.sets.length, before + 1);
    assert.deepEqual(guild.sets.at(-1), ['900000000000000001']);
    // Already correct: no second write, so the repair cannot loop.
    member.roles.cache = new Map([
      ['900000000000000001', guild.roles.cache.get('900000000000000001')],
    ]);
    await handler(roleUpdate(ids.actor), guild);
    assert.equal(guild.sets.length, before + 1);
    // Emika's own role changes and unrelated members are ignored.
    member.roles.cache = new Map();
    await handler(roleUpdate(ids.actor, AuditLogEvent.MemberRoleUpdate, ids.bot), guild);
    await handler(roleUpdate(ids.trusted), guild);
    assert.equal(guild.sets.length, before + 1);
  } finally {
    db.close();
  }
});
test('tamper-hold re-hides channels when quarantine overwrites are edited', async () => {
  const { db, antinuke, handler, guild } = await quarantined();
  try {
    antinuke.setTamperHold('g', true);
    guild.channels.cache.get('c2').permissionOverwrites.cache.clear();
    await handler(roleUpdate(null, AuditLogEvent.ChannelOverwriteUpdate), guild);
    assert.equal(guild.channels.cache.get('c2').permissionOverwrites.cache.size, 1);
  } finally {
    db.close();
  }
});
test('tamper-hold resets dangerous permissions on the default role but only warns for a chosen role', async () => {
  const { db, antinuke, handler, guild } = await quarantined();
  try {
    antinuke.setTamperHold('g', true);
    const role = guild.roles.cache.get('900000000000000001');
    const resets = [];
    role.setPermissions = async (p) => resets.push(p);
    role.permissions = { has: (f) => f === P.Administrator };
    await handler(roleUpdate(role.id, AuditLogEvent.RoleUpdate), guild);
    assert.deepEqual(resets, [[]]);
    antinuke.setPunishRole('g', role.id);
    await handler(roleUpdate(role.id, AuditLogEvent.RoleUpdate), guild);
    assert.equal(resets.length, 1);
  } finally {
    db.close();
  }
});
test('release gives back removed roles that still exist and drops the punish role', async () => {
  const { db, antinuke, guild, member } = await quarantined();
  try {
    guild.roles.cache.set(guild.adminRole.id, { ...guild.adminRole, position: 2 });
    member.roles.cache = new Map([
      ['900000000000000001', guild.roles.cache.get('900000000000000001')],
    ]);
    const out = await releaseQuarantine(guild, antinuke, ids.actor);
    assert.equal(out.restored, 1);
    assert.deepEqual(guild.sets.at(-1), [guild.adminRole.id]);
    assert.equal(antinuke.quarantinedRow('g', ids.actor), null);
    await assert.rejects(() => releaseQuarantine(guild, antinuke, ids.actor), {
      message: 'antinukeNotQuarantined',
    });
  } finally {
    db.close();
  }
});
