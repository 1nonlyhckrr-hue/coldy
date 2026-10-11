import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/database/index.js';
import { CommandRestrictions } from '../src/services/permit.js';
import permit from '../src/commands/permit/permit.js';
import { translate } from '../src/services/localization.js';
import { createInteractionHandler } from '../src/events/interactionCreate.js';
import { Cooldowns } from '../src/services/cooldowns.js';
const user = '100000000000000001',
  role = '100000000000000002',
  owner = '100000000000000003';
function fixture(db) {
  const r = new CommandRestrictions(db);
  const member = {
    id: user,
    guild: { id: 'g' },
    permissions: { has: () => true },
    roles: { cache: new Set([role]) },
  };
  const guild = {
    id: 'g',
    ownerId: owner,
    members: { fetch: async () => member },
    roles: { fetch: async () => ({ id: role, guild: { id: 'g' }, managed: false }) },
  };
  return { r, member, guild };
}
test('restrictions persist after restart and isolate guilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luna-permit-')),
    path = join(dir, 'test.db');
  try {
    let db = openDatabase(path);
    new CommandRestrictions(db).set('g', 'fun', 'user', user, true);
    db.close();
    db = openDatabase(path);
    const r = new CommandRestrictions(db);
    assert.equal(r.list('g').length, 1);
    assert.equal(r.list('other').length, 0);
    r.set('g', 'fun', 'user', user, false);
    assert.equal(r.list('g').length, 0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('restriction validation and recovery commands fail closed', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CommandRestrictions(db);
    for (const args of [
      ['help', 'user', user],
      ['permit', 'role', role],
      ['FUN', 'user', user],
      ['fun', 'bad', user],
      ['fun', 'user', "'); DROP TABLE command_restrictions; --"],
    ])
      assert.throws(() => r.set('g', ...args, true));
    assert.equal(r.list('g').length, 0);
  } finally {
    db.close();
  }
});
test('bounded restrictions are idempotent and clear only selected command', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CommandRestrictions(db);
    for (let n = 0; n < 100; n++)
      r.set('g', 'fun', 'user', String(100000000000000000n + BigInt(n)), true);
    r.set('g', 'fun', 'user', user, true);
    assert.equal(r.list('g').length, 100);
    assert.throws(() => r.set('g', 'ping', 'role', role, true));
    assert.equal(r.clear('g', 'ping'), 0);
    assert.equal(r.clear('g', 'fun'), 100);
  } finally {
    db.close();
  }
});
test('enforcement refreshes member and blocks users/roles but not unrelated commands', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild } = fixture(db),
      i = { guildId: 'g', guild, user: { id: user } };
    r.set('g', 'fun', 'user', user, true);
    await assert.rejects(() => r.enforce(i, 'fun'), /permitDenied/);
    await r.enforce(i, 'ping');
    r.clear('g', 'fun');
    r.set('g', 'fun', 'role', role, true);
    await assert.rejects(() => r.enforce(i, 'fun'), /permitDenied/);
    guild.members.fetch = async () => ({
      id: user,
      guild: { id: 'g' },
      roles: { cache: new Set() },
    });
    await r.enforce(i, 'fun');
    guild.members.fetch = async () => null;
    await assert.rejects(() => r.enforce(i, 'fun'), /permitMemberMissing/);
  } finally {
    db.close();
  }
});
test('owner always retains restriction recovery but bot owner is no bypass', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild } = fixture(db);
    r.set('g', 'fun', 'role', role, true);
    await r.enforce({ guildId: 'g', guild, user: { id: owner } }, 'fun');
    await r.enforce({ guildId: 'g', guild, user: { id: user } }, 'permit');
    await r.enforce({ guildId: 'g', guild, user: { id: user } }, 'help');
    await assert.rejects(() => r.enforce({ guildId: 'g', guild, user: { id: user } }, 'fun'));
  } finally {
    db.close();
  }
});
test('dispatch restrictions deny execution and do not replace Discord permissions', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild } = fixture(db);
    r.set('g', 'fun', 'user', user, true);
    let ran = false;
    const replies = [],
      i = {
        isChatInputCommand: () => true,
        inGuild: () => true,
        user: { id: user },
        guildId: 'g',
        guild,
        commandName: 'fun',
        reply: async (p) => replies.push(p),
      };
    const c = {
      commands: new Map([
        [
          'fun',
          {
            data: { name: 'fun' },
            execute: async () => {
              ran = true;
            },
          },
        ],
      ]),
      config: { ownerIds: [user] },
      cooldowns: new Cooldowns(),
      commandRestrictions: r,
      logger: { error() {}, warn() {} },
    };
    await createInteractionHandler(c)(i);
    assert.equal(ran, false);
    assert.match(replies[0].embeds[0].data.description, /restricted/);
    r.clear('g', 'fun');
    c.commands.get('fun').userPermissions = ['BanMembers'];
    await createInteractionHandler(c)(i);
    assert.equal(ran, false);
  } finally {
    db.close();
  }
});
function interaction(guild, sub, { name = 'fun', target = user, page = 1 } = {}) {
  const replies = [];
  return {
    i: {
      guildId: 'g',
      guild,
      user: { id: user },
      options: {
        getSubcommand: () => sub,
        getString: (field) => (field === 'command' ? name : null),
        getUser: () => ({ id: target }),
        getRole: () => ({ id: role }),
        getInteger: () => page,
      },
      deferReply: async () => {},
      editReply: async (p) => replies.push(p),
    },
    replies,
  };
}
test('Permit paths execute localized private replies and fresh management check', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const { r, guild } = fixture(db),
        c = {
          commands: new Map([['fun', {}]]),
          commandRestrictions: r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      for (const sub of ['blockuser', 'unblockuser', 'blockrole', 'unblockrole', 'list', 'clear']) {
        const { i, replies } = interaction(guild, sub);
        await permit.execute(i, c);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].embeds.length, 1);
        assert.deepEqual(replies[0].allowedMentions.parse, []);
      }
      guild.members.fetch = async () => ({ permissions: { has: () => false } });
      await assert.rejects(() => permit.execute(interaction(guild, 'list').i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});
