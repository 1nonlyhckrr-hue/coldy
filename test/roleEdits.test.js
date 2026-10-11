import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { editSafeRole } from '../src/services/roleEdits.js';
import command from '../src/commands/moderation/role.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const member = (id) => ({
      id,
      guild: { id: 'g' },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 5 } },
    }),
    actor = member('u'),
    bot = member('b'),
    role = {
      id: '100000000000000001',
      guild: { id: 'g' },
      managed: false,
      name: 'Old',
      colors: { primaryColor: 0 },
      mentionable: false,
      permissions: new PermissionsBitField([P.ViewChannel]),
      edit: async (o) => {
        calls.push(o);
        if (o.name) role.name = o.name;
        if (o.colors) role.colors = o.colors;
        if ('mentionable' in o) role.mentionable = o.mentionable;
      },
    };
  const i = {
    id: 'i',
    guildId: 'g',
    user: { id: 'u' },
    client: { user: { id: 'b' } },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      ownerId: 'owner',
      members: { fetch: async () => actor, fetchMe: async () => bot },
      roles: { fetch: async () => role },
    },
  };
  return { db, c: { cases: new ModerationCases(db) }, i, actor, bot, role, calls };
}
test('safeexistingrole rename/color/mentionable confirmedexactnativepatch/case/no permissionsassignments and no-op', async () => {
  const s = setup();
  try {
    for (const [action, value] of [
      ['rename', 'New'],
      ['color', 0x123456],
      ['mentionable', true],
    ]) {
      s.i.id = action;
      await editSafeRole(s.i, s.c, { roleId: s.role.id, action, value, confirm: true });
    }
    assert.equal(s.calls.length, 3);
    assert.deepEqual(s.calls[1].colors, { primaryColor: 0x123456 });
    assert.equal(s.calls[2].mentionable, true);
    assert(s.calls.every((o) => !('permissions' in o) && !('position' in o)));
    assert.equal(
      (
        await editSafeRole(s.i, s.c, {
          roleId: s.role.id,
          action: 'mentionable',
          value: true,
          confirm: true,
        })
      ).changed,
      false,
    );
  } finally {
    s.db.close();
  }
});
test('saferole dangerous/managed/hierarchy/createdrole/auth/confirm/input and unknown effects block mutation/retry', async () => {
  for (const kind of [
    'dangerous',
    'managed',
    'hierarchy',
    'created',
    'actor',
    'bot',
    'confirm',
    'input',
    'network',
    'observe',
    'storage',
  ]) {
    const s = setup();
    try {
      if (kind === 'dangerous') s.role.permissions = new PermissionsBitField(P.Administrator);
      if (kind === 'managed') s.role.managed = true;
      if (kind === 'hierarchy') s.bot.roles.highest.comparePositionTo = () => 0;
      if (kind === 'created')
        s.db
          .prepare(
            "INSERT INTO custom_created_roles VALUES('g','u',?,'Old',0,'created','creation',0)",
          )
          .run(s.role.id);
      if (kind === 'actor') s.actor.permissions.has = () => false;
      if (kind === 'bot') s.bot.id = 'wrong';
      if (kind === 'network')
        s.role.edit = async (o) => {
          s.calls.push(o);
          throw Error('network');
        };
      if (kind === 'observe')
        s.role.edit = async (o) => {
          s.calls.push(o);
        };
      if (kind === 'storage')
        s.c.cases.finish = () => {
          throw Error('db');
        };
      const args = {
        roleId: s.role.id,
        action: 'rename',
        value: kind === 'input' ? '@everyone' : 'New',
        confirm: kind !== 'confirm',
      };
      await assert.rejects(() => editSafeRole(s.i, s.c, args));
      const effect = ['network', 'observe', 'storage'].includes(kind);
      assert.equal(s.calls.length, effect ? 1 : 0);
      if (effect) {
        s.i.id = 'retry';
        await assert.rejects(
          () => editSafeRole(s.i, s.c, { ...args, action: 'color', value: 0 }),
          /safeRoleEditUncertain/,
        );
        assert.equal(s.calls.length, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('saferole threepaths private3locale no-ping exactnativeobserved acknowledgement', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'rename',
        reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => sub,
        getRole: () => s.role,
        getString: (n) => (n === 'hex' ? '123456' : 'New'),
        getBoolean: () => true,
      };
      for (sub of ['rename', 'color', 'mentionable']) {
        s.i.id = sub;
        await command.execute(s.i, s.c);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.calls.length, 3);
    } finally {
      s.db.close();
    }
  }
});
