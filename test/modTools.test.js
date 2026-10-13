import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { ModerationCases } from '../src/services/moderation.js';
import {
  banMany,
  freezeMember,
  unfreezeMember,
  dehoistName,
  dehoist,
  roleAll,
  planPurge,
  runPurge,
  blocked,
  voiceKick,
} from '../src/services/modTools.js';
import command from '../src/commands/moderation/modtools.js';
const G = '111111111111111111',
  U = '222222222222222222',
  A = '333333333333333333',
  B1 = '444444444444444444',
  B2 = '555555555555555555',
  B3 = '666666666666666666',
  BOT = '777777777777777777';
const pos = (n) => ({ comparePositionTo: (o) => n - o.n, n, position: n });
const bot = { id: BOT, roles: { highest: pos(10) }, permissions: { has: () => true } };
const actor = { id: A, roles: { highest: pos(8) } };
const mem = (id, n = 1, extra = {}) => ({
  id,
  user: { bot: false },
  roles: { highest: pos(n), cache: new Map(), set: async () => {} },
  ...extra,
});
function env(members = {}) {
  const db = openDatabase(':memory:'),
    bans = [],
    unbans = [];
  const guild = {
    id: G,
    ownerId: U,
    roles: { fetch: async () => {}, cache: new Map() },
    members: {
      fetch: async (id) => {
        const m = members[typeof id === 'string' ? id : id.user];
        if (!m) throw new Error('unknown');
        return m;
      },
      ban: async (id, o) => {
        if (id === B3) throw new Error('x');
        bans.push([id, o]);
      },
      unban: async (id) => unbans.push(id),
    },
  };
  const c = {
    toolDelayMs: 0,
    cases: new ModerationCases(db),
    features: new FeatureStore(db),
    antinuke: {},
    config: { ownerIds: [] },
  };
  const i = { guildId: G, id: 'int1', user: { id: A }, guild };
  return { db, c, i, guild, bans, unbans };
}
test('blocked checks owner, self, bot and role hierarchy', () => {
  const g = { ownerId: U };
  assert.equal(blocked(g, bot, actor, mem(U)), 'owner');
  assert.equal(blocked(g, bot, actor, mem(A)), 'self');
  assert.equal(blocked(g, bot, actor, mem(B1, 10)), 'botHierarchy');
  assert.equal(
    blocked({ ownerId: U }, { ...bot, roles: { highest: pos(20) } }, actor, mem(B1, 9)),
    'actorHierarchy',
  );
  assert.equal(
    blocked({ ownerId: U }, { ...bot, roles: { highest: pos(20) } }, actor, mem(B1, 9), {
      checkActor: false,
    }),
    null,
  );
  assert.equal(blocked(g, bot, actor, null), null);
});
test('massban reports per user, bans non-members, skips protected and keeps going on failure', async () => {
  const x = env({ [B1]: mem(B1, 1), [U]: mem(U, 1) });
  const out = await banMany(x.i, x.c, [B1, B2, U, B3], {
    reason: 'raid',
    bot,
    actor,
    checkActor: false,
  });
  assert.deepEqual(
    out.map((r) => [r.id, r.ok, r.why]),
    [
      [B1, true, undefined],
      [B2, true, undefined],
      [U, false, 'owner'],
      [B3, false, 'discord'],
    ],
  );
  assert.equal(x.bans.length, 2);
  const cases = x.c.cases.caseActionCounts(G);
  assert(cases.some((r) => r.action === 'ban' && r.status === 'completed'));
  assert(cases.some((r) => r.action === 'ban' && r.status === 'failed'));
  x.db.close();
});
test('softban bans with message deletion then unbans', async () => {
  const x = env({ [B1]: mem(B1, 1) });
  const [r] = await banMany(x.i, x.c, [B1], {
    reason: 's',
    bot,
    actor,
    checkActor: true,
    soft: true,
  });
  assert.equal(r.ok, true);
  assert.equal(x.bans[0][1].deleteMessageSeconds, 7 * 86400);
  assert.deepEqual(x.unbans, [B1]);
  x.db.close();
});
test('freeze times out, strips removable roles, saves them, and unfreeze restores', async () => {
  const x = env();
  const roles = new Map([
    ['r1', { id: 'r1', managed: false, position: 2 }],
    ['rm', { id: 'rm', managed: true, position: 2 }],
    [G, { id: G, managed: false, position: 0 }],
  ]);
  const sets = [],
    timeouts = [];
  const m = mem(B1, 1, {
    disableCommunicationUntil: async (v) => timeouts.push(v),
  });
  m.roles.cache = roles;
  m.roles.set = async (ids) => sets.push(ids);
  const r = await freezeMember(x.i, x.c, m, bot, 30, 'why');
  assert.deepEqual(sets[0], ['rm']);
  assert.equal(r.removed, 1);
  assert(timeouts[0] > Date.now());
  await assert.rejects(() => freezeMember(x.i, x.c, m, bot, 30, 'why'), { key: 'mtAlreadyFrozen' });
  x.guild.roles.cache.set('r1', roles.get('r1'));
  m.roles.cache = new Map([['rm', roles.get('rm')]]);
  const u = await unfreezeMember(x.i, x.c, m, bot);
  assert.deepEqual(sets[1].sort(), ['r1', 'rm']);
  assert.equal(timeouts[1], null);
  assert.equal(u.restored, 1);
  await assert.rejects(() => unfreezeMember(x.i, x.c, m, bot), { key: 'mtNotFrozen' });
  await assert.rejects(
    () => freezeMember(x.i, x.c, mem(B2, 1, { user: { bot: true } }), bot, 5, 'x'),
    { key: 'mtBlocked_bot' },
  );
  x.db.close();
});
test('dehoist strips leading symbols only', async () => {
  assert.equal(dehoistName('!!Alice'), 'Alice');
  assert.equal(dehoistName('  ..'), 'Dehoisted');
  assert.equal(dehoistName('Alice!'), null);
  assert.equal(dehoistName('Ärger'), null);
  const x = env();
  const names = [];
  const m = (id, nickname, b = false) =>
    mem(id, 1, { nickname, user: { bot: b }, setNickname: async (n) => names.push(n) });
  const r = await dehoist(x.i, x.c, [m(B1, '#Bob'), m(B2, 'Fine'), m(B3, '!bot', true)], bot);
  assert.deepEqual(names, ['Bob']);
  assert.equal(r.changed, 1);
  x.db.close();
});
test('roleall gives the role to humans only, skips holders, refuses dangerous roles and parallel runs', async () => {
  const x = env();
  const role = { id: 'r9', managed: false, position: 2, permissions: { has: () => false } };
  const added = [];
  const human = (id, has) => ({
    id,
    user: { bot: false },
    roles: { cache: new Map(has ? [['r9', role]] : []), add: async () => added.push(id) },
  });
  const robot = {
    id: 'b',
    user: { bot: true },
    roles: { cache: new Map(), add: async () => added.push('b') },
  };
  x.guild.members.fetch = async () =>
    new Map([
      [1, human('h1', false)],
      [2, human('h2', true)],
      [3, robot],
      [4, human('h3', false)],
    ]);
  const r = await roleAll(x.i, x.c, role, bot);
  assert.deepEqual(added, ['h1', 'h3']);
  assert.equal(r.total, 2);
  await assert.rejects(() => roleAll(x.i, x.c, { ...role, managed: true }, bot), {
    key: 'roleInvalid',
  });
  await assert.rejects(() => roleAll(x.i, x.c, { ...role, position: 10 }, bot), {
    key: 'roleBotHierarchy',
  });
  x.db.close();
});
test('filtered purge previews, needs the same actor within 2 minutes, then deletes only matches', async () => {
  const x = env();
  const now = Date.now();
  const msg = (id, uid, isBot, content, extra = {}) => ({
    id,
    author: { id: uid, bot: isBot },
    content,
    createdTimestamp: now - 1000,
    pinned: false,
    system: false,
    ...extra,
  });
  const deleted = [];
  const channel = {
    id: '888888888888888888',
    messages: {
      fetch: async () =>
        new Map([
          [1, msg('m1', B1, false, 'see https://x.io')],
          [2, msg('m2', B1, false, 'hi')],
          [3, msg('m3', B2, true, 'bot says')],
          [4, msg('m4', B1, false, 'https://old', { createdTimestamp: now - 15 * 86400000 })],
          [5, msg('m5', B1, false, 'https://p', { pinned: true })],
        ]),
    },
    bulkDelete: async (ids) => {
      deleted.push(...ids);
      return new Map(ids.map((d) => [d, 1]));
    },
  };
  x.guild.channels = { fetch: async () => channel };
  const p = await planPurge(x.i, x.c, channel, { count: 10, userId: B1, links: true });
  assert.equal(p.count, 1);
  await assert.rejects(() => runPurge({ ...x.i, user: { id: B1 } }, x.c, p.plan), {
    key: 'mtPurgeExpired',
  });
  const p2 = await planPurge(x.i, x.c, channel, { count: 10, bots: true });
  const r = await runPurge(x.i, x.c, p2.plan);
  assert.deepEqual(deleted, ['m3']);
  assert.equal(r.count, 1);
  await assert.rejects(() => runPurge(x.i, x.c, p2.plan), { key: 'mtPurgeExpired' });
  await assert.rejects(() => planPurge(x.i, x.c, channel, { count: 5, userId: BOT }), {
    key: 'mtPurgeNothing',
  });
  x.db.close();
});
test('voicekick needs the member in voice', async () => {
  await assert.rejects(() => voiceKick({ voice: {} }, A), { key: 'mtNotInVoice' });
  let done = false;
  await voiceKick({ voice: { channelId: 'v', disconnect: async () => (done = true) } }, A);
  assert.equal(done, true);
});
test('/modtools gates heavy subcommands to owner/delegate and light ones to Discord permissions', async () => {
  const x = env();
  x.c.securityAccess = { delegated: () => false };
  x.c.localization = { locale: () => 'en', t: (g, k) => k };
  const base = (sub, perms) => ({
    ...x.i,
    memberPermissions: { has: () => perms },
    deferReply: async () => {},
    editReply: async () => {},
    options: {
      getSubcommand: () => sub,
      getString: () => null,
      getBoolean: () => true,
      getUser: () => null,
      getInteger: () => null,
    },
  });
  for (const sub of ['freeze', 'unfreeze', 'massban', 'roleall'])
    await assert.rejects(
      () => command.execute(base(sub, true), x.c),
      { key: 'securityDenied' },
      sub,
    );
  for (const sub of ['quarantine', 'hackban', 'voicekick', 'dehoist', 'purge'])
    await assert.rejects(
      () => command.execute(base(sub, false), x.c),
      { key: 'userPermission' },
      sub,
    );
  x.db.close();
});