test('Permit rejects owner, everyone, managed roles, protected/unknown command and bad page', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild, member } = fixture(db),
      c = {
        commands: new Map([
          ['fun', {}],
          ['help', {}],
        ]),
        commandRestrictions: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    for (const name of ['help', 'absent'])
      await assert.rejects(() => permit.execute(interaction(guild, 'clear', { name }).i, c));
    await assert.rejects(() => permit.execute(interaction(guild, 'list', { page: 2 }).i, c));
    guild.members.fetch = async ({ user: id }) =>
      id === owner ? { ...member, id: owner } : member;
    await assert.rejects(
      () => permit.execute(interaction(guild, 'blockuser', { target: owner }).i, c),
      /permitOwnerProtected/,
    );
    for (const bad of [
      { id: 'g', guild: { id: 'g' }, managed: false },
      { id: role, guild: { id: 'g' }, managed: true },
      null,
    ]) {
      guild.roles.fetch = async () => bad;
      await assert.rejects(
        () => permit.execute(interaction(guild, 'blockrole').i, c),
        /permitRoleInvalid/,
      );
    }
    assert.equal(r.list('g').length, 0);
  } finally {
    db.close();
  }
});
test('Permit metadata exposes eight paths and runtime role loss takes effect', async () => {
  assert.equal(permit.data.toJSON().options.length, 8);
  const db = openDatabase(':memory:');
  try {
    const { r, guild, member } = fixture(db);
    r.set('g', 'fun', 'role', role, true);
    await assert.rejects(() => r.enforce({ guildId: 'g', guild, user: { id: user } }, 'fun'));
    member.roles.cache.clear();
    await r.enforce({ guildId: 'g', guild, user: { id: user } }, 'fun');
  } finally {
    db.close();
  }
});

