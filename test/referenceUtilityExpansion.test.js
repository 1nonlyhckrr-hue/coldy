import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberList } from '../src/services/memberLists.js';
import { banList } from '../src/services/banLists.js';
import list from '../src/commands/utility/list.js';
import enlarge from '../src/commands/utility/enlarge.js';
const g = '100000000000000001',
  actorId = '100000000000000002',
  botId = '100000000000000003',
  roleId = '100000000000000004';
function setup(n = 2) {
  const actor = { id: actorId, guild: { id: g }, permissions: { has: () => true } },
    bot = { id: botId, guild: { id: g }, permissions: { has: () => true } },
    rows = new Map(
      Array.from({ length: n }, (_, n) => {
        const id = String(200000000000000000n + BigInt(n));
        return [
          id,
          {
            guild: { id: g },
            id,
            user: { id, username: '*U' + n + '*', bot: false },
            premiumSinceTimestamp: null,
            permissions: { has: () => false },
            roles: { cache: { has: (id) => id === roleId && n % 2 === 0 } },
          },
        ];
      }),
    ),
    bans = new Map(
      [...rows].map(([id, r]) => [id, { guild: { id: g }, user: r.user, reason: 'DO_NOT_EXPOSE' }]),
    ),
    calls = [];
  const i = {
    guildId: g,
    user: { id: actorId },
    client: { isReady: () => true, user: { id: botId } },
    appPermissions: { has: () => true },
    guild: {
      id: g,
      available: true,
      roles: { fetch: async () => ({ id: roleId, guild: { id: g } }) },
      members: { fetch: async (opts) => (opts.user ? actor : rows), fetchMe: async () => bot },
      bans: {
        fetch: async (opts) => {
          calls.push(opts);
          return bans;
        },
      },
    },
  };
  const c = {
    config: { memberEventsEnabled: true },
    guildConfig: { get: () => ({ language: 'en' }) },
  };
  return { actor, bot, rows, bans, calls, i, c };
}
test('reference inrole exact currentrole fullsnapshot filter strict missingrolecache no foreignrole', async () => {
  const s = setup(12);
  assert.equal((await memberList(s.i, s.c, { kind: 'inrole', roleId })).count, 6);
  s.i.guild.roles.fetch = async () => ({ id: roleId, guild: { id: 'other' } });
  await assert.rejects(
    () => memberList(s.i, s.c, { kind: 'inrole', roleId }),
    /listIdentityInvalid/,
  );
  const bad = setup();
  [...bad.rows.values()][1].roles = {};
  await assert.rejects(
    () => memberList(bad.i, bad.c, { kind: 'inrole', roleId }),
    /listIdentityInvalid/,
  );
});
test('reference bans bounded100fresh cursor projection no reasons totalclaim and strictauthority', async () => {
  const s = setup(100),
    r = await banList(s.i);
  assert.equal(r.records.length, 100);
  assert.equal(r.nextAfter, '200000000000000099');
  assert.deepEqual(s.calls[0], { limit: 100, cache: false });
  assert(!JSON.stringify(r).includes('DO_NOT_EXPOSE'));
  for (const mutate of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.i.appPermissions.has = () => false),
    (s) => ([...s.bans.values()][0].guild.id = 'other'),
    (s) => ([...s.bans.values()][0].user.username = 'x\n'),
  ]) {
    const b = setup();
    mutate(b);
    await assert.rejects(() => banList(b.i));
  }
  await assert.rejects(() => banList(setup().i, { after: 'bad' }), /listIdentityInvalid/);
  await assert.rejects(
    () => banList(setup().i, { after: '200000000000000000' }),
    /listIdentityInvalid/,
  );
});
test('reference banlist lostauthority afterfetch refuses all disclosure no cache fallback', async () => {
  const s = setup();
  s.i.guild.bans.fetch = async () => {
    s.actor.permissions.has = () => false;
    return s.bans;
  };
  await assert.rejects(() => banList(s.i), /userPermission/);
  const b = setup();
  b.i.guild.bans.fetch = async () => {
    throw Error('provider');
  };
  await assert.rejects(() => banList(b.i), /provider/);
  assert.equal((await banList(setup(0).i)).nextAfter, null);
});
test('reference 2listpaths private3locale inrole escaped bansfirst10 plus exact100JSONno reasons', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['inrole', 'bans']) {
      const s = setup(100);
      let deferred, reply;
      s.c.guildConfig.get = () => ({ language });
      s.i.options = {
        getSubcommand: () => sub,
        getInteger: () => null,
        getRole: () => ({ id: roleId }),
        getString: () => null,
      };
      s.i.deferReply = async (p) => (deferred = p);
      s.i.editReply = async (p) => (reply = p);
      await list.execute(s.i, s.c);
      assert.equal(deferred.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.includes('\\*U0\\*'));
      assert(!JSON.stringify(reply).includes('DO_NOT_EXPOSE'));
      if (sub === 'bans')
        assert.equal(JSON.parse(reply.files[0].attachment.toString()).records.length, 100);
    }
});
test('reference enlarge highresolution nativeemoji3locale exactCDNidentity no foreignemoji or unicode guess', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const animated of [false, true]) {
      const s = setup();
      let reply, request;
      s.c.guildConfig.get = () => ({ language });
      s.i.options = { getString: () => roleId };
      s.i.guild.emojis = {
        fetch: async () => ({
          id: roleId,
          guild: { id: g },
          animated,
          imageURL: (opts) => {
            request = opts;
            return (
              'https://cdn.discordapp.com/emojis/' +
              roleId +
              (animated ? '.gif' : '.png') +
              '?size=4096'
            );
          },
        }),
      };
      s.i.reply = async (p) => (reply = p);
      await enlarge.execute(s.i, s.c);
      assert.deepEqual(request, { extension: animated ? 'gif' : 'png', size: 4096 });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.image.url.includes(roleId));
      s.i.guild.emojis.fetch = async () => ({
        id: roleId,
        guild: { id: g },
        animated,
        imageURL: () => 'https://cdn.discordapp.com.evil.invalid/emojis/' + roleId + '.png',
      });
      await assert.rejects(() => enlarge.execute(s.i, s.c), /emojiInfoInvalid/);
    }
});
