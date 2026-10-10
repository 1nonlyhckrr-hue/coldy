import { test } from 'node:test';
import assert from 'node:assert/strict';
import command from '../src/commands/utility/list.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const records = new Map(
      Array.from({ length: 12 }, (_, n) => [
        String(n),
        {
          id: String(100000000000000001n + BigInt(n)),
          guild: { id: 'g' },
          name: `R${n}`,
          position: n,
          animated: false,
        },
      ]),
    ),
    replies = [];
  let kind = 'roles',
    page = 1;
  const i = {
      guildId: 'g',
      guild: { roles: { fetch: async () => records }, emojis: { fetch: async () => records } },
      options: { getSubcommand: () => kind, getInteger: () => page },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
    },
    c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
  return { records, replies, i, c, kind: (k) => (kind = k), page: (p) => (page = p) };
}
test('role/emoji lists freshly fetch,paginate10,sort deterministically and localize with no-pings', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    await command.execute(s.i, s.c);
    assert.match(s.replies[0].embeds[0].data.description, /R11/);
    assert(!s.replies[0].embeds[0].data.description.includes('R1 |'));
    s.page(2);
    await command.execute(s.i, s.c);
    assert.match(s.replies[1].embeds[0].data.description, /R0/);
    s.kind('emojis');
    s.page(1);
    await command.execute(s.i, s.c);
    assert.equal(s.replies.length, 3);
    for (const p of s.replies) assert.deepEqual(p.allowedMentions.parse, []);
  }
});
test('empty list is valid,nonexistent/invalid pages and foreign rows rejected', async () => {
  const s = setup();
  for (const page of [0, 3, 1.5, 1001]) {
    s.page(page);
    await assert.rejects(() => command.execute(s.i, s.c), /listPageInvalid/);
  }
  s.page(1);
  s.records.values().next().value.guild.id = 'other';
  await assert.rejects(() => command.execute(s.i, s.c), /listIdentityInvalid/);
  s.records.clear();
  await command.execute(s.i, s.c);
  assert.match(s.replies[0].embeds[0].data.description, /No current records/);
});
test('unavailable source never substituted from cache and user names escaped for rendering', async () => {
  const s = setup();
  s.records.clear();
  s.records.set('one', {
    id: '100000000000000001',
    guild: { id: 'g' },
    name: '**Admin**',
    position: 1,
  });
  await command.execute(s.i, s.c);
  assert(s.replies[0].embeds[0].data.description.includes('\\*\\*Admin\\*\\*'));
  s.i.guild.roles.fetch = async () => {
    throw new Error('unavailable');
  };
  await assert.rejects(() => command.execute(s.i, s.c));
  assert.equal(s.replies.length, 1);
});
