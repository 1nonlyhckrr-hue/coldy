import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HelpNavigation,
  helpView,
  createHelpNavigationHandler,
} from '../src/services/helpNavigation.js';
import { loadCommands } from '../src/services/registry.js';
import command from '../src/commands/general/help.js';
const commands = await loadCommands();
function context(locale = 'en') {
  return {
    commands,
    localization: { locale: () => locale },
    helpNavigation: new HelpNavigation(),
    logger: { error: () => {} },
  };
}
test('public help sends structured Emika embed and21category options with bounded controls', async () => {
  const c = context();
  let payload;
  await command.execute(
    {
      guildId: 'g',
      options: { getString: () => null, getInteger: () => null },
      reply: async (p) => {
        payload = p;
      },
    },
    c,
  );
  assert.equal(payload.flags, undefined);
  assert.deepEqual(payload.allowedMentions.parse, []);
  const embed = payload.embeds[0].toJSON();
  assert.match(embed.title, /Emika/);
  assert.equal(embed.fields[2].value, '693');
  const rows = payload.components.map((r) => r.toJSON());
  assert.equal(rows[0].components[0].options.length, 21);
  assert.equal(rows[1].components[1].disabled, true);
  assert.equal(rows[1].components[2].disabled, false);
});
test('every category and all586paths remain reachable without embed truncation in3locales', () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const c = context(locale);
    for (const category of [null, ...new Set([...commands.values()].map((x) => x.category))]) {
      const first = helpView(c, { guildId: 'g', page: 1, category }, 'preview').embeds[0].toJSON();
      const pages = Number(first.fields[1].value.split('/')[1]);
      for (let page = 1; page <= pages; page++) {
        const e = helpView(c, { guildId: 'g', page, category }, 'preview').embeds[0].toJSON();
        assert(e.description.length < 4096);
        assert.equal(e.fields.length, 3);
        assert(e.fields.every((f) => f.value.length <= 1024));
      }
    }
  }
});
test('any channel member can navigate category next previous and home without running commands', async () => {
  const c = context(),
    id = c.helpNavigation.create('g', { page: 1, category: null, search: null, command: null });
  const handler = createHelpNavigationHandler(c);
  let payload;
  const i = {
    guildId: 'g',
    user: { id: 'another-member' },
    isButton: () => false,
    isStringSelectMenu: () => true,
    customId: `emika:help:${id}:category`,
    values: ['music'],
    update: async (p) => {
      payload = p;
    },
  };
  await handler(i);
  assert.equal(c.helpNavigation.get(id, 'g').category, 'music');
  assert.match(payload.embeds[0].toJSON().description, /\/music/);
  i.isButton = () => true;
  i.isStringSelectMenu = () => false;
  i.customId = `emika:help:${id}:next`;
  await handler(i);
  assert.equal(c.helpNavigation.get(id, 'g').page, 2);
  i.customId = `emika:help:${id}:prev`;
  await handler(i);
  assert.equal(c.helpNavigation.get(id, 'g').page, 1);
  i.customId = `emika:help:${id}:home`;
  await handler(i);
  assert.equal(c.helpNavigation.get(id, 'g').category, null);
});
test('help sessions expire are bounded cross-guild isolated and nonreusable after restart', () => {
  let now = 0;
  const nav = new HelpNavigation({ now: () => now, ttlMs: 100, maxSessions: 2 });
  const a = nav.create('g', { page: 1 });
  assert.throws(() => nav.get(a, 'other'), /helpExpired/);
  nav.create('g', { page: 1 });
  nav.create('g', { page: 1 });
  assert.throws(() => nav.get(a, 'g'), /helpExpired/);
  const b = nav.create('g', { page: 1 });
  now = 100;
  assert.throws(() => nav.get(b, 'g'), /helpExpired/);
  assert.equal(nav.sessions.size, 0);
  assert.notEqual(
    new HelpNavigation().create('g', { page: 1 }),
    new HelpNavigation().create('g', { page: 1 }),
  );
});
test('invalid category expired forged crossguild and out-of-range controls reply privately without mutation', async () => {
  const c = context(),
    id = c.helpNavigation.create('g', { page: 1, category: null });
  const handler = createHelpNavigationHandler(c);
  for (const change of [
    { values: ['bad'] },
    { guildId: 'other' },
    { customId: `emika:help:${id}:prev`, isButton: () => true, isStringSelectMenu: () => false },
    { customId: 'emika:help:invalid:home' },
  ]) {
    let replied,
      updates = 0;
    const before = JSON.stringify([...c.helpNavigation.sessions]);
    await handler({
      guildId: 'g',
      customId: `emika:help:${id}:category`,
      values: ['music'],
      isButton: () => false,
      isStringSelectMenu: () => true,
      update: async () => {
        updates++;
      },
      reply: async (p) => {
        replied = p;
      },
      ...change,
    });
    assert.equal(updates, 0);
    assert.equal(replied.flags, 64);
    assert.equal(JSON.stringify([...c.helpNavigation.sessions]), before);
  }
});
test('failed help update does not advance session and unrelated component handlers are untouched', async () => {
  const c = context(),
    id = c.helpNavigation.create('g', { page: 1 });
  const handler = createHelpNavigationHandler(c);
  await handler({
    guildId: 'g',
    customId: `emika:help:${id}:next`,
    isButton: () => true,
    update: async () => {
      throw new Error('failure');
    },
    reply: async () => {},
  });
  assert.equal(c.helpNavigation.get(id, 'g').page, 1);
  await handler({
    isButton: () => true,
    customId: 'luna:role:1',
    update: () => {
      throw new Error('not ours');
    },
  });
});
