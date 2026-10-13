import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { Guard, createGuardHandler } from '../src/services/guard.js';
const G = '111111111111111111',
  OWNER = '222222222222222222',
  BAD = '333333333333333333',
  TRUSTED = '444444444444444444',
  CH = '555555555555555555',
  HOOK = '666666666666666666';
let n = 0;
function setup({ hook = true, perm = true } = {}) {
  const db = openDatabase(':memory:'),
    sent = [],
    deleted = [];
  const guard = new Guard(db);
  const channel = {
    id: CH,
    guildId: G,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    send: async (p) => sent.push(p.content ?? p.embeds?.[0]?.data?.description),
  };
  const guild = {
    id: G,
    ownerId: OWNER,
    client: { user: { id: 'bot' } },
    channels: { fetch: async () => channel },
    members: {
      fetchMe: async () => ({ id: 'bot', guild: { id: G }, permissions: { has: () => perm } }),
    },
    fetchWebhooks: async () =>
      new Map(hook ? [[HOOK, { delete: async () => deleted.push(HOOK) }]] : []),
  };
  const c = {
    config: { auditEventsEnabled: true, ownerIds: [] },
    guard,
    antinuke: { get: () => ({ channelId: CH, trustedUsers: [TRUSTED] }) },
    securityAccess: { delegated: () => false },
    localization: { locale: () => 'en', t: (g, k, p) => k + (p ? JSON.stringify(p) : '') },
  };
  return { db, c, guild, sent, deleted, channel };
}
const entry = (executorId, action = AuditLogEvent.WebhookCreate, extra = {}) => ({
  id: String(700000000000000000n + BigInt(++n)),
  action,
  executorId,
  targetId: HOOK,
  createdTimestamp: Date.now(),
  ...extra,
});
test('all guards are off by default', () => {
  const db = openDatabase(':memory:');
  try {
    assert.equal(new Guard(db).get(G).webhook.mode, 'off');
  } finally {
    db.close();
  }
});
test('webhook: off does nothing; alert only reports; delete removes and reports; trusted are ignored', async () => {
  const f = setup();
  try {
    const run = (e) => createGuardHandler(f.c)(e, f.guild);
    await run(entry(BAD));
    assert.equal(f.sent.length, 0);
    f.c.guard.patch(G, { webhook: { mode: 'alert' } });
    await run(entry(TRUSTED));
    await run(entry(OWNER));
    assert.equal(f.deleted.length, 0);
    assert.equal(f.sent.length, 0);
    await run(entry(BAD, AuditLogEvent.ChannelCreate));
    assert.equal(f.sent.length, 0);
    await run(entry(BAD));
    assert.match(f.sent[0], /guardWebhook_alerted/);
    assert.equal(f.deleted.length, 0);
  } finally {
    f.db.close();
  }
});
test('webhook delete mode deletes once per audit entry', async () => {
  const f = setup();
  try {
    f.c.guard.patch(G, { webhook: { mode: 'delete' } });
    const e = entry(BAD);
    await createGuardHandler(f.c)(e, f.guild);
    await createGuardHandler(f.c)(e, f.guild);
    assert.equal(f.deleted.length, 1);
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0], /guardWebhook_deleted/);
  } finally {
    f.db.close();
  }
});
test('stale entries and disabled audit runtime are ignored', async () => {
  const f = setup();
  try {
    f.c.guard.patch(G, { webhook: { mode: 'delete' } });
    await createGuardHandler(f.c)(
      entry(BAD, AuditLogEvent.WebhookCreate, { createdTimestamp: Date.now() - 3600000 }),
      f.guild,
    );
    f.c.config.auditEventsEnabled = false;
    await createGuardHandler(f.c)(entry(BAD), f.guild);
    assert.equal(f.deleted.length, 0);
  } finally {
    f.db.close();
  }
});
const permEntry = (executorId, oldP, newP, action = AuditLogEvent.RoleUpdate) =>
  entry(executorId, action, {
    targetId: '777777777777777777',
    changes: [{ key: 'permissions', old: String(oldP), new: String(newP) }],
  });
test('permalert: only newly added dangerous bits trigger; strip removes them', async () => {
  const { PermissionFlagsBits: P, PermissionsBitField } = await import('discord.js');
  const f = setup();
  try {
    const roleCalls = [];
    f.guild.roles = {
      fetch: async () => ({
        managed: false,
        position: 1,
        permissions: new PermissionsBitField(P.Administrator | P.SendMessages),
        setPermissions: async (p) => roleCalls.push(p.bitfield),
      }),
    };
    f.guild.members.fetchMe = async () => ({
      id: 'bot',
      guild: { id: G },
      permissions: { has: () => true },
      roles: { highest: { position: 5 } },
    });
    const run = (e) => createGuardHandler(f.c)(e, f.guild);
    await run(permEntry(BAD, 0, P.Administrator));
    assert.equal(f.sent.length, 0);
    f.c.guard.patch(G, { permAlert: { mode: 'alert' } });
    await run(permEntry(BAD, P.Administrator, P.Administrator | P.SendMessages));
    await run(permEntry(BAD, 0, P.SendMessages));
    assert.equal(f.sent.length, 0);
    await run(permEntry(BAD, P.SendMessages, P.SendMessages | P.BanMembers));
    assert.match(f.sent[0], /guardPerm_alerted.*BanMembers/);
    assert.equal(roleCalls.length, 0);
    f.c.guard.patch(G, { permAlert: { mode: 'strip' } });
    await run(permEntry(BAD, 0, P.Administrator, AuditLogEvent.RoleCreate));
    assert.match(f.sent[1], /guardPerm_stripped.*Administrator/);
    assert.equal(roleCalls[0], P.SendMessages);
    await run(permEntry(TRUSTED, 0, P.Administrator));
    assert.equal(f.sent.length, 2);
  } finally {
    f.db.close();
  }
});
