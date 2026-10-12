import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberList } from '../src/services/memberLists.js';
import command from '../src/commands/utility/list.js';
import { PermissionFlagsBits as P } from 'discord.js';
const g = '100000000000000001',
  actorId = '100000000000000002';
function setup() {
  const rows = new Map(
    Array.from({ length: 12 }, (_, n) => {
      const id = String(200000000000000000n + BigInt(n));
      return [
        id,
        {
          id,
          guild: { id: g },
          user: { id, username: 'U' + n, bot: n % 2 === 0 },
          permissions: { has: (p) => p === P.Administrator && n < 2 },
          premiumSinceTimestamp: n < 3 ? 1000 : null,
        },
      ];
    }),
  );
  const actor = { id: actorId, guild: { id: g }, permissions: { has: () => true } },
    calls = [];
  const i = {
    guildId: g,
    guild: {
      id: g,
      available: true,
      members: {
        fetch: async (opts) => {
          calls.push(opts);
          return opts.user ? actor : rows;
        },
      },
    },
    user: { id: actorId },
    client: { isReady: () => true },
  };
  const c = {
    config: { memberEventsEnabled: true },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return { i, c, rows, actor, calls };
}
test('reference memberlists exact snapshot filters IDs deterministic10page no presences cachedfallback', async () => {
  const s = setup();
  for (const [kind, count] of [
    ['admins', 2],
    ['bots', 6],
    ['boosters', 3],
  ]) {
    const result = await memberList(s.i, s.c, { kind });
    assert.equal(result.count, count);
    assert.equal(result.records.length, count);
    assert.deepEqual(Object.keys(result.records[0]), ['id', 'username']);
  }
  assert.deepEqual(s.calls[1], { query: '', limit: 0, withPresences: false, time: 15000 });
  for (const row of s.rows.values()) row.user.bot = true;
  assert.equal((await memberList(s.i, s.c, { kind: 'bots', page: 2 })).records.length, 2);
  await assert.rejects(() => memberList(s.i, s.c, { kind: 'bots', page: 3 }), /listPageInvalid/);
});
test('memberlists runtime manager allrowidentity validation beforefilter no inferred fields', async () => {
  for (const mutate of [
    (s) => (s.c.config.memberEventsEnabled = false),
    (s) => (s.i.client.isReady = () => false),
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.actor.guild.id = 'other'),
    (s) => ([...s.rows.values()][11].guild.id = 'other'),
    (s) => ([...s.rows.values()][11].premiumSinceTimestamp = undefined),
    (s) => ([...s.rows.values()][11].user.bot = undefined),
    (s) => ([...s.rows.values()][11].user.username = 'x\n'),
  ]) {
    const s = setup();
    mutate(s);
    await assert.rejects(() => memberList(s.i, s.c, { kind: 'admins' }));
  }
  const s = setup();
  for (const row of s.rows.values()) row.permissions.has = () => false;
  assert.equal((await memberList(s.i, s.c, { kind: 'admins' })).count, 0);
});
test('memberlists authoritylost during fullsnapshot refuses result nativefetcherror no fallback', async () => {
  const s = setup(),
    fetch = s.i.guild.members.fetch;
  s.i.guild.members.fetch = async (opts) => {
    const result = await fetch(opts);
    if (!opts.user) s.actor.permissions.has = () => false;
    return result;
  };
  await assert.rejects(() => memberList(s.i, s.c, { kind: 'bots' }), /userPermission/);
  const bad = setup();
  bad.i.guild.members.fetch = async (opts) => {
    if (!opts.user) throw Error('gateway');
    return bad.actor;
  };
  await assert.rejects(() => memberList(bad.i, bad.c, { kind: 'bots' }), /gateway/);
});
test('3reference memberlistpaths private3locale escaped names noping no member persistence', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const kind of ['admins', 'bots', 'boosters']) {
      const s = setup();
      let deferred, reply;
      s.c.guildConfig.get = () => ({ language });
      s.i.options = { getSubcommand: () => kind, getInteger: () => null };
      s.i.deferReply = async (p) => (deferred = p);
      s.i.editReply = async (p) => (reply = p);
      [...s.rows.values()][0].user.username = '*hello*';
      await command.execute(s.i, s.c);
      assert.equal(deferred.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.includes('\\*hello\\*'));
      assert(!reply.embeds[0].data.description.includes('<@'));
    }
});
