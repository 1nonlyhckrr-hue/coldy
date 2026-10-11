import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, validateLocaleCoverage, Localization } from '../src/services/localization.js';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import configCommand from '../src/commands/general/config.js';
test('locale keys aligned and placeholders strict', () => {
  assert(validateLocaleCoverage() >= 7);
  assert.match(translate('hi', 'languageSaved', { language: 'hi' }), /भाषा/);
  assert.throws(() => translate('bad', 'enabled'));
  assert.throws(() => translate('en', 'unknown'));
  assert.throws(() => translate('en', 'languageSaved'));
});
test('per-guild language isolates and localized config executes', async () => {
  const db = openDatabase(':memory:');
  try {
    const guildConfig = new GuildConfig(new GuildSettings(db)),
      c = {
        guildConfig,
        localization: new Localization(guildConfig),
        config: { memberEventsEnabled: false },
      },
      replies = [];
    let sub = 'language';
    const i = {
      guildId: 'one',
      user: { id: 'a' },
      guild: {
        id: 'one',
        members: {
          fetch: async () => ({ id: 'a', guild: { id: 'one' }, permissions: { has: () => true } }),
        },
      },
      deferReply: async (p) => assert.equal(p.flags, 64),
      options: { getSubcommand: () => sub, getString: () => 'hi' },
      editReply: async (p) => replies.push(p),
    };
    await configCommand.execute(i, c);
    assert.equal(guildConfig.get('one').language, 'hi');
    assert.equal(guildConfig.get('two').language, 'en');
    assert.throws(() => guildConfig.setLanguage('one', 'invalid'));
    sub = 'view';
    await configCommand.execute(i, c);
    assert.match(replies[1].embeds[0].data.description, /भाषा/);
  } finally {
    db.close();
  }
});
test('welcome defaults follow locale while user templates stay verbatim', async () => {
  const { renderGuildTemplate } = await import('../src/services/guildConfig.js');
  const db = openDatabase(':memory:');
  try {
    const c = new GuildConfig(new GuildSettings(db));
    c.setLanguage('g', 'hi');
    const member = {
      id: '123',
      user: { username: 'Test' },
      guild: { name: 'Guild', memberCount: 3 },
    };
    assert.match(renderGuildTemplate(c.get('g').welcome, 'welcome', member, 'hi'), /स्वागत/);
    c.patch('g', 'welcome', { message: 'Welcome {user} to {server}!', messageCustom: true });
    assert.equal(
      renderGuildTemplate(c.get('g').welcome, 'welcome', member, 'hi'),
      'Welcome <@123> to Guild!',
    );
    const legacy = { message: 'Owner says hello {username}', goodbyeMessage: 'Bye {username}' };
    assert.equal(renderGuildTemplate(legacy, 'welcome', member, 'hi'), 'Owner says hello Test');
    assert.equal(renderGuildTemplate(legacy, 'goodbye', member, 'hi'), 'Bye Test');
  } finally {
    db.close();
  }
});
test('all locale placeholder sets match English templates', async () => {
  const { readFileSync } = await import('node:fs');
  const dictionaries = ['en', 'hi', 'hinglish'].map((l) =>
    JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), 'utf8')),
  );
  for (const key of Object.keys(dictionaries[0])) {
    const placeholders = (text) =>
      [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    for (const d of dictionaries)
      assert.deepEqual(placeholders(d[key]), placeholders(dictionaries[0][key]), key);
  }
});

test('config command force verifies exact current server admin before reads or language writes', async () => {
  for (const sub of ['view', 'language'])
    for (const kind of ['actor', 'memberGuild', 'guild', 'permission']) {
      const db = openDatabase(':memory:');
      try {
        const guildConfig = new GuildConfig(new GuildSettings(db)),
          c = {
            guildConfig,
            localization: new Localization(guildConfig),
            config: { memberEventsEnabled: false },
          };
        let replies = 0;
        const i = {
          guildId: 'g',
          user: { id: 'a' },
          guild: {
            id: kind === 'guild' ? 'other' : 'g',
            members: {
              fetch: async (o) => {
                assert.deepEqual(o, { user: 'a', force: true });
                return {
                  id: kind === 'actor' ? 'other' : 'a',
                  guild: { id: kind === 'memberGuild' ? 'other' : 'g' },
                  permissions: { has: () => kind !== 'permission' },
                };
              },
            },
          },
          options: { getSubcommand: () => sub, getString: () => 'hi' },
          deferReply: async () => {},
          editReply: async () => {
            replies++;
          },
        };
        await assert.rejects(() => configCommand.execute(i, c), /userPermission/);
        assert.equal(guildConfig.get('g').language, 'en');
        assert.equal(replies, 0);
      } finally {
        db.close();
      }
    }
});
test('config rejects unknown subcommand without defaulting to config disclosure', async () => {
  const db = openDatabase(':memory:');
  try {
    const guildConfig = new GuildConfig(new GuildSettings(db));
    let replies = 0;
    await assert.rejects(
      () =>
        configCommand.execute(
          {
            guildId: 'g',
            user: { id: 'a' },
            guild: {
              id: 'g',
              members: {
                fetch: async () => ({
                  id: 'a',
                  guild: { id: 'g' },
                  permissions: { has: () => true },
                }),
              },
            },
            deferReply: async () => {},
            editReply: async () => {
              replies++;
            },
            options: { getSubcommand: () => 'unknown' },
          },
          { guildConfig, localization: new Localization(guildConfig) },
        ),
      /unknownCommand/,
    );
    assert.equal(replies, 0);
  } finally {
    db.close();
  }
});
