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

test('membercount fetches current approximate counts with no enumeration across locales', async () => {
  const { default: command } = await import('../src/commands/utility/membercount.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    let fetches = 0;
    s.i.client.guilds.fetch = async (o) => {
      fetches++;
      assert.deepEqual(o, { guild: 'g', force: true, withCounts: true });
      return { id: 'g', approximateMemberCount: 12, approximatePresenceCount: 0 };
    };
    await command.execute(s.i, s.c);
    assert.equal(fetches, 1);
    assert.equal(s.replies.length, 1);
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    assert.match(s.replies[0].embeds[0].data.description, /12/);
    assert.match(s.replies[0].embeds[0].data.description, /0/);
  }
});
test('membercount refuses missing,invalid,foreign or failing native values without cached fallback', async () => {
  const { default: command } = await import('../src/commands/utility/membercount.js');
  for (const value of [
    null,
    { id: 'other', approximateMemberCount: 1, approximatePresenceCount: 0 },
    { id: 'g', approximateMemberCount: null, approximatePresenceCount: 0 },
    { id: 'g', approximateMemberCount: 1, approximatePresenceCount: 2 },
    { id: 'g', approximateMemberCount: 1.5, approximatePresenceCount: 0 },
    { id: 'g', approximateMemberCount: 1, approximatePresenceCount: -1 },
  ]) {
    const s = setup();
    s.i.client.guilds.fetch = async () => value;
    await assert.rejects(() => command.execute(s.i, s.c), /memberCountUnavailable/);
    assert.equal(s.replies.length, 0);
  }
  const s = setup();
  s.i.client.guilds.fetch = async () => {
    throw Error('network');
  };
  await assert.rejects(() => command.execute(s.i, s.c));
  assert.equal(s.replies.length, 0);
});

test('emojiinfo fetches exact current custom emoji and omits uploader/role metadata across locales', async () => {
  const { default: command } = await import('../src/commands/utility/emojiinfo.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale),
      id = '100000000000000005';
    s.i.options.getString = () => id;
    s.i.guild.emojis = {
      fetch: async (selected, o) => {
        assert.equal(selected, id);
        assert.equal(o.force, true);
        return {
          id,
          guild: { id: 'g' },
          name: 'test_emoji',
          animated: true,
          managed: false,
          user: { username: 'PRIVATE UPLOADER' },
          roles: { cache: ['PRIVATE ROLE'] },
          imageURL: (o) => {
            assert.deepEqual(o, { extension: 'gif', size: 128 });
            return 'https://cdn.discordapp.com/emojis/example.gif';
          },
        };
      },
    };
    await command.execute(s.i, s.c);
    assert.equal(s.replies.length, 1);
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    assert(!JSON.stringify(s.replies).includes('PRIVATE'));
  }
});
test('emojiinfo rejects invalid IDs,foreign/missing/native metadata without cache fallback', async () => {
  const { default: command } = await import('../src/commands/utility/emojiinfo.js');
  for (const kind of ['input', 'foreign', 'wrong', 'missing', 'network']) {
    const s = setup(),
      id = '100000000000000005';
    s.i.options.getString = () => (kind === 'input' ? 'bad' : id);
    s.i.guild.emojis = {
      fetch: async () => {
        if (kind === 'network') throw Error('network');
        return kind === 'missing'
          ? null
          : {
              id: kind === 'wrong' ? 'other' : id,
              guild: { id: kind === 'foreign' ? 'other' : 'g' },
            };
      },
    };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
  }
});

test('stickerinfo reads fresh guild sticker formats and optional availability privately without private metadata', async () => {
  const { default: command } = await import('../src/commands/utility/stickerinfo.js');
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const format of [1, 2, 3, 4])
      for (const available of [true, false, null]) {
        const s = setup(locale),
          id = '100000000000000006';
        s.i.options.getString = () => id;
        s.i.guild.stickers = {
          fetch: async (selected, o) => {
            assert.equal(selected, id);
            assert.deepEqual(o, { force: true });
            return {
              id,
              guildId: 'g',
              type: 2,
              name: 'test*sticker',
              format,
              available,
              user: { username: 'PRIVATE' },
              description: 'PRIVATE',
              tags: 'PRIVATE',
              get url() {
                throw Error('must not read file URL');
              },
            };
          },
        };
        await command.execute(s.i, s.c);
        assert.equal(s.replies.length, 1);
        assert.deepEqual(s.replies[0].allowedMentions.parse, []);
        assert(!JSON.stringify(s.replies).includes('PRIVATE'));
        assert(s.replies[0].embeds[0].data.description.includes(id));
      }
});
test('stickerinfo rejects bad ID,foreign/standard/missing/invalid metadata and fetch failure without fallback', async () => {
  const { default: command } = await import('../src/commands/utility/stickerinfo.js');
  for (const kind of [
    'input',
    'foreign',
    'wrong',
    'standard',
    'missing',
    'format',
    'availability',
    'name',
    'network',
  ]) {
    const s = setup(),
      id = '100000000000000006';
    s.i.options.getString = () => (kind === 'input' ? 'bad' : id);
    let reads = 0;
    s.i.guild.stickers = {
      fetch: async () => {
        reads++;
        if (kind === 'network') throw Error('network');
        if (kind === 'missing') return null;
        return {
          id: kind === 'wrong' ? 'other' : id,
          guildId: kind === 'foreign' ? 'other' : 'g',
          type: kind === 'standard' ? 1 : 2,
          name: kind === 'name' ? null : 'sticker',
          format: kind === 'format' ? 9 : 1,
          available: kind === 'availability' ? 'yes' : true,
        };
      },
    };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
    if (kind === 'input') assert.equal(reads, 0);
  }
});

