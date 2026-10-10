import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import {
  RolePanels,
  validateSelfRole,
  createRolePanel,
  createRoleButtonHandler,
} from '../src/services/rolePanels.js';
import { Cooldowns } from '../src/services/cooldowns.js';
import { handleInteractionError } from '../src/utils/errors.js';
import { makeGuild } from './helpers/guild.js';
function setup() {
  const db = openDatabase(':memory:'),
    s = makeGuild(),
    replies = [],
    roles = [];
  const actor = {
    id: 'a',
    permissions: { has: () => true },
    roles: { highest: { comparePositionTo: () => 5 } },
  };
  const bot = {
    id: 'b',
    permissions: { has: () => true },
    roles: { highest: { comparePositionTo: () => 5 } },
  };
  const role = {
    id: '100000000000000003',
    guild: s.guild,
    managed: false,
    permissions: { has: () => false },
  };
  const member = {
    roles: {
      cache: new Map(),
      add: async (r) => roles.push(['add', r.id]),
      remove: async (r) => roles.push(['remove', r.id]),
    },
  };
  s.guild.ownerId = 'owner';
  s.guild.roles = { fetch: async () => role };
  s.guild.members.fetch = async ({ user }) => (user === 'a' ? actor : member);
  s.guild.members.fetchMe = async () => bot;
  s.channel.send = async (v) => {
    s.sent.push(v);
    return { id: 'message' };
  };
  const context = {
    rolePanels: new RolePanels(db),
    cooldowns: new Cooldowns(),
    handleInteractionError,
    logger: { error: () => {}, warn: () => {} },
  };
  const i = {
    id: 'interaction',
    guild: s.guild,
    guildId: 'g',
    channelId: '100000000000000001',
    user: { id: 'a' },
    inGuild: () => true,
    isButton: () => true,
    customId: 'luna:role:1',
    message: { id: 'message' },
    deferReply: async () => {
      i.deferred = true;
    },
    reply: async (v) => replies.push(v),
    editReply: async (v) => replies.push(v),
  };
  return { db, s, actor, bot, role, member, context, i, replies, roles };
}
test('unsafe roles are denied separately', () => {
  for (const change of [
    (x) => (x.role.permissions.has = (p) => p === P.ManageRoles),
    (x) => (x.role.managed = true),
    (x) => (x.role.guild = { id: 'foreign' }),
    (x) => (x.role.id = 'g'),
    (x) => (x.bot.roles.highest.comparePositionTo = () => 0),
    (x) => (x.actor.roles.highest.comparePositionTo = () => 0),
  ]) {
    const x = setup();
    try {
      change(x);
      assert.throws(() => validateSelfRole(x.role, x.bot, x.actor, x.s.guild));
    } finally {
      x.db.close();
    }
  }
});
test('panel publication persists message and rejects duplicate source interaction', async () => {
  const x = setup();
  try {
    const result = await createRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'Member',
    });
    assert.equal(result.panelId, 1);
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'active');
    assert.equal(x.context.rolePanels.get(1, 'other'), undefined);
    assert.equal(x.s.sent[0].components[0].toJSON().components[0].custom_id, 'luna:role:1');
    await assert.rejects(() =>
      createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      }),
    );
    assert.equal(x.s.sent.length, 1);
  } finally {
    x.db.close();
  }
});
test('unconfirmed panel send recorded uncertain and no retry', async () => {
  const x = setup();
  let count = 0;
  x.s.channel.send = async () => {
    count++;
    throw new Error('network');
  };
  try {
    await assert.rejects(
      () =>
        createRolePanel(x.i, x.context, {
          channelId: x.i.channelId,
          roleId: x.role.id,
          label: 'Member',
        }),
      /rolePanelUncertain/,
    );
    assert.equal(count, 1);
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'uncertain');
  } finally {
    x.db.close();
  }
});
test('button grant and revoke revalidate safe role; cooldown prevents repeats', async () => {
  const x = setup();
  try {
    await createRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'Member',
    });
    x.i.user.id = 'member';
    const h = createRoleButtonHandler(x.context);
    await h(x.i);
    assert.equal(x.roles[0][0], 'add');
    await h(x.i);
    assert.equal(x.roles.length, 1);
    x.context.cooldowns.entries.clear();
    x.member.roles.cache.set(x.role.id, x.role);
    await h(x.i);
    assert.equal(x.roles[1][0], 'remove');
  } finally {
    x.db.close();
  }
});
test('copied messages, foreign/disabled panels and edited dangerous roles refuse grants', async () => {
  for (const mutate of [
    (x) => (x.i.message.id = 'copied'),
    (x) => (x.i.guildId = 'other'),
    (x) => x.context.rolePanels.status(1, 'disabled'),
    (x) => (x.role.permissions.has = (p) => p === P.Administrator),
    (x) => (x.s.guild.roles.fetch = async () => null),
  ]) {
    const x = setup();
    try {
      await createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      });
      x.i.user.id = 'member';
      mutate(x);
      await createRoleButtonHandler(x.context)(x.i);
      assert.equal(x.roles.length, 0);
      assert(x.replies.length);
    } finally {
      x.db.close();
    }
  }
});
test('role API failure is contained and external button ignored', async () => {
  const x = setup();
  try {
    await createRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'Member',
    });
    x.i.user.id = 'member';
    x.member.roles.add = async () => {
      throw new Error('SECRET');
    };
    const h = createRoleButtonHandler(x.context);
    await h(x.i);
    assert(!x.replies[0].embeds[0].data.description.includes('SECRET'));
    x.i.customId = 'other';
    assert.equal(await h(x.i), false);
  } finally {
    x.db.close();
  }
});
test('new or lesser-known staff permission flags fail closed', () => {
  for (const flag of [P.ManageGuildExpressions, P.ManageEvents, P.ViewAuditLog, P.MoveMembers]) {
    const x = setup();
    try {
      x.role.permissions.has = (p) => p === flag;
      assert.throws(() => validateSelfRole(x.role, x.bot, x.actor, x.s.guild));
    } finally {
      x.db.close();
    }
  }
});
test('role panel slash create, list, disable wrapper handles persisted records', async () => {
  const x = setup();
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  let sub = 'create';
  x.i.options = {
    getSubcommand: () => sub,
    getChannel: () => ({ id: x.i.channelId }),
    getRole: () => x.role,
    getString: () => 'Member',
    getInteger: () => 1,
  };
  try {
    await command.execute(x.i, x.context);
    sub = 'list';
    await command.execute(x.i, x.context);
    sub = 'disable';
    await command.execute(x.i, x.context);
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'disabled');
    assert.equal(x.replies.length, 3);
  } finally {
    x.db.close();
  }
});
test('Hindi role-panel publication and button results follow locale', async () => {
  const x = setup();
  const { translate } = await import('../src/services/localization.js');
  x.context.localization = { locale: () => 'hi' };
  try {
    await createRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'Member',
    });
    assert.match(x.s.sent[0].embeds[0].data.description, /भूमिका/);
    x.i.user.id = 'member';
    await createRoleButtonHandler(x.context)(x.i);
    assert.equal(x.replies[0].embeds[0].data.description, translate('hi', 'roleAdded'));
  } finally {
    x.db.close();
  }
});

