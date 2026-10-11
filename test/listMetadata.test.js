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
    page = 1,
    search = null;
  const i = {
      guildId: 'g',
      guild: {
        roles: { fetch: async () => records },
        emojis: { fetch: async () => records },
        stickers: { fetch: async () => records },
      },
      options: { getSubcommand: () => kind, getInteger: () => page, getString: () => search },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
    },
    c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
  return {
    records,
    replies,
    i,
    c,
    kind: (k) => (kind = k),
    page: (p) => (page = p),
    search: (s) => (search = s),
  };
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

test('server stickers fetch current metadata only,paginate and omit uploader/description/image', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    s.kind('stickers');
    s.page(2);
    let n = 0;
    s.i.guild.stickers.fetch = async () => {
      n++;
      return s.records;
    };
    for (const r of s.records.values()) {
      r.description = 'SECRET';
      r.user = { id: 'PRIVATE' };
      r.url = 'PRIVATE-IMAGE';
    }
    await command.execute(s.i, s.c);
    assert.equal(n, 1);
    const text = JSON.stringify(s.replies[0]);
    assert(!text.includes('SECRET') && !text.includes('PRIVATE'));
    assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    s.i.guild.stickers.fetch = async () => {
      throw new Error('unavailable');
    };
    await assert.rejects(() => command.execute(s.i, s.c));
    assert.equal(s.replies.length, 1);
  }
});
test('sticker native guild identity mismatch never produces a list', async () => {
  const s = setup();
  s.kind('stickers');
  s.records.values().next().value.guild.id = 'other';
  await assert.rejects(() => command.execute(s.i, s.c), /listIdentityInvalid/);
  assert.equal(s.replies.length, 0);
});

test('metadata lists reject unverifiable row IDs,names,role positions and emoji animation before output', async () => {
  for (const [kind, change] of [
    ['roles', (r) => (r.id = 'bad')],
    ['roles', (r) => (r.name = null)],
    ['roles', (r) => (r.position = -1)],
    ['roles', (r) => (r.position = 1.5)],
    ['emojis', (r) => (r.animated = null)],
    ['stickers', (r) => (r.name = null)],
  ]) {
    const s = setup();
    s.kind(kind);
    change(s.records.values().next().value);
    await assert.rejects(() => command.execute(s.i, s.c), /listIdentityInvalid/);
    assert.equal(s.replies.length, 0);
  }
});
test('emoji lists translate static/animated labels in stored locale', async () => {
  const s = setup('hi');
  s.kind('emojis');
  s.records.values().next().value.animated = true;
  await command.execute(s.i, s.c);
  const text = s.replies[0].embeds[0].data.description;
  assert(text.includes(translate('hi', 'listEmojiAnimated')));
  assert(text.includes(translate('hi', 'listEmojiStatic')));
});

test('metadata name search is literal case-insensitive full-name filtering before pagination', async () => {
  const s = setup();
  s.search(' r1 ');
  await command.execute(s.i, s.c);
  const text = s.replies[0].embeds[0].data.description;
  assert(text.includes('R11'));
  assert(text.includes('R10'));
  assert(text.includes('R1 |'));
  assert(!text.includes('R9 |'));
  s.search('.*');
  await command.execute(s.i, s.c);
  assert(s.replies[1].embeds[0].data.description.includes('No current records'));
  s.page(2);
  await assert.rejects(() => command.execute(s.i, s.c), /listPageInvalid/);
});
test('search applies all source kinds and locales without pings or modified native records', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const kind of ['roles', 'emojis', 'stickers']) {
      const s = setup(locale);
      s.kind(kind);
      s.search('R11');
      const before = JSON.stringify([...s.records]);
      await command.execute(s.i, s.c);
      assert(s.replies[0].embeds[0].data.description.includes('R11'));
      assert.equal(JSON.stringify([...s.records]), before);
      assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    }
});
test('invalid literal queries reject before source fetch with no output', async () => {
  for (const search of ['', '   ', 'x'.repeat(81), 'a\n', 1, undefined]) {
    const s = setup();
    s.search(search);
    let calls = 0;
    s.i.guild.roles.fetch = async () => {
      calls++;
      return s.records;
    };
    await assert.rejects(() => command.execute(s.i, s.c), /listSearchInvalid/);
    assert.equal(calls, 0);
    assert.equal(s.replies.length, 0);
  }
});
test('search cannot hide foreign or malformed source rows even when not matching', async () => {
  for (const change of [
    (r) => (r.guild.id = 'foreign'),
    (r) => (r.name = 'x\n'),
    (r) => (r.name = 'x'.repeat(129)),
  ]) {
    const s = setup();
    s.search('notfound');
    change(s.records.values().next().value);
    await assert.rejects(() => command.execute(s.i, s.c), /listIdentityInvalid/);
    assert.equal(s.replies.length, 0);
  }
});
test('worst-case names shorten before escaping without partial markdown and retain complete IDs', async () => {
  const s = setup();
  s.records.clear();
  for (let n = 0; n < 10; n++)
    s.records.set(String(n), {
      id: String(100000000000000001n + BigInt(n)),
      guild: { id: 'g' },
      name: '*'.repeat(100),
      position: n,
    });
  s.search('*'.repeat(60));
  await command.execute(s.i, s.c);
  const text = s.replies[0].embeds[0].data.description;
  assert(text.length < 2000);
  assert(text.includes('...'));
  assert(text.includes('100000000000000001'));
  assert(text.includes(translate('en', 'listNameNotice')));
  assert(!text.includes('\\ |'));
});
