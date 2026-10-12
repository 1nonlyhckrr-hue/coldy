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
    guild: { id: 'g' },
    permissions: { has: () => true },
    roles: { highest: { comparePositionTo: () => 5 } },
  };
  const bot = {
    id: 'b',
    guild: { id: 'g' },
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
    id: 'member',
    guild: { id: 'g' },
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
    client: { user: { id: 'b' } },
    appPermissions: { has: () => true },
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
    x.i.id = 'release-click';
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
    getString: (n) => (n === 'label' ? 'Member' : null),
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
  const dir = mkdtempSync(join(tmpdir(), 'emika-panels-')),
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
test('role button durable receipt blocks replay after cooldown and uncertainty without repeat effect', async () => {
  for (const kind of ['success', 'network', 'reserve', 'finalize']) {
    const x = setup();
    try {
      await createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      });
      x.i.user.id = 'member';
      let n = 0;
      x.member.roles.add = async () => {
        n++;
        if (kind === 'network') throw Error('network');
      };
      if (kind === 'reserve')
        x.context.rolePanels.reserveClick = () => {
          throw Error('db');
        };
      if (kind === 'finalize')
        x.context.rolePanels.finishClick = () => {
          throw Error('db');
        };
      const h = createRoleButtonHandler(x.context);
      await h(x.i);
      x.context.cooldowns.entries.clear();
      await h(x.i);
      assert.equal(n, kind === 'reserve' ? 0 : 1);
      if (kind === 'network' || kind === 'finalize') {
        x.context.cooldowns.entries.clear();
        x.i.id = 'new-click';
        await h(x.i);
        assert.equal(n, 1);
      }
      assert.equal(
        x.db.prepare('SELECT count(*) n FROM role_click_receipts').get().n,
        kind === 'reserve' ? 0 : 1,
      );
    } finally {
      x.db.close();
    }
  }
});
test('role click receipt state survives actual SQLite reopen and pending recovers uncertain', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-click-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    let r = new RolePanels(db);
    r.reserveClick('i', 'g', 'u', 'r');
    db.close();
    db = openDatabase(path);
    r = new RolePanels(db);
    r.recover();
    assert.equal(db.prepare('SELECT status FROM role_click_receipts').get().status, 'uncertain');
    assert.throws(() => r.reserveClick('new', 'g', 'u', 'r'), /roleClickBlocked/);
    assert.throws(() => r.reserveClick('i', 'other', 'u', 'r'), /roleClickBlocked/);
    r.reserveClick('other', 'other', 'u', 'r');
    r.finishClick('other', 'completed');
    assert.throws(() => r.reserveClick('other', 'other', 'u', 'r'), /roleClickBlocked/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('role click rejects wrong bot/current app permission and changed panel destination before receipt', async () => {
  for (const kind of ['bot', 'botGuild', 'permission', 'channel']) {
    const x = setup();
    try {
      await createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      });
      x.i.user.id = 'member';
      if (kind === 'bot') x.bot.id = 'other';
      if (kind === 'botGuild') x.bot.guild.id = 'other';
      if (kind === 'permission') x.i.appPermissions.has = () => false;
      if (kind === 'channel')
        x.s.guild.roles.fetch = async () => {
          x.db.prepare("UPDATE role_panels SET channel_id='other'").run();
          return x.role;
        };
      await createRoleButtonHandler(x.context)(x.i);
      assert.equal(x.roles.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM role_click_receipts').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('schema24 role panel and button mappings survive migration25 click receipt addition', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-panel-upgrade-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    const r = new RolePanels(db);
    const id = r.reserve({
      guildId: 'g',
      channelId: 'c',
      roleId: 'r',
      label: 'label',
      interactionId: 'source',
    });
    r.complete(id, 'message');
    db.exec(
      'DROP TABLE role_click_receipts;DELETE FROM schema_migrations WHERE version IN (25,26);',
    );
    db.close();
    db = openDatabase(path);
    const after = new RolePanels(db);
    assert.equal(after.get(id, 'g').status, 'active');
    assert.equal(after.get(id, 'g').message_id, 'message');
    assert.equal(after.buttons(id)[0].role_id, 'r');
    after.reserveClick('click', 'g', 'u', 'r');
    assert.equal(db.prepare('SELECT status FROM role_click_receipts').get().status, 'pending');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('panel inspect privately exposes complete stored multi mapping without native reads/effects', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    x.context.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    const panel = x.context.rolePanels.reserve({
      guildId: 'g',
      channelId: x.i.channelId,
      roleId: x.role.id,
      label: 'First',
      interactionId: 'source',
      buttons: [
        { roleId: x.role.id, label: 'First' },
        { roleId: '100000000000000004', label: 'Second @everyone' },
      ],
    });
    x.context.rolePanels.complete(panel, 'stored-message');
    x.i.options = { getSubcommand: () => 'inspect', getInteger: () => panel };
    x.s.guild.roles.fetch = async () => {
      throw Error('No native reads needed');
    };
    try {
      await command.execute(x.i, x.context);
      const p = x.replies[0];
      assert.deepEqual(p.allowedMentions.parse, []);
      assert(p.embeds[0].data.description.includes('stored-message'));
      assert(p.embeds[0].data.description.includes('100000000000000004'));
      assert.equal(x.s.sent.length, 0);
      assert.equal(x.roles.length, 0);
      assert.equal(x.context.rolePanels.get(panel, 'g').status, 'active');
      x.i.guildId = 'other';
      await assert.rejects(() => command.execute(x.i, x.context), /roleActorPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('panel inspect requires exact current manager and refuses missing record without output', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  for (const kind of ['missing', 'actor']) {
    const x = setup();
    x.i.options = { getSubcommand: () => 'inspect', getInteger: () => 999 };
    if (kind === 'actor') x.actor.id = 'other';
    try {
      await assert.rejects(() => command.execute(x.i, x.context));
      assert.equal(x.replies.length, 0);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('role panel completion requires exact pending reservation and message identity', () => {
  const x = setup();
  try {
    const id = x.context.rolePanels.reserve({
      guildId: 'g',
      channelId: x.s.channel.id,
      roleId: x.role.id,
      label: 'safe',
      interactionId: 'source',
    });
    for (const message of [null, undefined, '', 0])
      assert.throws(() => x.context.rolePanels.complete(id, message), /identity/);
    x.context.rolePanels.complete(id, 'message');
    assert.throws(() => x.context.rolePanels.complete(id, 'other'), /not pending/);
    assert.throws(() => x.context.rolePanels.complete(999, 'message'), /not pending/);
    assert.equal(x.context.rolePanels.get(id, 'g').message_id, 'message');
  } finally {
    x.db.close();
  }
});
test('accepted panel send without returned identity becomes uncertain and cannot replay source', async () => {
  const x = setup();
  try {
    x.s.channel.send = async (p) => {
      x.s.sent.push(p);
      return {};
    };
    const input = { channelId: x.s.channel.id, roleId: x.role.id, label: 'safe' };
    await assert.rejects(() => createRolePanel(x.i, x.context, input), /rolePanelStorageFailed/);
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'uncertain');
    await assert.rejects(() => createRolePanel(x.i, x.context, input));
    assert.equal(x.s.sent.length, 1);
  } finally {
    x.db.close();
  }
});

test('role panel publication verifies exact current actor/bot/guild/app authority before reservation', async () => {
  for (const kind of ['actor', 'actorGuild', 'guild', 'bot', 'botGuild', 'app']) {
    const x = setup();
    try {
      if (kind === 'actor') x.actor.id = 'other';
      if (kind === 'actorGuild') x.actor.guild.id = 'other';
      if (kind === 'guild') x.i.guildId = 'other';
      if (kind === 'bot') x.bot.id = 'other';
      if (kind === 'botGuild') x.bot.guild.id = 'other';
      if (kind === 'app') x.i.appPermissions.has = () => false;
      await assert.rejects(() =>
        createRolePanel(x.i, x.context, {
          channelId: x.s.channel.id,
          roleId: x.role.id,
          label: 'safe',
        }),
      );
      assert.equal(x.s.sent.length, 0);
      assert.equal(x.context.rolePanels.list('g').length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('role panel publication reads actor after role/destination awaits and rejects permission loss', async () => {
  const x = setup();
  try {
    const roles = x.s.guild.roles.fetch;
    x.s.guild.roles.fetch = async (...args) => {
      x.actor.permissions.has = () => false;
      return roles(...args);
    };
    await assert.rejects(
      () =>
        createRolePanel(x.i, x.context, {
          channelId: x.s.channel.id,
          roleId: x.role.id,
          label: 'safe',
        }),
      /roleActorPermission/,
    );
    assert.equal(x.s.sent.length, 0);
    assert.equal(x.context.rolePanels.list('g').length, 0);
  } finally {
    x.db.close();
  }
});

test('role receipt inspection isolates member/guild, excludes terminal states and bounds newest ten', () => {
  const x = setup();
  try {
    for (let n = 0; n < 12; n++) {
      x.context.rolePanels.reserveClick('i' + n, 'g', 'member', 'r' + n);
      x.db
        .prepare('UPDATE role_click_receipts SET created_at=? WHERE interaction_id=?')
        .run(n, 'i' + n);
    }
    x.context.rolePanels.reserveClick('foreign', 'other', 'member', 'r');
    x.context.rolePanels.reserveClick('other-member', 'g', 'other', 'r');
    x.context.rolePanels.reserveClick('complete', 'g', 'member', 'complete');
    x.context.rolePanels.finishClick('complete', 'completed');
    x.context.rolePanels.reserveClick('failed', 'g', 'member', 'failed');
    x.context.rolePanels.finishClick('failed', 'failed');
    x.context.rolePanels.recover();
    const rows = x.context.rolePanels.unresolvedClicks('g', 'member');
    assert.equal(rows.length, 10);
    assert.equal(rows[0].interaction_id, 'i11');
    assert.equal(rows[9].interaction_id, 'i2');
    assert(rows.every((r) => r.status === 'uncertain'));
    assert.deepEqual(x.context.rolePanels.unresolvedClicks('g', 'missing'), []);
  } finally {
    x.db.close();
  }
});
test('role receipts manager inspection stays private/localized and performs no native role/member subject lookups or effects', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.context.localization = { locale: () => locale };
      x.context.rolePanels.reserveClick('stored', 'g', 'member', 'stored-role');
      x.context.rolePanels.finishClick('stored', 'uncertain');
      x.i.options = { getSubcommand: () => 'receipts', getUser: () => ({ id: 'member' }) };
      x.s.guild.roles.fetch = async () => {
        throw Error('no role reads');
      };
      await command.execute(x.i, x.context);
      const reply = x.replies[0];
      assert(reply.embeds[0].data.description.includes(translate(locale, 'roleClickReceipts')));
      assert(reply.embeds[0].data.description.includes('stored-role'));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(x.roles.length, 0);
      assert.equal(x.s.sent.length, 0);
      assert.equal(x.context.rolePanels.unresolvedClicks('g', 'member')[0].status, 'uncertain');
      x.i.options.getUser = () => ({ id: 'missing' });
      await command.execute(x.i, x.context);
      assert.equal(
        x.replies[1].embeds[0].data.description,
        translate(locale, 'roleClickReceiptsEmpty'),
      );
    } finally {
      x.db.close();
    }
  }
});
test('role receipt inspection rejects nonmanager and foreign current actor before stored lookup', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  for (const kind of ['permission', 'actor', 'guild']) {
    const x = setup();
    try {
      x.i.options = { getSubcommand: () => 'receipts', getUser: () => ({ id: 'member' }) };
      if (kind === 'permission') x.actor.permissions.has = () => false;
      if (kind === 'actor') x.actor.id = 'other';
      if (kind === 'guild') x.actor.guild.id = 'other';
      x.context.rolePanels.unresolvedClicks = () => {
        throw Error('must not reach storage');
      };
      await assert.rejects(() => command.execute(x.i, x.context), /roleActorPermission/);
      assert.equal(x.replies.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('role click directed intent is immutable through recovery and invalid directions cannot reserve', () => {
  const x = setup();
  try {
    for (const action of ['add', 'remove', 'unknown']) {
      x.context.rolePanels.reserveClick(action, 'g', 'member', action, action);
    }
    assert.throws(
      () => x.context.rolePanels.reserveClick('bad', 'g', 'member', 'bad', 'toggle'),
      TypeError,
    );
    x.context.rolePanels.recover();
    const rows = x.context.rolePanels.unresolvedClicks('g', 'member');
    assert.deepEqual(rows.map((r) => r.action).sort(), ['add', 'remove', 'unknown']);
    assert(rows.every((r) => r.status === 'uncertain'));
    assert.equal(x.db.prepare('SELECT count(*) n FROM role_click_receipts').get().n, 3);
  } finally {
    x.db.close();
  }
});
test('native role toggles persist exact add/remove direction before effect without inferring old receipts', async () => {
  for (const has of [false, true]) {
    const x = setup();
    try {
      await createRolePanel(x.i, x.context, {
        channelId: x.i.channelId,
        roleId: x.role.id,
        label: 'Member',
      });
      x.i.user.id = 'member';
      if (has) x.member.roles.cache.set(x.role.id, x.role);
      const method = has ? 'remove' : 'add';
      x.member.roles[method] = async () => {
        const r = x.db.prepare('SELECT action,status FROM role_click_receipts').get();
        assert.equal(r.action, method);
        assert.equal(r.status, 'pending');
      };
      await createRoleButtonHandler(x.context)(x.i);
      assert.equal(
        x.db.prepare('SELECT action,status FROM role_click_receipts').get().action,
        method,
      );
      assert.equal(
        x.db.prepare('SELECT action,status FROM role_click_receipts').get().status,
        'completed',
      );
    } finally {
      x.db.close();
    }
  }
});
test('schema25 undirected click receipts migrate to unknown with terminal and unresolved state preserved', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-click-intent-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    db.exec(
      "DROP TABLE role_click_receipts;DELETE FROM schema_migrations WHERE version=26;CREATE TABLE role_click_receipts(interaction_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL);INSERT INTO role_click_receipts VALUES('old','g','u','r','uncertain',10);INSERT INTO role_click_receipts VALUES('done','g','u','other','completed',11);",
    );
    db.close();
    db = openDatabase(path);
    const rows = db.prepare('SELECT * FROM role_click_receipts ORDER BY interaction_id').all();
    assert.equal(rows.length, 2);
    assert(rows.every((r) => r.action === 'unknown'));
    assert.equal(rows[0].status, 'completed');
    assert.equal(rows[1].status, 'uncertain');
    assert.equal(rows[1].created_at, 10);
    const store = new RolePanels(db);
    assert.throws(() => store.reserveClick('retry', 'g', 'u', 'r', 'add'), /roleClickBlocked/);
    store.reserveClick('new', 'g', 'u', 'new', 'remove');
    db.close();
    db = openDatabase(path);
    assert.equal(
      db.prepare("SELECT action FROM role_click_receipts WHERE interaction_id='new'").get().action,
      'remove',
    );
    assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n, 45);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('directed uncertain role clicks reconcile observed exact member state with no native role effect', async () => {
  const { reconcileRoleClick } = await import('../src/services/rolePanels.js');
  for (const action of ['add', 'remove']) {
    const x = setup();
    try {
      x.context.rolePanels.reserveClick('click', 'g', 'member', x.role.id, action);
      x.context.rolePanels.finishClick('click', 'uncertain');
      if (action === 'add') x.member.roles.cache.set(x.role.id, x.role);
      await reconcileRoleClick(x.i, x.context, 'click');
      assert.equal(x.context.rolePanels.click('click', 'g').status, 'completed');
      assert.equal(x.roles.length, 0);
      assert.equal(x.s.sent.length, 0);
      await assert.rejects(
        () => reconcileRoleClick(x.i, x.context, 'click'),
        /roleClickReconcileBlocked/,
      );
    } finally {
      x.db.close();
    }
  }
});
test('role reconciliation blocks unknown pending foreign unsafe mismatched and concurrently changed receipts', async () => {
  const { reconcileRoleClick } = await import('../src/services/rolePanels.js');
  for (const kind of [
    'unknown',
    'pending',
    'foreign',
    'mismatch',
    'actor',
    'bot',
    'member',
    'dangerous',
    'race',
  ]) {
    const x = setup();
    try {
      x.context.rolePanels.reserveClick(
        'click',
        kind === 'foreign' ? 'foreign' : 'g',
        'member',
        x.role.id,
        kind === 'unknown' ? 'unknown' : 'add',
      );
      if (kind !== 'pending') x.context.rolePanels.finishClick('click', 'uncertain');
      x.member.roles.cache.set(x.role.id, x.role);
      if (kind === 'mismatch') x.member.roles.cache.clear();
      if (kind === 'actor') x.actor.permissions.has = () => false;
      if (kind === 'bot') x.bot.id = 'other';
      if (kind === 'member') x.member.id = 'other';
      if (kind === 'dangerous') x.role.permissions.has = () => true;
      if (kind === 'race')
        x.s.guild.roles.fetch = async () => {
          x.db.prepare("UPDATE role_click_receipts SET action='remove'").run();
          return x.role;
        };
      await assert.rejects(() => reconcileRoleClick(x.i, x.context, 'click'));
      assert.notEqual(
        x.db.prepare('SELECT status FROM role_click_receipts').get().status,
        'completed',
      );
      assert.equal(x.roles.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('manager click reconciliation requires confirmation and emits private localized observed-only result', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.context.localization = { locale: () => locale };
      x.context.rolePanels.reserveClick('click', 'g', 'member', x.role.id, 'remove');
      x.context.rolePanels.finishClick('click', 'uncertain');
      let confirm = false;
      x.i.options = {
        getSubcommand: () => 'reconcileclick',
        getBoolean: () => confirm,
        getString: () => 'click',
      };
      await assert.rejects(() => command.execute(x.i, x.context), /roleClickReconcileConfirm/);
      assert.equal(x.context.rolePanels.click('click', 'g').status, 'uncertain');
      confirm = true;
      await command.execute(x.i, x.context);
      assert.equal(
        x.replies[0].embeds[0].data.description,
        translate(locale, 'roleClickReconciled'),
      );
      assert.deepEqual(x.replies[0].allowedMentions.parse, []);
      assert.equal(x.roles.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('active panel bulk disable scopes guild and never rewrites pending uncertain terminal mappings', () => {
  const x = setup();
  try {
    const ids = [];
    for (const status of ['active', 'pending', 'uncertain', 'failed', 'disabled']) {
      const id = x.context.rolePanels.reserve({
        guildId: 'g',
        channelId: '100000000000000001',
        roleId: x.role.id,
        label: 'One',
        interactionId: status,
      });
      x.db.prepare('UPDATE role_panels SET status=? WHERE id=?').run(status, id);
      ids.push(id);
    }
    const foreign = x.context.rolePanels.reserve({
      guildId: 'other',
      channelId: '100000000000000001',
      roleId: x.role.id,
      label: 'Foreign',
      interactionId: 'foreign',
    });
    x.context.rolePanels.complete(foreign, 'foreign-message');
    assert.equal(x.context.rolePanels.disableActive('g'), 1);
    assert.equal(x.context.rolePanels.disableActive('g'), 0);
    for (const [n, status] of ['disabled', 'pending', 'uncertain', 'failed', 'disabled'].entries())
      assert.equal(x.context.rolePanels.get(ids[n], 'g').status, status);
    assert.equal(x.context.rolePanels.get(foreign, 'other').status, 'active');
    assert.equal(x.context.rolePanels.buttons(ids[0])[0].label, 'One');
    assert.throws(() => x.context.rolePanels.disableActive(''));
  } finally {
    x.db.close();
  }
});
test('panel listing paginates complete latest metadata with strict bounds and no mutation', () => {
  const x = setup();
  try {
    for (let n = 0; n < 25; n++)
      x.context.rolePanels.reserve({
        guildId: 'g',
        channelId: '100000000000000001',
        roleId: x.role.id,
        label: 'Label',
        interactionId: String(n),
      });
    assert.equal(x.context.rolePanels.list('g').length, 10);
    assert.equal(x.context.rolePanels.list('g', 2).length, 10);
    assert.equal(x.context.rolePanels.list('g', 3).length, 5);
    assert.equal(x.context.rolePanels.list('g', 10).length, 0);
    assert.equal(x.context.rolePanels.list('other').length, 0);
    assert.equal(x.context.rolePanels.list('g')[0].id, 25);
    for (const p of [0, 11, 1.5, '1'])
      assert.throws(() => x.context.rolePanels.list('g', p), /rolePanelPageInvalid/);
  } finally {
    x.db.close();
  }
});
test('bulk disable and complete list slash stay private localized/no-nativeeffects with current authority', async () => {
  const { default: cmd } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      const id = x.context.rolePanels.reserve({
        guildId: 'g',
        channelId: '100000000000000001',
        roleId: x.role.id,
        label: 'Label',
        interactionId: 'stored',
      });
      x.context.rolePanels.complete(id, 'native');
      let sub = 'list',
        reply;
      x.context.localization = { locale: () => locale };
      x.i.deferReply = async (p) => assert.equal(p.flags, 64);
      x.i.editReply = async (p) => {
        reply = p;
      };
      x.i.options = { getSubcommand: () => sub, getInteger: () => null, getBoolean: () => true };
      await cmd.execute(x.i, x.context);
      assert(reply.embeds[0].data.description.includes(translate(locale, 'rolePanelState_active')));
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'disableactive';
      await cmd.execute(x.i, x.context);
      assert.equal(x.context.rolePanels.get(id, 'g').status, 'disabled');
      assert.equal(x.roles.length, 0);
      assert.equal(x.s.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('bulk disable rejects unconfirmed and wrong current actor without stored change', async () => {
  const { default: cmd } = await import('../src/commands/reactionroles/reactionroles.js');
  const x = setup();
  try {
    const id = x.context.rolePanels.reserve({
      guildId: 'g',
      channelId: '100000000000000001',
      roleId: x.role.id,
      label: 'Label',
      interactionId: 'stored',
    });
    x.context.rolePanels.complete(id, 'native');
    x.i.deferReply = async () => {};
    x.i.editReply = async () => {};
    x.i.options = { getSubcommand: () => 'disableactive', getBoolean: () => false };
    await assert.rejects(() => cmd.execute(x.i, x.context), /rolePanelDisableActiveConfirm/);
    assert.equal(x.context.rolePanels.get(id, 'g').status, 'active');
    x.s.guild.members.fetch = async () => ({ ...x.actor, id: 'wrong' });
    await assert.rejects(() => cmd.execute(x.i, x.context), /roleActorPermission/);
    assert.equal(x.context.rolePanels.get(id, 'g').status, 'active');
  } finally {
    x.db.close();
  }
});

test('stored panel state filter happens before pages preserving guild scope complete rows newest order and no mutation', () => {
  const x = setup();
  try {
    for (let n = 0; n < 25; n++) {
      const id = x.context.rolePanels.reserve({
        guildId: 'g',
        channelId: 'c',
        roleId: x.role.id,
        label: 'label',
        interactionId: 's' + n,
      });
      x.db
        .prepare('UPDATE role_panels SET status=? WHERE id=?')
        .run(n % 2 ? 'disabled' : 'uncertain', id);
    }
    const before = x.db.prepare('SELECT * FROM role_panels ORDER BY id').all();
    assert.equal(x.context.rolePanels.list('g', 1, { state: 'uncertain' }).length, 10);
    assert.equal(x.context.rolePanels.list('g', 2, { state: 'uncertain' }).length, 3);
    assert.equal(x.context.rolePanels.list('g', 1, { state: 'uncertain' })[0].id, 25);
    assert.deepEqual(x.context.rolePanels.list('other', 1, { state: 'uncertain' }), []);
    for (const state of ['bad', false, 0])
      assert.throws(() => x.context.rolePanels.list('g', 1, { state }), /rolePanelStateInvalid/);
    assert.deepEqual(x.db.prepare('SELECT * FROM role_panels ORDER BY id').all(), before);
  } finally {
    x.db.close();
  }
});
test('filtered panel list slash manager private localized no role/message effect and no status promotion', async () => {
  const { default: command } = await import('../src/commands/reactionroles/reactionroles.js');
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.context.guildConfig = { get: () => ({ language: locale }) };
      x.context.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      const id = x.context.rolePanels.reserve({
        guildId: 'g',
        channelId: 'c',
        roleId: x.role.id,
        label: 'L',
        interactionId: 'one',
      });
      x.context.rolePanels.complete(id, 'message');
      x.i.options = {
        getSubcommand: () => 'list',
        getInteger: () => 1,
        getString: () => 'uncertain',
      };
      const replies = [];
      x.i.deferReply = async (p) => assert.equal(p.flags, 64);
      x.i.editReply = async (p) => replies.push(p);
      await command.execute(x.i, x.context);
      assert(!replies[0].embeds[0].data.description.includes('#1 |'));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(x.context.rolePanels.get(id, 'g').status, 'active');
      assert.equal(x.roles.length, 0);
      assert.equal(x.s.sent.length, 0);
      x.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(x.i, x.context));
    } finally {
      x.db.close();
    }
  }
});

test('role panel publication requires nonblank string receipt and preserves uncertainty without resend', async () => {
  for (const returned of [{ id: 1 }, { id: ' ' }, { id: '' }, {}]) {
    const x = setup();
    let attempts = 0;
    try {
      const channel = {
        id: x.i.channelId,
        guildId: 'g',
        type: 0,
        permissionsFor: () => ({ has: () => true }),
        send: async () => {
          attempts++;
          return returned;
        },
      };
      x.i.guild.channels.fetch = async () => channel;
      await assert.rejects(
        () =>
          createRolePanel(x.i, x.context, {
            channelId: x.i.channelId,
            roleId: x.role.id,
            label: 'Join',
          }),
        /rolePanelStorageFailed/,
      );
      assert.equal(x.context.rolePanels.get(1, 'g').status, 'uncertain');
      assert.equal(attempts, 1);
    } finally {
      x.db.close();
    }
  }
});
test('role panel late publication failure cannot demote already completed active receipt', async () => {
  const x = setup();
  try {
    const channel = {
      id: x.i.channelId,
      guildId: 'g',
      type: 0,
      permissionsFor: () => ({ has: () => true }),
      send: async () => {
        x.context.rolePanels.complete(1, 'observed');
        throw Error('late');
      },
    };
    x.i.guild.channels.fetch = async () => channel;
    await assert.rejects(
      () =>
        createRolePanel(x.i, x.context, {
          channelId: x.i.channelId,
          roleId: x.role.id,
          label: 'Join',
        }),
      /rolePanelUncertain/,
    );
    assert.equal(x.context.rolePanels.get(1, 'g').status, 'active');
    assert.equal(x.context.rolePanels.get(1, 'g').message_id, 'observed');
    assert.equal(x.context.rolePanels.publicationUncertain(1), 0);
  } finally {
    x.db.close();
  }
});
