import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import {
  BulkTimeout,
  previewBulkTimeout,
  confirmBulkTimeout,
} from '../src/services/bulkTimeout.js';
import command from '../src/commands/moderation/bulktimeout.js';
const g = '100000000000000001',
  u = '100000000000000002',
  b = '100000000000000003',
  t = '100000000000000004',
  t2 = '100000000000000005';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    make = (id) => ({
      id,
      guild: { id: g },
      user: { bot: false },
      moderatable: true,
      permissions: { has: (p) => p !== P.Administrator },
      roles: { highest: { comparePositionTo: () => 5 } },
      communicationDisabledUntilTimestamp: Date.now() + 3600000,
    });
  const actor = make(u),
    bot = make(b),
    members = new Map([
      [t, make(t)],
      [t2, make(t2)],
    ]);
  for (const m of members.values())
    m.disableCommunicationUntil = async (until) => {
      calls.push(m.id);
      m.communicationDisabledUntilTimestamp = until;
    };
  const guild = {
    id: g,
    ownerId: u,
    fetch: async () => guild,
    members: {
      fetch: async ({ user }) => (user === u ? actor : members.get(user)),
      fetchMe: async () => bot,
    },
  };
  const i = {
      id: 'i',
      guild,
      guildId: g,
      user: { id: u },
      client: { user: { id: b } },
      appPermissions: { has: () => true },
    },
    c = {
      bulkTimeout: new BulkTimeout(db),
      cases: new ModerationCases(db),
      guildConfig: { get: () => ({ language: 'en' }) },
    };
  return {
    db,
    i,
    c,
    actor,
    bot,
    members,
    calls,
    preview: () => previewBulkTimeout(i, c, [t, t2]),
    confirm: (id) => confirmBulkTimeout(i, c, { id, confirm: true }),
  };
}
test('bulktimeout preview exactbounddeadline persistence owner/guild/actor and no effects', async () => {
  const s = setup();
  try {
    const p = await s.preview();
    assert.equal(p.rows.length, 2);
    assert.equal(p.rows[0].until, s.members.get(t).communicationDisabledUntilTimestamp);
    assert.equal(s.calls.length, 0);
    assert(new BulkTimeout(s.db).get(p.id, g, u));
    assert.equal(s.c.bulkTimeout.get(p.id, 'foreign', u), undefined);
    assert.equal(s.c.bulkTimeout.get(p.id, g, 'foreign'), undefined);
  } finally {
    s.db.close();
  }
});
test('bulktimeout confirms exactlypreviewed clearproof casepermember one-shot', async () => {
  const s = setup();
  try {
    const p = await s.preview();
    const result = await s.confirm(p.id);
    assert.deepEqual(result.completed, [t, t2]);
    assert.deepEqual(s.calls, [t, t2]);
    assert.equal(s.c.bulkTimeout.get(p.id, g, u).status, 'completed');
    assert.equal(
      s.db.prepare("SELECT count(*) n FROM moderation_cases WHERE status='completed'").get().n,
      2,
    );
    await assert.rejects(() => s.confirm(p.id), /bulkTimeoutBlocked/);
  } finally {
    s.db.close();
  }
});
test('bulktimeout wholepreflight drift expiry foreignactor no clear and explicitconfirm input guards', async () => {
  const s = setup();
  try {
    const p = await s.preview();
    s.members.get(t2).communicationDisabledUntilTimestamp += 1000;
    await assert.rejects(() => s.confirm(p.id), /bulkTimeoutBlocked/);
    assert.equal(s.calls.length, 0);
    s.db.prepare('UPDATE bulk_timeout_plans SET created_at=?').run(Date.now() - 121000);
    await assert.rejects(() => s.confirm(p.id), /bulkTimeoutBlocked/);
    await assert.rejects(
      () => confirmBulkTimeout(s.i, s.c, { id: p.id, confirm: false }),
      /bulkTimeoutConfirm/,
    );
    await assert.rejects(() => previewBulkTimeout(s.i, s.c, [t, t]), /bulkTimeoutInput/);
    await assert.rejects(() => previewBulkTimeout(s.i, s.c, []), /bulkTimeoutInput/);
  } finally {
    s.db.close();
  }
});
test('bulktimeout nativehierarchy bot/admin/missingpermissions/foreign/botmember guards no clears', async () => {
  for (const change of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.members.get(t).user.bot = true),
    (s) => (s.members.get(t).permissions.has = () => true),
    (s) => (s.members.get(t).guild.id = 'foreign'),
    (s) => (s.members.get(t).moderatable = false),
    (s) => (s.i.appPermissions.has = () => false),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => s.preview());
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('bulktimeout partialeffect secondunknown stops no retry persists cases restartexecutingfrozen', async () => {
  const s = setup();
  try {
    const p = await s.preview();
    s.members.get(t2).disableCommunicationUntil = async () => {
      s.calls.push(t2);
      throw Error('network');
    };
    await assert.rejects(() => s.confirm(p.id), /bulkTimeoutBlocked/);
    assert.deepEqual(s.calls, [t, t2]);
    assert.equal(s.c.bulkTimeout.get(p.id, g, u).status, 'uncertain');
    await assert.rejects(() => s.confirm(p.id), /bulkTimeoutBlocked/);
    assert.equal(
      s.db.prepare("SELECT count(*) n FROM moderation_cases WHERE status='uncertain'").get().n,
      1,
    );
    await assert.rejects(() => previewBulkTimeout(s.i, s.c, [t2]), /bulkTimeoutBlocked/);
    s.db.prepare("UPDATE bulk_timeout_plans SET status='executing'").run();
    s.c.bulkTimeout.recover();
    assert.equal(s.c.bulkTimeout.get(p.id, g, u).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('bulktimeout two paths3locale private safeembed metadata exactnativeproof', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        ...s.i,
        options: {
          getSubcommand: () => 'preview',
          getString: () => JSON.stringify([t, t2]),
          getInteger: () => 1,
          getBoolean: () => true,
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, s.c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(JSON.parse(reply.files[0].attachment).rows.length, 2);
      i.options.getSubcommand = () => 'confirm';
      await command.execute(i, s.c);
      assert.equal(JSON.parse(reply.files[0].attachment).completed.length, 2);
    } finally {
      s.db.close();
    }
  }
});