test('avatar and userinfo force exact public user reads and private current replies across locales', async () => {
  const { default: avatar } = await import('../src/commands/utility/avatar.js'),
    { default: userinfo } = await import('../src/commands/utility/userinfo.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    s.user.username = 'fresh**name**';
    s.user.bot = false;
    s.user.createdAt = new Date('2020-01-01T00:00:00Z');
    s.user.displayAvatarURL = (o) => {
      assert.equal(o.size, 1024);
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    };
    await avatar.execute(s.i, s.c);
    await userinfo.execute(s.i, s.c);
    assert.equal(s.replies.length, 2);
    for (const r of s.replies) assert.deepEqual(r.allowedMentions.parse, []);
    assert(s.replies[1].embeds[0].data.description.includes('fresh\\*\\*name\\*\\*'));
  }
});
test('avatar and userinfo refuse substitute/missing/failing live lookup instead of cached interaction', async () => {
  const { default: avatar } = await import('../src/commands/utility/avatar.js'),
    { default: userinfo } = await import('../src/commands/utility/userinfo.js');
  for (const command of [avatar, userinfo])
    for (const kind of ['wrong', 'missing', 'network']) {
      const s = setup();
      s.i.client.users.fetch = async () => {
        if (kind === 'network') throw Error('network');
        return kind === 'missing' ? null : { id: 'other' };
      };
      await assert.rejects(() => command.execute(s.i, s.c));
      assert.equal(s.replies.length, 0);
    }
});

test('serverinfo reads fresh name/exact guild/approximate count privately without census', async () => {
  const { default: command } = await import('../src/commands/utility/serverinfo.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    s.i.client.guilds.fetch = async (o) => {
      assert.deepEqual(o, { guild: 'g', force: true, withCounts: true });
      return { id: 'g', name: 'fresh**name**', approximateMemberCount: 0 };
    };
    await command.execute(s.i, s.c);
    assert.equal(s.replies.length, 1);
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    assert(s.replies[0].embeds[0].data.description.includes('fresh\\*\\*name\\*\\*'));
    assert(s.replies[0].embeds[0].data.description.includes('0'));
  }
});
test('serverinfo refuses foreign/missing/invalid fresh values and lookup failures without cached fallback', async () => {
  const { default: command } = await import('../src/commands/utility/serverinfo.js');
  for (const value of [
    null,
    { id: 'other', name: 'n', approximateMemberCount: 1 },
    { id: 'g', name: null, approximateMemberCount: 1 },
    { id: 'g', name: 'n', approximateMemberCount: null },
    { id: 'g', name: 'n', approximateMemberCount: -1 },
    { id: 'g', name: 'n', approximateMemberCount: 1.5 },
  ]) {
    const s = setup();
    s.i.client.guilds.fetch = async () => value;
    await assert.rejects(() => command.execute(s.i, s.c), /memberCountUnavailable/);
    assert.equal(s.replies.length, 0);
  }
  const s = setup();
  s.i.client.guilds.fetch = async () => {
    throw Error('network');
  };
  await assert.rejects(() => command.execute(s.i, s.c));
  assert.equal(s.replies.length, 0);
});

test('roleinfo escapes current names and refuses unverifiable native metadata before output', async () => {
  const s = setup();
  s.role.name = '**name**';
  await roleinfo.execute(s.i, s.c);
  assert(s.replies[0].embeds[0].data.description.includes('\\*\\*name\\*\\*'));
  for (const change of [
    (x) => (x.role.position = -1),
    (x) => (x.role.position = 1.5),
    (x) => (x.role.managed = null),
    (x) => (x.role.hexColor = 'bad'),
    (x) => (x.role.name = null),
  ]) {
    const x = setup();
    change(x);
    await assert.rejects(() => roleinfo.execute(x.i, x.c), /roleInvalid/);
    assert.equal(x.replies.length, 0);
  }
});
test('boostcount refuses negative/unsafe counts and unsupported native tiers', async () => {
  for (const [count, tier] of [
    [-1, 0],
    [Number.MAX_SAFE_INTEGER + 1, 0],
    [0, -1],
    [0, 4],
    [0, 1.5],
  ]) {
    const s = setup();
    s.guild.premiumSubscriptionCount = count;
    s.guild.premiumTier = tier;
    await assert.rejects(() => boostcount.execute(s.i, s.c), /boostUnavailable/);
    assert.equal(s.replies.length, 0);
  }
});
