import { test } from 'node:test';
import assert from 'node:assert/strict';
import command from '../src/commands/utility/servericon.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const hash = 'a'.repeat(32),
    guild = {
      id: '100000000000000001',
      icon: hash,
      iconURL: (o) => {
        assert.equal(o.size, 1024);
        return `https://cdn.discordapp.com/icons/100000000000000001/${hash}.webp?size=1024`;
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
test('server icon force-fetches current guild and returns native asset link or explicit none privately in locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    await command.execute(s.i, s.c);
    assert(s.replies[0].embeds[0].data.description.includes('/icons/'));
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    s.guild.icon = null;
    s.guild.iconURL = () => {
      throw Error('should not use cached URL');
    };
    await command.execute(s.i, s.c);
    assert(!s.replies.at(-1).embeds[0].data.description.includes('https:'));
  }
});
test('server icon rejects foreign/missing/native malformed identity and noncdn URLs without output', async () => {
  for (const kind of ['guild', 'missing', 'hash', 'url', 'error']) {
    const s = setup();
    if (kind === 'guild') s.i.client.guilds.fetch = async () => ({ ...s.guild, id: 'other' });
    if (kind === 'missing') s.guild.icon = undefined;
    if (kind === 'hash') s.guild.icon = 'bad';
    if (kind === 'url') s.guild.iconURL = () => 'https://evil.invalid/icons/x';
    if (kind === 'error')
      s.i.client.guilds.fetch = async () => {
        throw Error('network');
      };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 0);
  }
});

test('server icon accepts animated native gif URL produced by installed REST CDN', async () => {
  const { CDN } = await import('@discordjs/rest');
  const s = setup();
  s.guild.icon = 'a_' + 'a'.repeat(32);
  s.guild.iconURL = (o) => new CDN().icon(s.guild.id, s.guild.icon, o);
  await command.execute(s.i, s.c);
  assert(s.replies[0].embeds[0].data.description.includes('.gif?size=1024'));
});
