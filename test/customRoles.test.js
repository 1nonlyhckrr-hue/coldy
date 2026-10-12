import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { CustomRoles, customRoleEffect } from '../src/services/customRoles.js';
import command from '../src/commands/customrole/customrole.js';
import { translate } from '../src/services/localization.js';
const ids = {
  user: '100000000000000001',
  bot: '100000000000000002',
  role: '100000000000000003',
  gate: '100000000000000004',
  owner: '100000000000000005',
};
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    customRoles = new CustomRoles(db);
  const role = {
      id: ids.role,
      guild: { id: 'g' },
      managed: false,
      permissions: { has: () => false },
    },
    gate = { id: ids.gate, guild: { id: 'g' }, managed: false };
  const member = {
      id: ids.user,
      guild: { id: 'g' },
      permissions: { has: () => true },
      roles: {
        highest: { comparePositionTo: () => 5 },
        cache: new Set(),
        add: async (r) => calls.push(['add', r.id]),
        remove: async (r) => calls.push(['remove', r.id]),
      },
    },
    bot = {
      id: ids.bot,
      guild: { id: 'g' },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 5 } },
    };
  const i = {
      id: 'i1',
      client: { user: { id: ids.bot } },
      user: { id: ids.user },
      guildId: 'g',
      appPermissions: { has: () => true },
      guild: {
        id: 'g',
        ownerId: ids.owner,
        members: { fetch: async () => member, fetchMe: async () => bot },
        roles: { fetch: async (id) => (id === ids.gate ? gate : role) },
      },
    },
    c = {
      customRoles,
      cases: new ModerationCases(db),
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
  customRoles.map('g', 'member', ids.role);
  return { db, c, i, role, gate, member, bot, calls };
}
test('custom mappings/gate persist and isolate guilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-custom-')),
    path = join(dir, 'db');
  try {
    let db = openDatabase(path),
      r = new CustomRoles(db);
    r.map('g', 'member', ids.role);
    r.setRequired('g', ids.gate);
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    assert.equal(r.get('g', 'member').role_id, ids.role);
    assert.equal(r.required('g'), ids.gate);
    assert.equal(r.list('other').length, 0);
    assert.equal(r.unmap('other', 'member'), 0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('mapping validation limits, unique roles and gate overlap fail closed', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CustomRoles(db);
    for (const name of [
      'UPPER',
      '1bad',
      'a b',
      'a'.repeat(25),
      "a'); DROP TABLE custom_role_mappings; --",
    ])
      assert.throws(() => r.map('g', name, ids.role));
    r.map('g', 'one', ids.role);
    assert.throws(() => r.map('g', 'two', ids.role));
    assert.throws(() => r.setRequired('g', ids.role));
    r.setRequired('g', ids.gate);
    assert.throws(() => r.map('g', 'gate', ids.gate));
    for (let n = 1; n < 20; n++) r.map('g', `m${n}`, String(100000000000000100n + BigInt(n)));
    r.map('g', 'one', ids.role);
    assert.throws(() => r.map('g', 'more', '100000000000000999'));
    assert.equal(r.list('g').length, 20);
  } finally {
    db.close();
  }
});
test('claim/release are explicit idempotent states and record real effects', async () => {
  const s = setup();
  try {
    let r = await customRoleEffect(s.i, s.c, { name: 'member', claim: true });
    assert(r.changed);
    assert.deepEqual(s.calls, [['add', ids.role]]);
    s.member.roles.cache.add(ids.role);
    r = await customRoleEffect(s.i, s.c, { name: 'member', claim: true });
    assert.equal(r.changed, false);
    s.i.id = 'i2';
    await customRoleEffect(s.i, s.c, { name: 'member', claim: false });
    assert.equal(s.calls[1][0], 'remove');
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 2);
  } finally {
    s.db.close();
  }
});
test('claim gate requires current role and release remains possible after gate loss', async () => {
  const s = setup();
  try {
    s.c.customRoles.setRequired('g', ids.gate);
    await assert.rejects(
      () => customRoleEffect(s.i, s.c, { name: 'member', claim: true }),
      /customRequiredMissing/,
    );
    s.member.roles.cache.add(ids.gate);
    await customRoleEffect(s.i, s.c, { name: 'member', claim: true });
    s.member.roles.cache.delete(ids.gate);
    s.member.roles.cache.add(ids.role);
    s.i.id = 'release';
    await customRoleEffect(s.i, s.c, { name: 'member', claim: false });
    assert.equal(s.calls.length, 2);
  } finally {
    s.db.close();
  }
});
test('edited unsafe roles, bot hierarchy and missing permissions cannot grant', async () => {
  for (const change of [
    (s) => (s.role.permissions.has = (p) => p === P.Administrator),
    (s) => (s.role.managed = true),
    (s) => (s.role.guild.id = 'other'),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.i.appPermissions.has = () => false),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim: true }));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('duplicate, busy and database failure never repeat or begin external change', async () => {
  const s = setup();
  try {
    await customRoleEffect(s.i, s.c, { name: 'member', claim: true });
    await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim: true }));
    assert.equal(s.calls.length, 1);
    s.c.customRoles.active.add(`g:${ids.user}`);
    await assert.rejects(
      () => customRoleEffect(s.i, s.c, { name: 'member', claim: true }),
      /roleActionBusy/,
    );
    s.c.customRoles.active.clear();
    s.i.id = 'new';
    s.c.cases.begin = () => {
      throw new Error('db');
    };
    await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim: true }));
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('role API rejection/uncertainty and finalization failure are no-retry', async () => {
  for (const kind of ['network', 'rejected', 'storage']) {
    const s = setup();
    let n = 0;
    if (kind === 'storage')
      s.c.cases.finish = () => {
        throw new Error('db');
      };
    s.member.roles.add = async () => {
      n++;
      if (kind !== 'storage')
        throw Object.assign(
          new Error('SECRET'),
          kind === 'rejected' ? { code: 50013, status: 403 } : {},
        );
    };
    try {
      await assert.rejects(
        () => customRoleEffect(s.i, s.c, { name: 'member', claim: true }),
        (e) => !e.message.includes('SECRET'),
      );
      await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim: true }));
      assert.equal(n, 1);
      assert.equal(s.c.customRoles.active.size, 0);
    } finally {
      s.db.close();
    }
  }
});
test('config race during member fetch refuses old mapping', async () => {
  const s = setup();
  s.i.guild.members.fetch = async () => {
    s.c.customRoles.unmap('g', 'member');
    return s.member;
  };
  try {
    await assert.rejects(
      () => customRoleEffect(s.i, s.c, { name: 'member', claim: true }),
      /customConfigChanged/,
    );
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('CustomRole slash six paths execute in each locale with private branded replies', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    let sub = 'map';
    s.i.options = {
      getSubcommand: () => sub,
      getString: () => 'member',
      getRole: () => (sub === 'required' ? null : s.role),
    };
    try {
      for (const action of ['map', 'required', 'list', 'claim', 'release', 'unmap']) {
        sub = action;
        s.i.id = action;
        if (action === 'release') s.member.roles.cache.add(ids.role);
        await command.execute(s.i, s.c);
      }
      assert.equal(replies.length, 6);
      for (const r of replies) {
        assert.equal(r.embeds.length, 1);
        assert.deepEqual(r.allowedMentions.parse, []);
      }
    } finally {
      s.db.close();
    }
  }
});
test('custom administration uses fresh Manage Roles and hierarchy checks', async () => {
  const s = setup();
  s.i.deferReply = async () => {};
  s.i.editReply = async () => {};
  s.i.options = { getSubcommand: () => 'map', getString: () => 'new', getRole: () => s.role };
  try {
    s.member.permissions.has = () => false;
    await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    s.member.permissions.has = () => true;
    s.member.roles.highest.comparePositionTo = () => 0;
    await assert.rejects(() => command.execute(s.i, s.c), /roleActorHierarchy/);
    assert.equal(s.c.customRoles.list('g').length, 1);
  } finally {
    s.db.close();
  }
});
test('custom role grant fetches authoritative mapping/gate IDs and refuses mismatched native identity', async () => {
  const s = setup();
  try {
    s.c.customRoles.setRequired('g', ids.gate);
    s.member.roles.cache.add(ids.gate);
    const seen = [],
      fetch = s.i.guild.roles.fetch;
    s.i.guild.roles.fetch = async (id, options) => {
      assert.equal(options.force, true);
      seen.push(id);
      return fetch(id);
    };
    await customRoleEffect(s.i, s.c, { name: 'member', claim: true });
    assert.deepEqual(seen, [ids.gate, ids.role]);
    s.i.id = 'bad';
    s.i.guild.roles.fetch = async (id) => (id === ids.gate ? s.gate : { ...s.role, id: 'other' });
    await assert.rejects(
      () => customRoleEffect(s.i, s.c, { name: 'member', claim: true }),
      /roleInvalid/,
    );
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});

test('custom administration forces selected native role identity for mapping and gate', async () => {
  for (const sub of ['map', 'required']) {
    const s = setup();
    s.i.deferReply = async () => {};
    s.i.editReply = async () => {};
    s.i.options = { getSubcommand: () => sub, getString: () => 'new', getRole: () => s.role };
    const seen = [];
    s.i.guild.roles.fetch = async (id, options) => {
      seen.push([id, options?.force]);
      return { ...s.role, id: ids.gate };
    };
    try {
      await assert.rejects(() => command.execute(s.i, s.c));
      assert.deepEqual(seen, [[ids.role, true]]);
      assert.equal(s.c.customRoles.required('g'), null);
      assert.equal(s.c.customRoles.get('g', 'new'), undefined);
    } finally {
      s.db.close();
    }
  }
});

test('confirmed mapping clear is guild-isolated,idempotent and preserves eligibility/native assignments', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    s.c.customRoles.setRequired('g', ids.gate);
    s.c.customRoles.map('other', 'kept', ids.role);
    s.i.deferReply = async () => {};
    s.i.editReply = async (p) => replies.push(p);
    let confirm = false;
    s.i.options = { getSubcommand: () => 'clear', getBoolean: () => confirm };
    try {
      await assert.rejects(() => command.execute(s.i, s.c), /customClearConfirm/);
      assert.equal(s.c.customRoles.list('g').length, 1);
      confirm = true;
      await command.execute(s.i, s.c);
      await command.execute(s.i, s.c);
      assert.equal(s.c.customRoles.list('g').length, 0);
      assert.equal(s.c.customRoles.list('other').length, 1);
      assert.equal(s.c.customRoles.required('g'), ids.gate);
      assert.equal(s.calls.length, 0);
      assert.equal(replies.length, 2);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});
test('clear mappings blocks revoked current ManageRoles and storage failure', async () => {
  const s = setup();
  s.i.deferReply = async () => {};
  s.i.editReply = async () => {};
  s.i.options = { getSubcommand: () => 'clear', getBoolean: () => true };
  try {
    s.member.permissions.has = () => false;
    await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    assert.equal(s.c.customRoles.list('g').length, 1);
    s.member.permissions.has = () => true;
    s.c.customRoles.clearMappings = () => {
      throw new Error('db');
    };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('unassigned self-role creation is opt-in,zero-permission,exact-shape and duplicate blocked', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  const s = setup();
  let created = 0,
    assigned = 0;
  const role = {
    ...s.role,
    name: 'My color',
    permissions: { bitfield: 0n },
    hoist: false,
    mentionable: false,
    colors: { primaryColor: 0x123456 },
  };
  s.member.user = { bot: false };
  s.member.roles.add = async () => assigned++;
  s.i.guild.roles.create = async (opts) => {
    created++;
    assert.equal(opts.permissions, 0n);
    assert.equal(opts.hoist, false);
    assert.equal(opts.mentionable, false);
    assert.deepEqual(opts.colors, { primaryColor: 0x123456 });
    return role;
  };
  s.i.guild.roles.fetch = async (id, opts) => {
    assert.equal(opts.force, true);
    return role;
  };
  try {
    await assert.rejects(
      () => createOwnRole(s.i, s.c, { name: 'My color', color: 0x123456 }),
      /customCreationDisabled/,
    );
    s.c.customRoles.setCreation('g', true);
    const r = await createOwnRole(s.i, s.c, { name: 'My color', color: 0x123456 });
    assert.equal(r.roleId, ids.role);
    assert.equal(s.c.customRoles.created('g', ids.user).status, 'created');
    assert.equal(assigned, 0);
    await assert.rejects(
      () => createOwnRole(s.i, s.c, { name: 'My color', color: 0x123456 }),
      /customCreationExists/,
    );
    assert.equal(created, 1);
  } finally {
    s.db.close();
  }
});
test('self-role creation uncertain/unsafe returned role never assigns or retries', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['network', 'unsafe', 'wrong', 'storage']) {
    const s = setup();
    let count = 0;
    s.member.user = { bot: false };
    s.c.customRoles.setCreation('g', true);
    const role = {
      ...s.role,
      name: 'Self',
      permissions: { bitfield: 0n },
      hoist: false,
      mentionable: false,
      colors: { primaryColor: 0 },
    };
    s.i.guild.roles.create = async () => {
      count++;
      if (kind === 'network') throw new Error('secret');
      return role;
    };
    s.i.guild.roles.fetch = async () =>
      kind === 'unsafe'
        ? { ...role, permissions: { bitfield: P.Administrator } }
        : kind === 'wrong'
          ? { ...role, id: ids.gate }
          : role;
    if (kind === 'storage')
      s.c.customRoles.recordCreated = () => {
        throw new Error('db');
      };
    try {
      await assert.rejects(
        () => createOwnRole(s.i, s.c, { name: 'Self' }),
        /customCreationUncertain/,
      );
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
      await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }));
      assert.equal(count, 1);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('self-role input,eligibility,permission,config race and storage reservation fail before native create', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['input', 'gate', 'permission', 'changed', 'db']) {
    const s = setup();
    let n = 0;
    s.member.user = { bot: false };
    s.c.customRoles.setCreation('g', true);
    s.i.guild.roles.create = async () => n++;
    if (kind === 'gate') s.c.customRoles.setRequired('g', ids.gate);
    if (kind === 'permission') s.i.appPermissions.has = () => false;
    if (kind === 'changed')
      s.i.guild.members.fetchMe = async () => {
        s.c.customRoles.setCreation('g', false);
        return s.bot;
      };
    if (kind === 'db')
      s.c.customRoles.reserveCreation = () => {
        throw new Error('db');
      };
    try {
      await assert.rejects(() =>
        createOwnRole(s.i, s.c, { name: kind === 'input' ? '@everyone' : 'Self' }),
      );
      assert.equal(n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('self-role reservation recovery blocks unknown creation and guild quota is50', () => {
  const s = setup();
  try {
    s.c.customRoles.setCreation('g', true);
    for (let n = 0; n < 50; n++)
      s.c.customRoles.reserveCreation(
        'g',
        String(100000000000001000n + BigInt(n)),
        'Self',
        0,
        'i' + n,
      );
    assert.throws(
      () => s.c.customRoles.reserveCreation('g', ids.user, 'Self', 0, 'extra'),
      /customCreationLimit/,
    );
    s.c.customRoles.recoverCreation();
    assert.equal(
      s.db.prepare("SELECT count(*) n FROM custom_created_roles WHERE status='uncertain'").get().n,
      50,
    );
    assert.equal(s.c.customRoles.creationEnabled('other'), false);
  } finally {
    s.db.close();
  }
});
test('creation policy and createown slash execute privately across locales with confirmation', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.member.user = { bot: false };
    s.c.localization = { locale: () => language, t: (_g, k, p) => translate(language, k, p) };
    s.i.deferReply = async () => {};
    s.i.editReply = async (p) => replies.push(p);
    let sub = 'creation',
      confirm = false;
    s.i.options = {
      getSubcommand: () => sub,
      getBoolean: (n) => (n === 'confirm' ? confirm : true),
      getString: (n) => (n === 'hex' ? null : 'Self'),
    };
    const role = {
      ...s.role,
      name: 'Self',
      permissions: { bitfield: 0n },
      hoist: false,
      mentionable: false,
      colors: { primaryColor: 0 },
    };
    s.i.guild.roles.create = async () => role;
    s.i.guild.roles.fetch = async () => role;
    try {
      await assert.rejects(() => command.execute(s.i, s.c), /customCreationConfirm/);
      assert.equal(s.c.customRoles.creationEnabled('g'), false);
      confirm = true;
      await command.execute(s.i, s.c);
      sub = 'createown';
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 2);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('created-role records and opt-in survive restart;in-flight creation recovers uncertain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-create-role-')),
    path = join(dir, 'db');
  let db;
  try {
    db = openDatabase(path);
    let r = new CustomRoles(db);
    r.setCreation('g', true);
    r.reserveCreation('g', ids.user, 'Self', 0, 'once');
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    r.recoverCreation();
    assert(r.creationEnabled('g'));
    assert.equal(r.created('g', ids.user).status, 'uncertain');
    assert.throws(
      () => r.reserveCreation('g', ids.user, 'Self', 0, 'next'),
      /customCreationExists/,
    );
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('self-role creation rejects mismatched guild/member/bot identity before native effect', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['guild', 'memberGuild', 'botGuild', 'botId']) {
    const s = setup();
    let count = 0;
    s.member.user = { bot: false };
    s.c.customRoles.setCreation('g', true);
    s.i.guild.roles.create = async () => count++;
    if (kind === 'guild') s.i.guild.id = 'other';
    if (kind === 'memberGuild') s.member.guild.id = 'other';
    if (kind === 'botGuild') s.bot.guild.id = 'other';
    if (kind === 'botId') s.bot.id = ids.gate;
    try {
      await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }));
      assert.equal(count, 0);
      assert.equal(s.c.customRoles.created('g', ids.user), undefined);
    } finally {
      s.db.close();
    }
  }
});
test('self-role creation verifies fresh bot after native creation and refuses zero-row completion', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['identity', 'guild', 'permission', 'hierarchy', 'record']) {
    const s = setup();
    let count = 0,
      reads = 0;
    s.member.user = { bot: false };
    s.c.customRoles.setCreation('g', true);
    const role = {
      ...s.role,
      name: 'Self',
      permissions: { bitfield: 0n },
      hoist: false,
      mentionable: false,
      colors: { primaryColor: 0 },
    };
    const changed = { ...s.bot, guild: { id: 'g' } };
    if (kind === 'identity') changed.id = ids.gate;
    if (kind === 'guild') changed.guild.id = 'other';
    if (kind === 'permission') changed.permissions = { has: () => false };
    if (kind === 'hierarchy') changed.roles = { highest: { comparePositionTo: () => 0 } };
    s.i.guild.members.fetchMe = async (opts) => {
      assert.equal(opts.force, true);
      return ++reads === 1 ? s.bot : changed;
    };
    s.i.guild.roles.create = async () => {
      count++;
      return role;
    };
    s.i.guild.roles.fetch = async () => {
      if (kind === 'record') s.c.customRoles.creationUncertain('g', ids.user);
      return role;
    };
    try {
      await assert.rejects(
        () => createOwnRole(s.i, s.c, { name: 'Self' }),
        /customCreationUncertain/,
      );
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
      await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }));
      assert.equal(count, 1);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('creation records are guild isolated,paged and exclude user-authored labels', () => {
  const s = setup();
  try {
    s.c.customRoles.setCreation('g', true);
    s.c.customRoles.setCreation('other', true);
    for (let n = 0; n < 21; n++)
      s.c.customRoles.reserveCreation(
        'g',
        String(100000000000001000n + BigInt(n)),
        'PRIVATE LABEL',
        0,
        'record' + n,
      );
    s.c.customRoles.reserveCreation('other', ids.user, 'OTHER PRIVATE', 0, 'otherrecord');
    assert.equal(s.c.customRoles.creations('g').count, 21);
    assert.equal(s.c.customRoles.creations('g', 1).rows.length, 10);
    assert.equal(s.c.customRoles.creations('g', 2).rows.length, 10);
    assert.equal(s.c.customRoles.creations('g', 3).rows.length, 1);
    assert.equal(s.c.customRoles.creations('g', 5).rows.length, 0);
    assert.equal(s.c.customRoles.creations('empty').count, 0);
    assert(!JSON.stringify(s.c.customRoles.creations('g')).includes('PRIVATE'));
    for (const page of [0, 6, 1.1, '1']) assert.throws(() => s.c.customRoles.creations('g', page));
  } finally {
    s.db.close();
  }
});
test('creation inspection is private,localized,read-only and admin listing requires fresh permission', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    let native = 0,
      sub = 'created';
    s.c.localization = { locale: () => language, t: (_g, k, p) => translate(language, k, p) };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    s.i.options = { getSubcommand: () => sub, getInteger: () => 1 };
    s.i.guild.roles.fetch = async () => {
      native++;
      throw Error('No native read needed');
    };
    try {
      await command.execute(s.i, s.c);
      s.c.customRoles.setCreation('g', true);
      s.c.customRoles.reserveCreation('g', ids.user, 'PRIVATE @LABEL', 0, 'inspect');
      await command.execute(s.i, s.c);
      s.c.customRoles.creationUncertain('g', ids.user);
      sub = 'creations';
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 3);
      assert.equal(native, 0);
      assert.equal(s.calls.length, 0);
      for (const p of replies) {
        assert.deepEqual(p.allowedMentions.parse, []);
        assert(!p.embeds[0].data.description.includes('PRIVATE'));
      }
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
      s.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
      s.member.permissions.has = () => true;
      s.member.id = ids.gate;
      await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    } finally {
      s.db.close();
    }
  }
});