test('Permit management exact actor/subject identity and final permission fail closed', async () => {
  for (const kind of ['actorId', 'actorGuild', 'subjectGuild', 'roleId', 'lostPermission']) {
    const db = openDatabase(':memory:');
    const { r, guild, member } = fixture(db),
      c = {
        commands: new Map([['fun', {}]]),
        commandRestrictions: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    let calls = 0;
    guild.members.fetch = async (o) => {
      assert.equal(o.force, true);
      calls++;
      if (kind === 'actorId') return { ...member, id: owner };
      if (kind === 'actorGuild') return { ...member, guild: { id: 'other' } };
      if (kind === 'subjectGuild' && calls === 2) return { ...member, guild: { id: 'other' } };
      if (kind === 'lostPermission' && calls >= 3)
        return { ...member, permissions: { has: () => false } };
      return member;
    };
    guild.roles.fetch = async (id, o) => {
      assert.equal(o.force, true);
      return { id: owner, guild: { id: 'g' }, managed: false };
    };
    try {
      await assert.rejects(() =>
        permit.execute(interaction(guild, kind === 'roleId' ? 'blockrole' : 'blockuser').i, c),
      );
      assert.equal(r.list('g').length, 0);
    } finally {
      db.close();
    }
  }
});
test('Permit enforcement rechecks changed restrictions after member await and refuses wrong guild', async () => {
  for (const kind of ['added', 'removed', 'wrongGuild']) {
    const db = openDatabase(':memory:');
    const { r, guild, member } = fixture(db);
    r.set('g', 'fun', 'user', owner, true);
    guild.members.fetch = async () => {
      if (kind === 'added') r.set('g', 'fun', 'user', user, true);
      if (kind === 'removed') r.clear('g', 'fun');
      return kind === 'wrongGuild' ? { ...member, guild: { id: 'other' } } : member;
    };
    try {
      const run = () => r.enforce({ guildId: 'g', guild, user: { id: user } }, 'fun');
      if (kind === 'removed') await run();
      else await assert.rejects(run);
      assert.equal(r.list('other').length, 0);
    } finally {
      db.close();
    }
  }
});

test('stored restriction removal is exact,guild isolated and preserves other user/role rules', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CommandRestrictions(db);
    r.set('g', 'fun', 'user', user, true);
    r.set('g', 'fun', 'role', role, true);
    r.set('other', 'fun', 'user', user, true);
    assert.equal(r.removeStored('g', 'fun', 'user', user), 1);
    assert.equal(r.removeStored('g', 'fun', 'user', user), 0);
    assert.equal(r.list('g').length, 1);
    assert.equal(r.list('other').length, 1);
    assert.throws(() => r.removeStored('g', 'help', 'user', user));
    assert.throws(() => r.removeStored('g', 'fun', 'bad', user));
    assert.throws(() => r.removeStored('g', 'fun', 'user', 'invalid'));
  } finally {
    db.close();
  }
});
test('Permit remove handles departed subject without native target reads and requires confirmation', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const { r, guild } = fixture(db);
      r.set('g', 'fun', 'user', owner, true);
      const c = {
        commands: new Map([['fun', {}]]),
        commandRestrictions: r,
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      let confirm = false;
      const { i, replies } = interaction(guild, 'remove');
      i.options.getBoolean = () => confirm;
      i.options.getString = (n) => (n === 'command' ? 'fun' : n === 'kind' ? 'user' : owner);
      guild.roles.fetch = async () => {
        throw Error('No target fetch');
      };
      const fetch = guild.members.fetch;
      guild.members.fetch = async (o) => {
        assert.equal(o.user, user);
        return fetch(o);
      };
      await assert.rejects(() => permit.execute(i, c), /permitRemoveConfirm/);
      assert.equal(r.list('g').length, 1);
      confirm = true;
      await permit.execute(i, c);
      assert.equal(r.list('g').length, 0);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
    } finally {
      db.close();
    }
  }
});

test('permit caller status reads current member roles and isolates guild without mutation or subject disclosure', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild, member } = fixture(db),
      i = { guildId: 'g', guild, user: { id: user } };
    r.set('g', 'fun', 'role', role, true);
    assert.equal(await r.ownStatus(i, 'fun'), 'denied');
    member.roles.cache.clear();
    assert.equal(await r.ownStatus(i, 'fun'), 'notdenied');
    assert.equal(await r.ownStatus(i, 'help'), 'exempt');
    r.set('other', 'fun', 'user', user, true);
    assert.equal(await r.ownStatus(i, 'fun'), 'notdenied');
    member.guild.id = 'foreign';
    await assert.rejects(() => r.ownStatus(i, 'fun'), /permitMemberMissing/);
    assert.equal(r.list('g').length, 1);
  } finally {
    db.close();
  }
});
test('permit status allows caller without manager permission,private localized and only own restriction result', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const { r, guild, member } = fixture(db);
      member.permissions.has = () => false;
      r.set('g', 'fun', 'user', user, true);
      const replies = [],
        i = {
          guildId: 'g',
          guild,
          user: { id: user },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => replies.push(p),
          options: { getSubcommand: () => 'status', getString: () => 'fun' },
        },
        c = {
          commands: new Map([['fun', {}]]),
          commandRestrictions: r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      await permit.execute(i, c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(!replies[0].embeds[0].data.description.includes(user));
      assert(!replies[0].embeds[0].data.description.includes(role));
      assert.equal(r.list('g').length, 1);
      c.commands.clear();
      await assert.rejects(() => permit.execute(i, c), /permitCommandInvalid/);
    } finally {
      db.close();
    }
  }
});

