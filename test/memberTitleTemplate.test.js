import { test } from 'node:test';
import assert from 'node:assert/strict';
import { welcomeStyle } from '../src/services/welcomeAssets.js';
import { createMemberMessageHandler } from '../src/events/memberMessages.js';
import goodbye from '../src/commands/welcomer/goodbye.js';
import welcome from '../src/commands/welcomer/welcome.js';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { makeGuild } from './helpers/guild.js';
test('custom titles expand exact body placeholders once and preserve static titles/fallback', () => {
  const m = {
    id: '123',
    displayName: 'Member name',
    user: { username: 'alice' },
    guild: { name: 'Server', memberCount: 7 },
  };
  for (const kind of ['welcome', 'goodbye']) {
    const key = kind === 'goodbye' ? 'goodbyeTitle' : 'title';
    assert.equal(
      welcomeStyle({ [key]: '{user} {username} {server} {count} {unknown}' }, kind, m).title,
      '<@123> alice Server 7 {unknown}',
    );
    assert.equal(welcomeStyle({ [key]: 'Emika static' }, kind, m).title, 'Emika static');
    assert.equal(welcomeStyle({}, kind, m).title, 'Member name');
    assert.equal(
      welcomeStyle({ [key]: '{username}' }, kind, { ...m, user: { username: '{server}' } }).title,
      '{server}',
    );
    assert.equal(
      welcomeStyle({ [key]: '{server}' }, kind, {
        ...m,
        guild: { ...m.guild, name: 'x'.repeat(400) },
      }).title.length,
      256,
    );
  }
});
test('preview test and real member events use their own member in dynamic titles; mentions remain suppressed for goodbye', async () => {
  const db = openDatabase(':memory:');
  try {
    const s = makeGuild(),
      guildConfig = new GuildConfig(new GuildSettings(db));
    const actor = {
      id: '100000000000000009',
      guild: s.guild,
      displayName: 'Invoker',
      user: { username: 'invoker' },
      permissions: { has: () => true },
    };
    s.guild.members.fetch = async () => actor;
    guildConfig.patch('g', 'welcome', {
      channelId: '100000000000000001',
      enabled: true,
      goodbyeEnabled: true,
      title: 'Hi {username}',
      goodbyeTitle: '🕊{username} has moved on. Wishing them the best.',
      message: 'Hi {user}',
      messageCustom: true,
      goodbyeMessage: 'Bye {user}',
      goodbyeCustom: true,
    });
    const c = { guildConfig, config: { memberEventsEnabled: true }, logger: { warn() {} } };
    let sub = 'preview',
      reply;
    const i = {
      guild: s.guild,
      guildId: 'g',
      member: actor,
      user: { id: actor.id },
      options: { getSubcommand: () => sub, getString: () => 'welcome' },
      deferReply: async () => {},
      editReply: async (p) => {
        reply = p;
      },
    };
    await goodbye.execute(i, c);
    assert.equal(reply.embeds[0].data.title, '🕊invoker has moved on. Wishing them the best.');
    assert.deepEqual(reply.allowedMentions, { parse: [] });
    await welcome.execute(i, c);
    assert.equal(reply.embeds[0].data.title, 'Hi invoker');
    sub = 'test';
    await goodbye.execute(i, c);
    assert.equal(s.sent[0].embeds[0].data.title, '🕊invoker has moved on. Wishing them the best.');
    const leaving = { ...actor, id: '100000000000000010', user: { username: 'leaver' } };
    await createMemberMessageHandler(c, 'goodbye')(leaving);
    assert.equal(s.sent[1].embeds[0].data.title, '🕊leaver has moved on. Wishing them the best.');
    assert.deepEqual(s.sent[1].allowedMentions, { parse: [], users: [] });
    guildConfig.patch('g', 'welcome', { goodbyeTitle: '{user} has left' });
    await createMemberMessageHandler(c, 'goodbye')(leaving);
    assert.equal(s.sent[2].embeds[0].data.title, '<@100000000000000010> has left');
    assert.deepEqual(s.sent[2].allowedMentions, { parse: [], users: [] });
    await createMemberMessageHandler(c, 'welcome')(actor);
    assert.equal(s.sent[3].embeds[0].data.title, 'Hi invoker');
  } finally {
    db.close();
  }
});

test('both edit modals prefill title, save/reset exact own title, reject bad title without partial saves', async () => {
  const { buildModal, createWelcomeEditHandler } = await import('../src/services/welcomeEdit.js');
  for (const kind of ['welcome', 'goodbye']) {
    const key = kind === 'goodbye' ? 'goodbyeTitle' : 'title',
      patches = [];
    const settings = { message: 'Hi', goodbyeMessage: 'Bye', [key]: 'Hi {username}' };
    assert.equal(
      buildModal(kind, '9', settings, 'en').toJSON().components[2].components[0].value,
      'Hi {username}',
    );
    const c = {
      guildConfig: { patch: (g, s, p) => patches.push(p), get: () => ({ language: 'en' }) },
      localization: { t: (g, k) => k, locale: () => 'en' },
      logger: { warn() {}, error() {} },
    };
    const i = (title) => ({
      isModalSubmit: () => true,
      customId: `welcomeEdit:${kind}:9`,
      user: { id: '9' },
      guildId: 'g',
      guild: { members: { fetch: async () => ({ permissions: { has: () => true } }) } },
      fields: { getTextInputValue: (k) => (k === 'title' ? title : k === 'image' ? '' : 'New') },
      reply: async () => {},
    });
    const h = createWelcomeEditHandler(c);
    await h(i('Hi {username}'));
    await h(i(''));
    await h(i('@everyone'));
    await h(i('x'.repeat(121)));
    assert.equal(patches.length, 2);
    assert.equal(patches[0][key], 'Hi {username}');
    assert.equal(patches[1][key], undefined);
    assert.equal(Object.hasOwn(patches[0], kind === 'goodbye' ? 'title' : 'goodbyeTitle'), false);
  }
});
test('goodbye title counterpart stores and resets title without changing welcome title', async () => {
  const db = openDatabase(':memory:');
  try {
    const s = makeGuild(),
      guildConfig = new GuildConfig(new GuildSettings(db));
    const actor = {
      id: '100000000000000009',
      guild: s.guild,
      user: { username: 'User' },
      permissions: { has: () => true },
    };
    s.guild.members.fetch = async () => actor;
    guildConfig.patch('g', 'welcome', { title: 'Welcome static' });
    let text = '🕊{username} has moved on. Wishing them the best.';
    const i = {
      guild: s.guild,
      guildId: 'g',
      user: { id: actor.id },
      options: { getSubcommand: () => 'title', getString: () => text },
      deferReply: async () => {},
      editReply: async () => {},
    };
    const c = { guildConfig };
    await goodbye.execute(i, c);
    assert.equal(guildConfig.get('g').welcome.goodbyeTitle, text);
    assert.equal(guildConfig.get('g').welcome.title, 'Welcome static');
    text = null;
    await goodbye.execute(i, c);
    assert.equal(guildConfig.get('g').welcome.goodbyeTitle, undefined);
  } finally {
    db.close();
  }
});