test('unknown creation preserves observed role ID for operator review without claiming verification', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['fetch', 'unsafe', 'finalize']) {
    const s = setup();
    s.member.user = { bot: false };
    s.c.customRoles.setCreation('g', true);
    const role = {
      ...s.role,
      name: 'Self',
      permissions: { bitfield: 0n },
      hoist: false,
      mentionable: false,
      colors: { primaryColor: 0 },
    };
    s.i.guild.roles.create = async () => role;
    s.i.guild.roles.fetch = async () => {
      if (kind === 'fetch') throw Error('network');
      return kind === 'unsafe' ? { ...role, permissions: { bitfield: P.Administrator } } : role;
    };
    if (kind === 'finalize')
      s.c.customRoles.recordCreated = () => {
        throw Error('storage');
      };
    try {
      await assert.rejects(
        () => createOwnRole(s.i, s.c, { name: 'Self' }),
        /customCreationUncertain/,
      );
      const row = s.c.customRoles.created('g', ids.user);
      assert.equal(row.role_id, ids.role);
      assert.equal(row.status, 'uncertain');
      assert.equal(s.calls.length, 0);
      s.c.customRoles.recoverCreation();
      assert.equal(s.c.customRoles.created('g', ids.user).role_id, ids.role);
    } finally {
      s.db.close();
    }
  }
});
test('observed creation recording requires one pending row and failure blocks native follow-ups', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  const s = setup();
  let fetches = 0;
  s.member.user = { bot: false };
  s.c.customRoles.setCreation('g', true);
  s.i.guild.roles.create = async () => {
    s.c.customRoles.creationUncertain('g', ids.user);
    return { id: ids.role };
  };
  s.i.guild.roles.fetch = async () => fetches++;
  try {
    assert.throws(() => s.c.customRoles.recordObserved('g', ids.user, ids.role));
    await assert.rejects(
      () => createOwnRole(s.i, s.c, { name: 'Self' }),
      /customCreationUncertain/,
    );
    assert.equal(fetches, 0);
    assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
    assert.equal(s.c.customRoles.created('g', ids.user).role_id, null);
  } finally {
    s.db.close();
  }
});
function ownSetup() {
  const s = setup();
  s.member.user = { bot: false };
  s.c.customRoles.setCreation('g', true);
  s.c.customRoles.reserveCreation('g', ids.user, 'Self', 0, 'creation');
  s.c.customRoles.recordObserved('g', ids.user, ids.role);
  s.c.customRoles.recordCreated('g', ids.user, ids.role);
  Object.assign(s.role, { permissions: { bitfield: 0n }, hoist: false, mentionable: false });
  return s;
}
test('created role self claim/release is explicit,no deletion and release survives gate/policy loss', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  const s = ownSetup();
  try {
    const r = await ownRoleEffect(s.i, s.c, { claim: true });
    assert(r.changed);
    assert.deepEqual(s.calls, [['add', ids.role]]);
    s.member.roles.cache.add(ids.role);
    assert.equal((await ownRoleEffect(s.i, s.c, { claim: true })).changed, false);
    s.c.customRoles.setCreation('g', false);
    s.c.customRoles.setRequired('g', ids.gate);
    s.i.id = 'release';
    assert((await ownRoleEffect(s.i, s.c, { claim: false })).changed);
    assert.deepEqual(s.calls[1], ['remove', ids.role]);
    assert.equal(s.c.customRoles.created('g', ids.user).status, 'created');
  } finally {
    s.db.close();
  }
});
test('created role claims reject missing/uncertain/unsafe/identity/gate/config race before effect', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  for (const kind of ['uncertain', 'unsafe', 'bot', 'member', 'gate', 'policy', 'changed']) {
    const s = ownSetup();
    if (kind === 'uncertain')
      s.db
        .prepare(
          "UPDATE custom_created_roles SET status='uncertain' WHERE guild_id='g' AND owner_id=?",
        )
        .run(ids.user);
    if (kind === 'unsafe') s.role.permissions.bitfield = P.Administrator;
    if (kind === 'bot') s.bot.id = ids.gate;
    if (kind === 'member') s.member.guild.id = 'other';
    if (kind === 'gate') s.c.customRoles.setRequired('g', ids.gate);
    if (kind === 'policy') s.c.customRoles.setCreation('g', false);
    if (kind === 'changed')
      s.i.guild.roles.fetch = async () => {
        s.db
          .prepare(
            "UPDATE custom_created_roles SET status='uncertain' WHERE guild_id='g' AND owner_id=?",
          )
          .run(ids.user);
        return s.role;
      };
    try {
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('created role uncertain assignment/finalization blocks follow-up and replay without automatic retry', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  for (const kind of ['network', 'storage']) {
    const s = ownSetup();
    let attempts = 0;
    s.member.roles.add = async () => {
      attempts++;
      if (kind === 'network') throw Error('network');
    };
    if (kind === 'storage')
      s.c.cases.finish = () => {
        throw Error('db');
      };
    try {
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }), /customOwnUncertain/);
      s.i.id = 'new';
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }), /customOwnUncertain/);
      assert.equal(attempts, 1);
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'created');
    } finally {
      s.db.close();
    }
  }
});
test('created role slash self actions use private locale payloads and replay-safe cases', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = ownSetup(),
      replies = [];
    s.c.localization = { locale: () => language, t: (_g, k, p) => translate(language, k, p) };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    s.i.options = { getSubcommand: () => 'claimown' };
    try {
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      await assert.rejects(() => command.execute(s.i, s.c), /modDuplicate/);
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('created-role uncertain self action blocks after real SQLite reopen,other guild remains separate', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  const dir = mkdtempSync(join(tmpdir(), 'emika-own-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    let r = new CustomRoles(db),
      cases = new ModerationCases(db);
    r.setCreation('g', true);
    r.reserveCreation('g', ids.user, 'Self', 0, 'create');
    r.recordObserved('g', ids.user, ids.role);
    r.recordCreated('g', ids.user, ids.role);
    const id = cases.begin({
      guildId: 'g',
      targetId: ids.user,
      actorId: ids.user,
      action: 'customrole_own_claim',
      reason: 'test',
      interactionId: 'own-pending',
    });
    cases.finish(id, 'uncertain');
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    cases = new ModerationCases(db);
    const s = setup();
    s.db.close();
    s.c.customRoles = r;
    s.c.cases = cases;
    await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }), /customOwnUncertain/);
    assert.equal(s.calls.length, 0);
    assert.equal(r.created('g', ids.user).status, 'created');
    assert.equal(r.created('other', ids.user), undefined);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('created-role case reservation failure blocks effects;definitive native rejection does not become retry loop', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  for (const kind of ['reserve', 'rejected']) {
    const s = ownSetup();
    let n = 0;
    if (kind === 'reserve')
      s.c.cases.begin = () => {
        throw Error('db');
      };
    s.member.roles.add = async () => {
      n++;
      const error = new Error('forbidden');
      error.code = 50013;
      error.status = 403;
      throw error;
    };
    try {
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }));
      assert.equal(n, kind === 'reserve' ? 0 : 1);
      if (kind === 'rejected') {
        assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'failed');
        await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }), /modDuplicate/);
        assert.equal(n, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
function reconcileSetup() {
  const s = ownSetup();
  s.db
    .prepare("UPDATE custom_created_roles SET status='uncertain' WHERE guild_id='g' AND owner_id=?")
    .run(ids.user);
  s.role.name = 'Self';
  s.role.colors = { primaryColor: 0 };
  return s;
}
test('creation reconciliation verifies observed exact role and repairs only stored status', async () => {
  const { reconcileCreation } = await import('../src/services/customRoles.js');
  const s = reconcileSetup();
  const id = s.c.cases.begin({
    guildId: 'g',
    targetId: ids.user,
    actorId: ids.user,
    action: 'customrole_own_claim',
    reason: 'test',
    interactionId: 'unresolved',
  });
  s.c.cases.finish(id, 'uncertain');
  try {
    const result = await reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true });
    assert.equal(result.roleId, ids.role);
    assert.equal(s.c.customRoles.created('g', ids.user).status, 'created');
    assert.equal(
      s.db.prepare('SELECT status FROM moderation_cases WHERE id=?').get(id).status,
      'uncertain',
    );
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('creation reconciliation rejects confirmation,unknown IDs,permissions,shape,hierarchy and races', async () => {
  const { reconcileCreation } = await import('../src/services/customRoles.js');
  for (const kind of [
    'confirm',
    'missing',
    'permission',
    'actorId',
    'botId',
    'wrongRole',
    'unsafe',
    'name',
    'color',
    'hierarchy',
    'race',
  ]) {
    const s = reconcileSetup();
    if (kind === 'missing') s.db.prepare('UPDATE custom_created_roles SET role_id=NULL').run();
    if (kind === 'permission') s.member.permissions.has = () => false;
    if (kind === 'actorId') s.member.id = ids.gate;
    if (kind === 'botId') s.bot.id = ids.gate;
    if (kind === 'wrongRole') s.role.id = ids.gate;
    if (kind === 'unsafe') s.role.permissions.bitfield = P.Administrator;
    if (kind === 'name') s.role.name = 'Renamed';
    if (kind === 'color') s.role.colors.primaryColor = 1;
    if (kind === 'hierarchy') s.member.roles.highest.comparePositionTo = () => 0;
    if (kind === 'race')
      s.i.guild.roles.fetch = async () => {
        s.db.prepare('UPDATE custom_created_roles SET color=1').run();
        return s.role;
      };
    try {
      await assert.rejects(() =>
        reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: kind !== 'confirm' }),
      );
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('creation reconcile slash is private in all locales and does not change native roles', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = reconcileSetup(),
      replies = [];
    s.c.localization = { locale: () => language, t: (_g, k, p) => translate(language, k, p) };
    s.i.options = {
      getSubcommand: () => 'reconcile',
      getUser: () => ({ id: ids.user }),
      getBoolean: () => true,
    };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    try {
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'created');
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('creation reconciliation status survives SQLite reopen without replay or role assignment', async () => {
  const { reconcileCreation } = await import('../src/services/customRoles.js');
  const dir = mkdtempSync(join(tmpdir(), 'emika-reconcile-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    let r = new CustomRoles(db);
    r.setCreation('g', true);
    r.reserveCreation('g', ids.user, 'Self', 0, 'source');
    r.recordObserved('g', ids.user, ids.role);
    r.creationUncertain('g', ids.user);
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    r.recoverCreation();
    const s = reconcileSetup();
    s.db.close();
    s.c.customRoles = r;
    s.c.cases = new ModerationCases(db);
    await reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true });
    assert.equal(s.calls.length, 0);
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    r.recoverCreation();
    assert.equal(r.created('g', ids.user).status, 'created');
    assert.equal(r.created('g', ids.user).role_id, ids.role);
    s.c.customRoles = r;
    await assert.rejects(
      () => reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true }),
      /customReconcileUnavailable/,
    );
    assert.equal(s.calls.length, 0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('creation reconciliation shares mutex with creation/self actions and releases after native failure', async () => {
  const { reconcileCreation, createOwnRole, ownRoleEffect } =
    await import('../src/services/customRoles.js');
  const s = reconcileSetup();
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  s.i.guild.roles.fetch = async () => {
    await wait;
    throw Error('network');
  };
  try {
    const pending = reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true });
    await assert.rejects(
      () => reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true }),
      /roleActionBusy/,
    );
    await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }), /roleActionBusy/);
    await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }), /roleActionBusy/);
    release();
    await assert.rejects(() => pending);
    assert.equal(s.c.customRoles.active.size, 0);
    assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
    assert.equal(s.calls.length, 0);
  } finally {
    release();
    s.db.close();
  }
});

