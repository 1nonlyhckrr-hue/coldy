import { test } from 'node:test';
import assert from 'node:assert/strict';
import command from '../src/commands/utility/serverbanner.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const hash = 'a'.repeat(32),
    guild = {
      id: '100000000000000001',
      banner: hash,
      bannerURL: (o) => {
        assert.equal(o.size, 1024);
        return `https://cdn.discordapp.com/banners/100000000000000001/${hash}.webp?size=1024`;
      },
    },
    replies = [];
  const i = {
      guildId: guild.id,
      client: {
        guilds: {
          fetch: async (o) => {
            assert.equal(o.guild, guild.id);
            assert.equal(o.force, true);
            return guild;
          },
        },
      },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
    },
    c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
  return { guild, i, c, replies };
}
test('server banner force-fetches current guild and returns native asset link or explicit none privately in locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    await command.execute(s.i, s.c);
    assert(s.replies[0].embeds[0].data.description.includes('/banners/'));
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    s.guild.banner = null;
    s.guild.bannerURL = () => {
      throw Error('should not use cached URL');
    };
    await command.execute(s.i, s.c);
    assert(!s.replies.at(-1).embeds[0].data.description.includes('https:'));
  }
});
test('server banner rejects foreign/missing/native malformed identity and noncdn URLs without output', async () => {
  for (const kind of ['guild', 'missing', 'hash', 'url', 'error']) {
    const s = setup();
    if (kind === 'guild') s.i.client.guilds.fetch = async () => ({ ...s.guild, id: 'other' });
    if (kind === 'missing') s.guild.banner = undefined;
    if (kind === 'hash') s.guild.banner = 'bad';
    if (kind === 'url') s.guild.bannerURL = () => 'https://evil.invalid/banners/x';
    if (kind === 'error')
      s.i.client.guilds.fetch = async () => {
        throw Error('network');
      };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
  }
});
