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
      id: 'b',
      guild: { id: 'g' },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 5 } },
    },
    role = { id: ids.role, guild: { id: 'g' }, managed: false, permissions: { has: () => false } },
    i = {
      id: 'i1',
      user: { id: ids.user },
      guildId: 'g',
      appPermissions: { has: () => true },
      client: { user: { id: 'b' }, users: { fetch: async () => user } },
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
test('grant then verified tag change removes only Emika-owned role', async () => {
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

test('guildtag refresh rejects exact identity mismatches without role effects or grant reservations', async () => {
  for (const change of [
    (s) => (s.member.guild.id = 'other'),
    (s) => (s.i.guild.id = 'other'),
    (s) => (s.bot.id = 'other'),
    (s) => (s.bot.guild.id = 'other'),
    (s) => delete s.i.client.user,
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => refreshGuildTag(s.i, s.c));
      assert.equal(s.calls.length, 0);
      assert.equal(s.c.guildTags.grant('g', ids.user), undefined);
      assert.equal(s.c.guildTags.active.size, 0);
    } finally {
      s.db.close();
    }
  }
});
test('guildtag setup forces exact role and rechecks caller after lookup;reset verifies exact admin', async () => {
  for (const kind of ['role', 'permission', 'member', 'bot', 'reset']) {
    const s = setup();
    try {
      let sub = kind === 'reset' ? 'reset' : 'setup';
      s.i.deferReply = async () => {};
      s.i.editReply = async () => {};
      s.i.options = { getSubcommand: () => sub, getRole: () => ({ id: ids.role }) };
      s.c.guildTags.reset('g');
      if (kind === 'reset') s.c.guildTags.setup('g', ids.role);
      if (kind === 'member' || kind === 'reset') s.member.id = 'other';
      if (kind === 'bot') s.bot.id = 'other';
      s.i.guild.roles.fetch = async (id, o) => {
        assert.equal(id, ids.role);
        assert.deepEqual(o, { force: true });
        if (kind === 'permission') s.member.permissions.has = () => false;
        return kind === 'role' ? { ...s.role, id: 'other' } : s.role;
      };
      await assert.rejects(() => command.execute(s.i, s.c));
      assert.equal(s.c.guildTags.config('g')?.role_id, kind === 'reset' ? ids.role : undefined);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('tag finish requires one pending grant and never rewrites completed/uncertain/foreign records', () => {
  const s = setup();
  try {
    assert.throws(() => s.c.guildTags.finish('g', ids.user, 'granted'), /not pending/);
    s.c.guildTags.reserve('g', ids.user, ids.role);
    assert.throws(() => s.c.guildTags.finish('other', ids.user, 'granted'), /not pending/);
    s.c.guildTags.finish('g', ids.user, 'granted');
    assert.throws(() => s.c.guildTags.finish('g', ids.user, 'uncertain'), /not pending/);
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'granted');
    s.c.guildTags.reserve('g', ids.user, ids.role);
    s.c.guildTags.finish('g', ids.user, 'uncertain');
    assert.throws(() => s.c.guildTags.finish('g', ids.user, 'granted'), /not pending/);
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('accepted tag role add with failed completion remains unresolved and cannot repeat', async () => {
  const s = setup();
  try {
    s.c.guildTags.finish = () => {
      throw Error('storage');
    };
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUncertain/);
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'pending');
    s.i.id = 'new';
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUncertain/);
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.guildTags.active.size, 0);
    s.c.guildTags.recover();
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'uncertain');
  } finally {
    s.db.close();
  }
});

test('guildtag own status is private/localized stored-only without live lookups or mutation', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const status of ['none', 'pending', 'granted', 'uncertain']) {
      const s = setup();
      try {
        if (status !== 'none') {
          s.c.guildTags.reserve('g', ids.user, ids.role);
          if (status !== 'pending') s.c.guildTags.finish('g', ids.user, status);
        }
        const before = s.c.guildTags.grant('g', ids.user),
          replies = [];
        s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
        s.i.options = { getSubcommand: () => 'status' };
        s.i.deferReply = async (p) => assert.equal(p.flags, 64);
        s.i.editReply = async (p) => replies.push(p);
        s.i.guild.members.fetch =
          s.i.guild.members.fetchMe =
          s.i.guild.roles.fetch =
          s.i.client.users.fetch =
            async () => {
              throw Error('no native lookup');
            };
        await command.execute(s.i, s.c);
        assert.deepEqual(s.c.guildTags.grant('g', ids.user), before);
        assert.equal(s.calls.length, 0);
        assert.deepEqual(replies[0].allowedMentions.parse, []);
        assert(
          replies[0].embeds[0].data.description.includes(
            translate(locale, status === 'none' ? 'tagOwnNone' : 'tagStored_' + status),
          ),
        );
      } finally {
        s.db.close();
      }
    }
});

test('enabled identity with absent or malformed guild ID is unknown,not revocation evidence', () => {
  for (const identityGuildId of [undefined, null, '', 0, false, {}])
    assert.equal(
      guildTagState({ primaryGuild: { identityEnabled: true, identityGuildId } }, 'g'),
      'unknown',
    );
});
test('malformed primary guild does not revoke tracked reward or clear grant', async () => {
  const s = setup();
  try {
    await refreshGuildTag(s.i, s.c);
    s.member.roles.cache.add(ids.role);
    s.i.id = 'next';
    delete s.user.primaryGuild.identityGuildId;
    await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUnavailable/);
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'granted');
    assert.equal(s.c.guildTags.active.size, 0);
  } finally {
    s.db.close();
  }
});