test('customrole manager commands reject foreign actors and guild identities', async () => {
  for (const sub of ['map', 'unmap', 'required', 'clear', 'creation', 'creations'])
    for (const kind of ['actor', 'member', 'guild']) {
      const s = setup();
      try {
        s.i.deferReply = async () => {};
        s.i.options = { getSubcommand: () => sub };
        if (kind === 'actor') s.member.id = 'other';
        if (kind === 'member') s.member.guild.id = 'other';
        if (kind === 'guild') s.i.guild.id = 'other';
        await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
        assert.equal(s.c.customRoles.list('g').length, 1);
      } finally {
        s.db.close();
      }
    }
});
test('customrole map validates refreshed manager and exact application bot after role lookup', async () => {
  for (const kind of ['authority', 'bot', 'botguild', 'app']) {
    const s = setup();
    try {
      s.i.deferReply = async () => {};
      s.i.options = {
        getSubcommand: () => 'map',
        getRole: () => s.role,
        getString: () => 'newname',
      };
      s.i.guild.roles.fetch = async () => {
        if (kind === 'authority') s.member.permissions.has = () => false;
        if (kind === 'bot') s.bot.id = 'other';
        if (kind === 'botguild') s.bot.guild.id = 'other';
        if (kind === 'app') s.i.appPermissions.has = () => false;
        return s.role;
      };
      await assert.rejects(() => command.execute(s.i, s.c));
      assert.equal(s.c.customRoles.get('g', 'newname'), undefined);
    } finally {
      s.db.close();
    }
  }
});
test('customrole eligibility role setup rechecks current manager after role lookup', async () => {
  const s = setup();
  try {
    s.i.deferReply = async () => {};
    s.i.options = { getSubcommand: () => 'required', getRole: () => s.gate };
    s.i.guild.roles.fetch = async () => {
      s.member.permissions.has = () => false;
      return s.gate;
    };
    await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    assert.equal(s.c.customRoles.required('g'), null);
  } finally {
    s.db.close();
  }
});