test('multi-role panel persists exact button mappings and second button chooses its own role', async () => {
  const x = setup();
  const { createMultiRolePanel } = await import('../src/services/rolePanels.js');
  const r2 = { ...x.role, id: '100000000000000004' };
  x.s.guild.roles.fetch = async (id) => (id === r2.id ? r2 : x.role);
  try {
    await createMultiRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      buttons: [
        { roleId: x.role.id, label: 'Member' },
        { roleId: r2.id, label: 'Events' },
      ],
    });
    assert.equal(x.context.rolePanels.buttons(1).length, 2);
    assert.deepEqual(
      x.s.sent[0].components[0].toJSON().components.map((b) => b.custom_id),
      ['luna:role:1', 'luna:role:1:1'],
    );
    x.i.user.id = 'member';
    x.i.customId = 'luna:role:1:1';
    await createRoleButtonHandler(x.context)(x.i);
    assert.deepEqual(x.roles, [['add', r2.id]]);
  } finally {
    x.db.close();
  }
});
test('mapping validation rejects duplicates,oversize,partial labels and dangerous later role before publication', async () => {
  const { createMultiRolePanel } = await import('../src/services/rolePanels.js');
  for (const kind of ['duplicate', 'oversize', 'empty', 'control', 'dangerous', 'wrongIdentity']) {
    const x = setup();
    let buttons = [
      { roleId: x.role.id, label: 'one' },
      { roleId: '100000000000000004', label: 'two' },
    ];
    if (kind === 'duplicate') buttons[1].roleId = x.role.id;
    if (kind === 'oversize')
      buttons = Array.from({ length: 6 }, (_, n) => ({
        roleId: String(100000000000000001n + BigInt(n)),
        label: 'name',
      }));
    if (kind === 'empty') buttons[1].label = ' ';
    if (kind === 'control') buttons[1].label = 'a\nb';
    x.s.guild.roles.fetch = async (id) => ({
      ...x.role,
      id: kind === 'wrongIdentity' ? x.role.id : id,
      permissions: { has: (p) => kind === 'dangerous' && id !== x.role.id && p === P.ManageRoles },
    });
    try {
      await assert.rejects(() =>
        createMultiRolePanel(x.i, x.context, { channelId: x.i.channelId, buttons }),
      );
      assert.equal(x.s.sent.length, 0);
      assert.equal(x.context.rolePanels.list('g').length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('invalid/nonexistent button index and stale disabled panel never grant', async () => {
  for (const id of ['luna:role:1:4', 'luna:role:1:-1', 'luna:role:1:5', 'luna:role:1:0:1']) {
    const x = setup();
    try {
      await createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      });
      x.i.user.id = 'member';
      x.i.customId = id;
      await createRoleButtonHandler(x.context)(x.i);
      assert.equal(x.roles.length, 0);
    } finally {
      x.db.close();
    }
  }
  const x = setup();
  try {
    await createRolePanel(x.i, x.context, {
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'Member',
    });
    x.i.user.id = 'member';
    const fetch = x.s.guild.roles.fetch;
    x.s.guild.roles.fetch = async (id) => {
      x.context.rolePanels.status(1, 'disabled');
      return fetch(id);
    };
    await createRoleButtonHandler(x.context)(x.i);
    assert.equal(x.roles.length, 0);
  } finally {
    x.db.close();
  }
});
test('multi slash path is localized and fresh staff permission is required even for disable', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      r2 = { ...x.role, id: '100000000000000004' };
    x.context.localization = { locale: () => locale };
    x.s.guild.roles.fetch = async (id) => (id === r2.id ? r2 : x.role);
    let sub = 'multi';
    x.i.options = {
      getSubcommand: () => sub,
      getChannel: () => ({ id: x.i.channelId }),
      getRole: (n) => (n === 'role-1' ? x.role : n === 'role-2' ? r2 : null),
      getString: (n) => (n === 'label-1' ? 'Member' : n === 'label-2' ? 'Events' : null),
      getInteger: () => 1,
    };
    try {
      await command.execute(x.i, x.context);
      assert.equal(
        x.replies[0].embeds[0].data.description,
        translate(locale, 'rolePanelCreated', { id: 1, messageId: 'message' }),
      );
      sub = 'disable';
      x.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(x.i, x.context), /roleActorPermission/);
      assert.equal(x.context.rolePanels.get(1, 'g').status, 'active');
    } finally {
      x.db.close();
    }
  }
});
test('v16 migrates existing single-role button mappings without changing old custom IDs', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-panels-')),
    path = join(dir, 'db');
  try {
    let db = openDatabase(path);
    db.exec('DROP TABLE role_panel_buttons;DELETE FROM schema_migrations WHERE version=16');
    db.prepare(
      'INSERT INTO role_panels(guild_id,channel_id,role_id,label,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
    ).run('g', 'c', 'r', 'Member', 'old', 1);
    db.close();
    db = openDatabase(path);
    const panels = new RolePanels(db);
    assert.deepEqual(panels.buttons(1), [{ button_index: 0, role_id: 'r', label: 'Member' }]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('pending publication recovers uncertain and per-guild live panel cap is enforced atomically', () => {
  const x = setup();
  try {
    const base = { guildId: 'g', channelId: 'c', roleId: 'r', label: 'Role' };
    for (let n = 0; n < 100; n++)
      x.context.rolePanels.reserve({ ...base, interactionId: `source${n}` });
    x.context.rolePanels.recover();
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'uncertain');
    assert.throws(
      () => x.context.rolePanels.reserve({ ...base, interactionId: 'overflow' }),
      /rolePanelLimit/,
    );
    x.context.rolePanels.status(1, 'disabled');
    assert.equal(x.context.rolePanels.reserve({ ...base, interactionId: 'replacement' }), 101);
    assert.equal(
      x.context.rolePanels.reserve({ ...base, guildId: 'other', interactionId: 'other' }),
      102,
    );
  } finally {
    x.db.close();
  }
});