test('dispatcher permits nonmanager own status but blocks nonmanager management after default gate removal', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild, member } = fixture(db);
    member.permissions.has = () => false;
    const c = {
      commands: new Map([
        ['permit', permit],
        ['fun', {}],
      ]),
      commandRestrictions: r,
      cooldowns: new Cooldowns(),
      config: { ownerIds: [] },
      logger: { error: () => {} },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
    for (const sub of ['status', 'list', 'clear']) {
      const { i, replies } = interaction(guild, sub);
      Object.assign(i, {
        isChatInputCommand: () => true,
        inGuild: () => true,
        commandName: 'permit',
        memberPermissions: { has: () => false },
        reply: async (p) => replies.push(p),
      });
      const handler = createInteractionHandler(c);
      await handler(i);
      assert.equal(replies.length, 1);
      const body = replies[0].embeds[0].data.description;
      assert(
        sub === 'status'
          ? body.includes('stored command restrictions')
          : body.includes('permission'),
      );
    }
    assert.equal(r.list('g').length, 0);
    assert.equal(permit.data.toJSON().default_member_permissions, undefined);
  } finally {
    db.close();
  }
});

test('filtered permit denies preserve exact command/kind/guild scope including removed commands without mutation', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new CommandRestrictions(db);
    r.set('g', 'fun', 'user', user, true);
    r.set('g', 'fun', 'role', role, true);
    r.set('g', 'old_command', 'user', owner, true);
    r.set('foreign', 'fun', 'user', owner, true);
    const before = r.list('g');
    assert.equal(r.filtered('g', { commandName: 'fun' }).length, 2);
    assert.deepEqual(r.filtered('g', { commandName: 'fun', kind: 'user' }), [before[1]]);
    assert.equal(r.filtered('g', { kind: 'user' }).length, 2);
    assert.equal(r.filtered('g', { commandName: 'old_command' })[0].subject_id, owner);
    assert.deepEqual(r.filtered('g', { commandName: 'missing' }), []);
    assert.deepEqual(r.filtered('empty'), []);
    assert.deepEqual(r.list('g'), before);
    for (const kind of ['bad', 0, false])
      assert.throws(() => r.filtered('g', { kind }), /permitSubjectInvalid/);
    for (const name of ['FUN', 'bad name', 0])
      assert.throws(() => r.filtered('g', { commandName: name }), /permitCommandInvalid/);
  } finally {
    db.close();
  }
});
test('filtered permit list filters before pagination current-manager private/localized no native lookup or mutation', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const db = openDatabase(':memory:');
    try {
      const { r, member, guild } = fixture(db);
      for (let n = 0; n < 12; n++)
        r.set('g', 'fun', 'user', String(100000000000000010n + BigInt(n)), true);
      for (let n = 0; n < 10; n++)
        r.set('g', 'ping', 'role', String(100000000000000010n + BigInt(n)), true);
      const before = r.list('g'),
        replies = [],
        i = {
          guildId: 'g',
          guild,
          user: { id: user },
          options: {
            getSubcommand: () => 'list',
            getInteger: () => 2,
            getString: (n) => (n === 'command' ? 'fun' : 'user'),
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => replies.push(p),
        },
        c = {
          commandRestrictions: r,
          commands: new Map(),
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
      await permit.execute(i, c);
      const body = replies[0].embeds[0].data.description;
      assert.equal((body.match(/\/fun/g) || []).length, 2);
      assert(!body.includes('/ping'));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.deepEqual(r.list('g'), before);
      member.permissions.has = () => false;
      await assert.rejects(() => permit.execute(i, c), /userPermission/);
      assert.equal(replies.length, 1);
    } finally {
      db.close();
    }
  }
});
test('filtered permit empty results use page one and never imply command/Discord permission grants', async () => {
  const db = openDatabase(':memory:');
  try {
    const { r, guild } = fixture(db);
    let page = 2;
    const replies = [],
      i = {
        guildId: 'g',
        guild,
        user: { id: user },
        options: { getSubcommand: () => 'list', getInteger: () => page, getString: () => null },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
      },
      c = {
        commandRestrictions: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
    await assert.rejects(() => permit.execute(i, c), /permitPageInvalid/);
    page = 1;
    await permit.execute(i, c);
    assert.equal(replies.length, 1);
    assert.deepEqual(r.list('g'), []);
  } finally {
    db.close();
  }
});