test('own role creation rechecks enabled policy after eligibility lookup before reservation', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  const s = setup();
  try {
    s.member.user = { bot: false };
    s.member.roles.cache.add(ids.gate);
    s.c.customRoles.setCreation('g', true);
    s.c.customRoles.setRequired('g', ids.gate);
    let creates = 0;
    s.i.guild.roles.create = async () => creates++;
    s.i.guild.roles.fetch = async () => {
      s.c.customRoles.setCreation('g', false);
      return s.gate;
    };
    await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }), /customConfigChanged/);
    assert.equal(creates, 0);
    assert.equal(s.c.customRoles.created('g', ids.user), undefined);
  } finally {
    s.db.close();
  }
});
test('own role creation refreshes member/appbot after eligibility lookup before native creation', async () => {
  const { createOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of ['gate', 'member', 'bot', 'permission']) {
    const s = setup();
    try {
      s.member.user = { bot: false };
      s.member.roles.cache.add(ids.gate);
      s.c.customRoles.setCreation('g', true);
      s.c.customRoles.setRequired('g', ids.gate);
      const current = { ...s.member, roles: { ...s.member.roles, cache: new Set([ids.gate]) } },
        bot = { ...s.bot };
      if (kind === 'gate') current.roles.cache.clear();
      if (kind === 'member') current.guild = { id: 'other' };
      if (kind === 'bot') bot.id = 'other';
      if (kind === 'permission') bot.permissions = { has: () => false };
      let creates = 0;
      s.i.guild.roles.create = async () => creates++;
      s.i.guild.roles.fetch = async () => {
        s.i.guild.members.fetch = async () => current;
        s.i.guild.members.fetchMe = async () => bot;
        return s.gate;
      };
      await assert.rejects(() => createOwnRole(s.i, s.c, { name: 'Self' }));
      assert.equal(creates, 0);
      assert.equal(s.c.customRoles.created('g', ids.user), undefined);
    } finally {
      s.db.close();
    }
  }
});

