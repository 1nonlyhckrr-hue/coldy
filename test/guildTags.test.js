import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { GuildTags, guildTagState, refreshGuildTag } from '../src/services/guildTags.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/vanityroles/guildtag.js';
import { translate } from '../src/services/localization.js';
import { PermissionFlagsBits as P } from 'discord.js';
const ids = { user: '100000000000000001', role: '100000000000000002', owner: '100000000000000003' };
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    guildTags = new GuildTags(db),
    user = { id: ids.user, primaryGuild: { identityGuildId: 'g', identityEnabled: true } },
    member = {
      id: ids.user,
      permissions: { has: () => true },
      roles: {
        highest: { comparePositionTo: () => 5 },
        cache: new Set(),
        add: async (r) => calls.push(['add', r.id]),
        remove: async (r) => calls.push(['remove', r.id]),
      },
    },
    bot = { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 5 } } },
    role = { id: ids.role, guild: { id: 'g' }, managed: false, permissions: { has: () => false } },
    i = {
      id: 'i1',
      user: { id: ids.user },
      guildId: 'g',
      appPermissions: { has: () => true },
      client: { users: { fetch: async () => user } },
      guild: {
        id: 'g',
        ownerId: ids.owner,
        members: { fetch: async () => member, fetchMe: async () => bot },
        roles: { fetch: async () => role },
      },
    },
    c = {
      guildTags,
      cases: new ModerationCases(db),
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
  guildTags.setup('g', ids.role);
  return { db, c, i, user, member, bot, role, calls };
}
test('primary guild identity is exact ID, tri-state unknown fails safe', () => {
  assert.equal(
    guildTagState({ primaryGuild: { identityGuildId: 'g', identityEnabled: true } }, 'g'),
    'matching',
  );
  for (const identity of [
    null,
    { identityGuildId: null, identityEnabled: true },
    { identityGuildId: 'g', identityEnabled: null },
    {},
  ])
    assert.equal(guildTagState({ primaryGuild: identity }, 'g'), 'unknown');
  assert.equal(
    guildTagState({ primaryGuild: { identityGuildId: 'other', identityEnabled: true } }, 'g'),
    'notMatching',
  );
  assert.equal(
    guildTagState({ primaryGuild: { identityGuildId: 'g', identityEnabled: false } }, 'g'),
    'notMatching',
  );
});
test('grant then verified tag change removes only Luna-owned role', async () => {
  const s = setup();
  try {
    assert.equal(await refreshGuildTag(s.i, s.c), 'claimed');
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'granted');
    s.member.roles.cache.add(ids.role);
    s.user.primaryGuild.identityEnabled = false;
    s.i.id = 'release';
    assert.equal(await refreshGuildTag(s.i, s.c), 'released');
    assert.equal(s.calls[1][0], 'remove');
    assert.equal(s.c.guildTags.grant('g', ids.user), undefined);
  } finally {
    s.db.close();
  }
});
test('preexisting independent role never becomes owned or revoked', async () => {
  const s = setup();
  try {
    s.member.roles.cache.add(ids.role);
    assert.equal(await refreshGuildTag(s.i, s.c), 'already');
    assert.equal(s.c.guildTags.grant('g', ids.user), undefined);
    s.user.primaryGuild.identityEnabled = false;
    assert.equal(await refreshGuildTag(s.i, s.c), 'notMatching');
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('unknown identity, dangerous role edits, app permission loss and config race refuse changes', async () => {
  for (const change of [
    (s) => (s.user.primaryGuild = null),
    (s) => (s.role.permissions.has = (p) => p === P.Administrator),
    (s) => (s.i.appPermissions.has = () => false),
    (s) =>
      (s.i.client.users.fetch = async () => {
        s.c.guildTags.reset('g');
        return s.user;
      }),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => refreshGuildTag(s.i, s.c));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('uncertain grant/restart recovery blocks repeats, retains grant record', async () => {
  const s = setup();
  let n = 0;
  s.member.roles.add = async () => {
    n++;
    throw new Error('SECRET');
  };
  try {
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUncertain/);
    s.i.id = 'new';
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUncertain/);
    assert.equal(n, 1);
    assert.equal(s.c.guildTags.active.size, 0);
    s.c.guildTags.db.prepare("UPDATE guild_tag_grants SET status='pending'").run();
    s.c.guildTags.recover();
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('guildtag config refuses silent role migration; reset never revokes grants', async () => {
  const s = setup();
  try {
    await refreshGuildTag(s.i, s.c);
    assert.throws(() => s.c.guildTags.setup('g', '100000000000000009'), /tagRoleChangeBlocked/);
    s.c.guildTags.reset('g');
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'granted');
    s.c.guildTags.setup('g', '100000000000000009');
    s.role.id = '100000000000000009';
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagOldRole/);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('database gate, duplicate interaction and mutex prevent repeat effects', async () => {
  const s = setup();
  try {
    await refreshGuildTag(s.i, s.c);
    await assert.rejects(() => refreshGuildTag(s.i, s.c));
    assert.equal(s.calls.length, 1);
    s.c.guildTags.active.add(`g:${ids.user}`);
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /roleActionBusy/);
  } finally {
    s.db.close();
  }
});
test('four guildtag paths execute private localized replies and config authorization', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    s.i.deferReply = async () => {};
    s.i.editReply = async (p) => replies.push(p);
    let sub = 'setup';
    s.i.options = { getSubcommand: () => sub, getRole: () => s.role };
    try {
      for (const action of ['setup', 'show', 'refresh', 'reset']) {
        sub = action;
        await command.execute(s.i, s.c);
      }
      assert.equal(replies.length, 4);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
      sub = 'setup';
      s.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    } finally {
      s.db.close();
    }
  }
});
