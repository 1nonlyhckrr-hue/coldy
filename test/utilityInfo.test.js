import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/services/localization.js';
import roleinfo from '../src/commands/utility/roleinfo.js';
import banner from '../src/commands/utility/banner.js';
import boostcount from '../src/commands/utility/boostcount.js';
function setup(locale = 'en') {
  const replies = [],
    user = {
      id: '100000000000000001',
      bannerURL: (options) => {
        assert.equal(options.size, 1024);
        return 'https://cdn.discordapp.com/banner.png';
      },
    },
    role = {
      id: '100000000000000002',
      guild: { id: 'g' },
      name: '<@everyone>',
      hexColor: '#ffffff',
      position: 2,
      managed: false,
      permissions: { toArray: () => ['ViewChannel', 'SendMessages'] },
    },
    guild = { id: 'g', premiumSubscriptionCount: 4, premiumTier: 1 },
    i = {
      guildId: 'g',
      user,
      options: { getRole: () => role, getUser: () => user },
      guild: {
        roles: {
          fetch: async (id, o) => {
            assert.equal(o.force, true);
            assert.equal(id, role.id);
            return role;
          },
        },
      },
      client: {
        users: {
          fetch: async (id, o) => {
            assert.equal(o.force, true);
            assert.equal(id, user.id);
            return user;
          },
        },
        guilds: {
          fetch: async (o) => {
            assert.equal(o.force, true);
            assert.equal(o.guild, 'g');
            return guild;
          },
        },
      },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
    },
    c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
  return { i, c, replies, user, role, guild };
}
test('three current utility paths force fresh reads and render no-ping private localized embeds', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    for (const command of [roleinfo, banner, boostcount]) await command.execute(s.i, s.c);
    assert.equal(s.replies.length, 3);
    for (const p of s.replies) assert.deepEqual(p.allowedMentions.parse, []);
    assert.match(s.replies[0].embeds[0].data.description, /SendMessages, ViewChannel/);
    assert.match(s.replies[1].embeds[0].data.description, /https:\/\/cdn.discordapp.com/);
    assert.match(s.replies[2].embeds[0].data.description, /4/);
  }
});
test('missing banner gets explicit localized absent state not a guessed URL', async () => {
  const s = setup('hi');
  s.user.bannerURL = () => null;
  await banner.execute(s.i, s.c);
  assert.equal(
    s.replies[0].embeds[0].data.description,
    translate('hi', 'bannerMissing', { id: s.user.id }),
  );
});
test('foreign/wrong native identities and unverifiable boost values fail before replies', async () => {
  for (const change of [
    (s) => (s.role.guild.id = 'other'),
    (s) => (s.i.guild.roles.fetch = async () => null),
    (s) => (s.i.client.users.fetch = async () => ({ id: 'other' })),
    (s) => (s.guild.id = 'other'),
    (s) => (s.guild.premiumSubscriptionCount = null),
  ]) {
    const s = setup();
    change(s);
    const command =
      s.role.guild.id === 'other' || s.i.guild.roles.fetch.toString().includes('null')
        ? roleinfo
        : s.i.client.users.fetch.toString().includes('other')
          ? banner
          : boostcount;
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
  }
});
test('native lookup failure does not fallback to stale interaction values', async () => {
  for (const command of [roleinfo, banner, boostcount]) {
    const s = setup();
    s.i.guild.roles.fetch = async () => {
      throw new Error('unavailable');
    };
    s.i.client.users.fetch = s.i.guild.roles.fetch;
    s.i.client.guilds.fetch = s.i.guild.roles.fetch;
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
  }
});