test('created role claim fetches current member/appbot/owned role after eligibility lookup', async () => {
  const { ownRoleEffect } = await import('../src/services/customRoles.js');
  for (const kind of ['gate', 'member', 'bot', 'unsafe', 'hierarchy']) {
    const s = ownSetup();
    try {
      s.c.customRoles.setRequired('g', ids.gate);
      s.member.roles.cache.add(ids.gate);
      const current = { ...s.member, roles: { ...s.member.roles, cache: new Set([ids.gate]) } },
        bot = { ...s.bot },
        role = { ...s.role };
      if (kind === 'gate') current.roles.cache.clear();
      if (kind === 'member') current.guild = { id: 'other' };
      if (kind === 'bot') bot.id = 'other';
      if (kind === 'unsafe') role.permissions = { bitfield: P.Administrator };
      if (kind === 'hierarchy') bot.roles = { highest: { comparePositionTo: () => 0 } };
      s.i.guild.roles.fetch = async (id) => {
        if (id === ids.gate) {
          s.i.guild.members.fetch = async () => current;
          s.i.guild.members.fetchMe = async () => bot;
          return s.gate;
        }
        return role;
      };
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim: true }));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('mapped role effects require exact member/application/guild identities before case or effect', async () => {
  for (const kind of ['member', 'bot', 'botguild', 'interaction'])
    for (const claim of [true, false]) {
      const s = setup();
      try {
        if (kind === 'member') s.member.guild.id = 'other';
        if (kind === 'bot') s.bot.id = 'other';
        if (kind === 'botguild') s.bot.guild.id = 'other';
        if (kind === 'interaction') s.i.guild.id = 'other';
        await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim }));
        assert.equal(s.calls.length, 0);
        assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
      } finally {
        s.db.close();
      }
    }
});
test('mapped role claim reads current gate possession and bot state after gate lookup', async () => {
  for (const kind of ['gate', 'bot', 'role']) {
    const s = setup();
    try {
      s.c.customRoles.setRequired('g', ids.gate);
      s.member.roles.cache.add(ids.gate);
      const current = { ...s.member, roles: { ...s.member.roles, cache: new Set() } },
        bot = { ...s.bot, id: 'other' };
      s.i.guild.roles.fetch = async (id) => {
        if (id === ids.gate) {
          if (kind === 'gate') s.i.guild.members.fetch = async () => current;
          if (kind === 'bot') s.i.guild.members.fetchMe = async () => bot;
          if (kind === 'role') s.role.permissions.has = (p) => p === P.Administrator;
          return s.gate;
        }
        return s.role;
      };
      await assert.rejects(() => customRoleEffect(s.i, s.c, { name: 'member', claim: true }));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});

test('creation reconciliation reads current manager and bot after observed-role lookup', async () => {
  const { reconcileCreation } = await import('../src/services/customRoles.js');
  for (const kind of ['permission', 'identity', 'hierarchy', 'bot']) {
    const s = reconcileSetup();
    try {
      const actor = { ...s.member },
        bot = { ...s.bot };
      if (kind === 'permission') actor.permissions = { has: () => false };
      if (kind === 'identity') actor.guild = { id: 'other' };
      if (kind === 'hierarchy') actor.roles = { highest: { comparePositionTo: () => 0 } };
      if (kind === 'bot') bot.id = 'other';
      s.i.guild.roles.fetch = async () => {
        s.i.guild.members.fetch = async () => actor;
        s.i.guild.members.fetchMe = async () => bot;
        return s.role;
      };
      await assert.rejects(() => reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true }));
      assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('custom creation completion requires exact observed valid role receipt and cannot replace native identity', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CustomRoles(db);
    r.setCreation('g', true);
    r.reserveCreation('g', ids.user, 'Self', 0, 'one');
    for (const v of [null, '', 1, 'bad']) {
      assert.throws(() => r.recordObserved('g', ids.user, v), /customRoleInvalid/);
      assert.throws(() => r.recordCreated('g', ids.user, v), /customRoleInvalid/);
    }
    assert.throws(() => r.recordCreated('g', ids.user, ids.role), /not finalized/);
    r.recordObserved('g', ids.user, ids.role);
    assert.throws(() => r.recordCreated('g', ids.user, ids.gate), /not finalized/);
    assert.equal(r.created('g', ids.user).role_id, ids.role);
    r.recordCreated('g', ids.user, ids.role);
    assert.throws(() => r.recordCreated('g', ids.user, ids.role), /not finalized/);
    assert.equal(r.created('g', ids.user).status, 'created');
  } finally {
    db.close();
  }
});
test('late custom creation uncertainty never rewrites created or reconciled receipts foreign guild or missing owner', () => {
  const s = ownSetup();
  try {
    const r = s.c.customRoles,
      before = r.created('g', ids.user);
    assert.equal(r.creationUncertain('g', ids.user), false);
    assert.equal(r.creationUncertain('foreign', ids.user), false);
    assert.equal(r.creationUncertain('g', ids.owner), false);
    assert.deepEqual(r.created('g', ids.user), before);
    r.reserveCreation('g', ids.owner, 'Another', 0, 'two');
    assert.equal(r.creationUncertain('g', ids.owner), true);
    assert.equal(r.creationUncertain('g', ids.owner), false);
    assert.throws(
      () => r.reserveCreation('g', ids.owner, 'Repeat', 0, 'three'),
      /customCreationExists/,
    );
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('guarded completed custom role receipt survives actualSQLite reopen and late failure without reassignment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emika-custom-receipt-')),
    path = join(dir, 'db');
  let db;
  try {
    db = openDatabase(path);
    let r = new CustomRoles(db);
    r.setCreation('g', true);
    r.reserveCreation('g', ids.user, 'Self', 0, 'one');
    r.recordObserved('g', ids.user, ids.role);
    r.recordCreated('g', ids.user, ids.role);
    const before = r.created('g', ids.user);
    db.close();
    db = openDatabase(path);
    r = new CustomRoles(db);
    r.recoverCreation();
    assert.equal(r.creationUncertain('g', ids.user), false);
    assert.deepEqual(r.created('g', ids.user), before);
    assert.throws(() => r.recordObserved('g', ids.user, ids.gate));
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function styleSetup() {
  const s = ownSetup();
  s.role.name = 'Self';
  s.role.colors = { primaryColor: 0 };
  s.role.edit = async (o) => {
    s.calls.push(o);
    if (o.name) s.role.name = o.name;
    if (o.colors) s.role.colors = o.colors;
    return s.role;
  };
  return s;
}
test('created role style edits are confirmed zero-permission/name/color only with observed native state and no assignments', async () => {
  const { styleOwnRole } = await import('../src/services/customRoles.js');
  const s = styleSetup();
  try {
    assert.equal((await styleOwnRole(s.i, s.c, { name: 'New', confirm: true })).changed, true);
    assert.equal(s.c.customRoles.created('g', ids.user).name, 'New');
    assert.equal(s.role.permissions.bitfield, 0n);
    s.i.id = 'color';
    await styleOwnRole(s.i, s.c, { color: 0x123456, confirm: true });
    assert.deepEqual(s.calls[1].colors, { primaryColor: 0x123456 });
    assert.equal(s.c.customRoles.created('g', ids.user).color, 0x123456);
    s.i.id = 'reset';
    await styleOwnRole(s.i, s.c, { color: 0, confirm: true });
    assert.equal(s.role.name, 'New');
    assert.equal((await styleOwnRole(s.i, s.c, { color: 0, confirm: true })).changed, false);
    assert.equal(s.calls.length, 3);
    assert(s.calls.every((o) => !('permissions' in o) && !('mentionable' in o)));
    assert(
      s.db
        .prepare('SELECT status FROM moderation_cases')
        .all()
        .every((r) => r.status === 'completed'),
    );
  } finally {
    s.db.close();
  }
});
test('created role style input/identity/safety/gate/policy guards and uncertain outcomes stop effects and retries', async () => {
  const { styleOwnRole } = await import('../src/services/customRoles.js');
  for (const kind of [
    'confirm',
    'input',
    'member',
    'bot',
    'permission',
    'unsafe',
    'gate',
    'policy',
    'network',
    'observation',
    'storage',
  ]) {
    const s = styleSetup();
    try {
      if (kind === 'member') s.member.id = 'wrong';
      if (kind === 'bot') s.bot.id = 'wrong';
      if (kind === 'permission') s.bot.permissions.has = () => false;
      if (kind === 'unsafe') s.role.permissions.bitfield = 8n;
      if (kind === 'gate') s.c.customRoles.setRequired('g', ids.gate);
      if (kind === 'policy') s.c.customRoles.setCreation('g', false);
      if (kind === 'network')
        s.role.edit = async (o) => {
          s.calls.push(o);
          throw Error('network');
        };
      if (kind === 'observation')
        s.role.edit = async (o) => {
          s.calls.push(o);
        };
      if (kind === 'storage')
        s.c.cases.finish = () => {
          throw Error('db');
        };
      await assert.rejects(() =>
        styleOwnRole(s.i, s.c, {
          name: kind === 'input' ? '@everyone' : 'New',
          confirm: kind !== 'confirm',
        }),
      );
      const effect = ['network', 'observation', 'storage'].includes(kind);
      assert.equal(s.calls.length, effect ? 1 : 0);
      if (effect) {
        assert.equal(s.c.customRoles.created('g', ids.user).status, 'uncertain');
        s.i.id = 'retry';
        await assert.rejects(() => styleOwnRole(s.i, s.c, { color: 0, confirm: true }));
        assert.equal(s.calls.length, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('created role cosmetic three commands shared private3locale embeds and explicit confirmation', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = styleSetup();
    try {
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'renameown',
        reply,
        confirm = false;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => sub,
        getString: (n) => (n === 'label' ? 'New' : '123456'),
        getBoolean: () => confirm,
      };
      await assert.rejects(() => command.execute(s.i, s.c), /customStyleConfirm/);
      confirm = true;
      await command.execute(s.i, s.c);
      sub = 'colorown';
      s.i.id = 'color';
      await command.execute(s.i, s.c);
      sub = 'resetstyle';
      s.i.id = 'reset';
      await command.execute(s.i, s.c);
      assert.equal(s.calls.length, 3);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(s.role.colors.primaryColor, 0);
    } finally {
      s.db.close();
    }
  }
});

test('unresolved own cosmetic case cannot bypass freeze via creation reconcile or claim/release', async () => {
  const { styleOwnRole, reconcileCreation, ownRoleEffect } =
    await import('../src/services/customRoles.js');
  const s = styleSetup();
  try {
    s.role.edit = async (o) => {
      s.calls.push(o);
      s.role.name = o.name;
      throw Error('accepted but unknown');
    };
    await assert.rejects(
      () => styleOwnRole(s.i, s.c, { name: 'New', confirm: true }),
      /customStyleUncertain/,
    );
    await assert.rejects(
      () => reconcileCreation(s.i, s.c, { ownerId: ids.user, confirm: true }),
      /customStyleUncertain/,
    );
    s.db.prepare("UPDATE custom_created_roles SET status='created' WHERE guild_id='g'").run();
    for (const claim of [true, false])
      await assert.rejects(() => ownRoleEffect(s.i, s.c, { claim }), /customOwnUncertain/);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});

test('custommappingrename unique/scoped preserves nativeID/timestamp/gate,oldalias unavailable', () => {
  const s = setup();
  try {
    s.c.customRoles.setRequired('g', ids.gate);
    s.c.customRoles.map('other', 'member', ids.role);
    const created = s.db
      .prepare("SELECT created_at FROM custom_role_mappings WHERE guild_id='g'")
      .get().created_at;
    assert.equal(s.c.customRoles.renameMapping('g', 'member', 'new-alias'), true);
    assert.equal(s.c.customRoles.get('g', 'member'), undefined);
    assert.equal(s.c.customRoles.get('g', 'new-alias').role_id, ids.role);
    assert.equal(
      s.db.prepare("SELECT created_at FROM custom_role_mappings WHERE guild_id='g'").get()
        .created_at,
      created,
    );
    assert(s.c.customRoles.get('other', 'member'));
    assert.equal(s.c.customRoles.renameMapping('g', 'new-alias', 'new-alias'), false);
    s.c.customRoles.map('g', 'existing', ids.owner);
    assert.throws(
      () => s.c.customRoles.renameMapping('g', 'new-alias', 'existing'),
      /customMappingExists/,
    );
    assert.throws(() => s.c.customRoles.renameMapping('g', 'missing', 'x'), /customMappingMissing/);
    assert.equal(s.c.customRoles.required('g'), ids.gate);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('customeligibility fresh self/gate checks no safety/grant claim and changedgate blocks', async () => {
  const s = setup();
  try {
    s.member.user = { bot: false };
    s.c.customRoles.setRequired('g', ids.gate);
    let reply;
    s.i.deferReply = async () => {};
    s.i.editReply = async (p) => {
      reply = p;
    };
    s.i.options = { getSubcommand: () => 'eligibility' };
    await command.execute(s.i, s.c);
    assert(reply.embeds[0].data.description.includes('Disabled'));
    s.member.roles.cache.add(ids.gate);
    await command.execute(s.i, s.c);
    assert(reply.embeds[0].data.description.includes('Enabled'));
    const fetch = s.i.guild.roles.fetch;
    s.i.guild.roles.fetch = async (...a) => {
      s.c.customRoles.setRequired('g', null);
      return fetch(...a);
    };
    await assert.rejects(() => command.execute(s.i, s.c), /customConfigChanged/);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('custommappingrename/export/eligibility private3locale bytes/currentmanager nativeunchanged', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.member.user = { bot: false };
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'exportmappings',
        reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => sub,
        getString: (n) => (n === 'name' ? 'member' : 'renamed'),
      };
      await command.execute(s.i, s.c);
      const r = JSON.parse(reply.files[0].attachment.toString());
      assert.deepEqual(r.mappings, s.c.customRoles.list('g'));
      assert(!('owners' in r));
      sub = 'renamemapping';
      await command.execute(s.i, s.c);
      assert(s.c.customRoles.get('g', 'renamed'));
      sub = 'eligibility';
      await command.execute(s.i, s.c);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(s.calls.length, 0);
      s.member.permissions.has = () => false;
      for (sub of ['exportmappings', 'renamemapping'])
        await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    } finally {
      s.db.close();
    }
  }
});
