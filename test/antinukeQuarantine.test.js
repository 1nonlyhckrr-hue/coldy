import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import {
  AntinukeAlerts,
  createAntinukeHandler,
  ensureQuarantineRole,
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
function fakeGuild({ actorPosition = 1, botPosition = 10, botCanManageRoles = true } = {}) {
  const added = [];
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
          cache: new Map(),
          add: async (r) => added.push(r.id),
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