test('stored grant pagination filters before paging with exact guild scope ordered IDs and no mutation', () => {
  const s = setup();
  try {
    const q = s.db.prepare('INSERT INTO guild_tag_grants VALUES(?,?,?,?)');
    for (let n = 0; n < 25; n++)
      q.run(
        'g',
        String(100000000000000100n + BigInt(n)),
        ids.role,
        n % 2 ? 'granted' : 'uncertain',
      );
    q.run('foreign', ids.user, ids.role, 'uncertain');
    const rows = s.c.guildTags.grants('g', 1, { state: 'uncertain' }),
      last = s.c.guildTags.grants('g', 2, { state: 'uncertain' });
    assert.equal(rows.length, 10);
    assert.equal(last.length, 3);
    assert(rows.every((r) => r.status === 'uncertain'));
    assert.equal(rows[0].user_id, '100000000000000100');
    assert.equal(s.db.prepare('SELECT count(*) n FROM guild_tag_grants').get().n, 26);
    assert.deepEqual(s.c.guildTags.grants('empty'), []);
    for (const p of [0, -1, 1.5, '1', 1001])
      assert.throws(() => s.c.guildTags.grants('g', p), /tagGrantPageInvalid/);
    for (const state of ['bad', 0, false])
      assert.throws(() => s.c.guildTags.grants('g', 1, { state }), /tagGrantStateInvalid/);
  } finally {
    s.db.close();
  }
});
test('manager grant inspection private localized no-ping metadata no native role lookup/effect or state promotion', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildTags.reserve('g', ids.user, ids.role);
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      const replies = [];
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => replies.push(p);
      s.i.options = {
        getSubcommand: () => 'grants',
        getInteger: () => 1,
        getString: () => 'pending',
      };
      s.i.guild.roles.fetch = async () => {
        throw Error('No native role read');
      };
      await command.execute(s.i, s.c);
      assert(replies[0].embeds[0].data.description.includes(ids.user));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(s.c.guildTags.grant('g', ids.user).status, 'pending');
      assert.equal(s.calls.length, 0);
      s.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
      assert.equal(replies.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('guild grant inspection rejects exact manager identity/guild mismatch before storage read', async () => {
  for (const foreign of [false, true]) {
    const s = setup();
    try {
      s.i.deferReply = async () => {};
      s.i.options = { getSubcommand: () => 'grants' };
      s.i.guild.members.fetch = async () => ({
        ...s.member,
        id: foreign ? ids.user : ids.owner,
        guild: { id: foreign ? 'other' : 'g' },
      });
      s.c.guildTags.grants = () => {
        throw Error('Storage should not be read');
      };
      await assert.rejects(() => command.execute(s.i, s.c), /roleActorPermission/);
    } finally {
      s.db.close();
    }
  }
});

test('guild tag refresh uses final current identity after role lookup and never grants stale matching identity', async () => {
  for (const identity of [{ identityGuildId: 'other', identityEnabled: true }, null]) {
    const s = setup();
    try {
      let changed = false;
      s.i.guild.roles.fetch = async () => {
        changed = true;
        return s.role;
      };
      s.i.client.users.fetch = async () =>
        changed ? { id: ids.user, primaryGuild: identity } : { ...s.user };
      if (identity) assert.equal(await refreshGuildTag(s.i, s.c), 'notMatching');
      else await assert.rejects(() => refreshGuildTag(s.i, s.c), /tagUnavailable/);
      assert.equal(s.calls.length, 0);
      assert.equal(s.c.guildTags.grant('g', ids.user), undefined);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('guildtag final bot or member refresh refuses revoked permissions/foreign principal after role fetch before receipt/effect', async () => {
  for (const kind of ['botpermission', 'botid', 'botguild', 'memberid', 'memberguild', 'userid']) {
    const s = setup();
    try {
      let changed = false;
      s.i.guild.roles.fetch = async () => {
        changed = true;
        return s.role;
      };
      s.i.guild.members.fetchMe = async () =>
        changed
          ? {
              ...s.bot,
              id: kind === 'botid' ? 'wrong' : s.bot.id,
              guild: { id: kind === 'botguild' ? 'other' : 'g' },
              permissions: { has: () => kind !== 'botpermission' },
            }
          : s.bot;
      s.i.guild.members.fetch = async () =>
        changed
          ? {
              ...s.member,
              id: kind === 'memberid' ? 'wrong' : ids.user,
              guild: { id: kind === 'memberguild' ? 'other' : 'g' },
            }
          : s.member;
      s.i.client.users.fetch = async () =>
        changed && kind === 'userid' ? { ...s.user, id: 'wrong' } : s.user;
      await assert.rejects(() => refreshGuildTag(s.i, s.c));
      assert.equal(s.calls.length, 0);
      assert.equal(s.c.guildTags.grant('g', ids.user), undefined);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('guildtag final identity prevents stale removal of previously tracked native reward when matching identity returns', async () => {
  const s = setup();
  try {
    await refreshGuildTag(s.i, s.c);
    s.i.id = 'second';
    s.member.roles.cache.add(ids.role);
    let changed = false;
    s.i.guild.roles.fetch = async () => {
      changed = true;
      return s.role;
    };
    s.i.client.users.fetch = async () =>
      changed
        ? s.user
        : { id: ids.user, primaryGuild: { identityGuildId: 'other', identityEnabled: true } };
    assert.equal(await refreshGuildTag(s.i, s.c), 'already');
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.guildTags.grant('g', ids.user).status, 'granted');
  } finally {
    s.db.close();
  }
});
