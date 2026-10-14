import { test } from 'node:test';
import assert from 'node:assert/strict';
import goodbye from '../src/commands/welcomer/goodbye.js';
import { buildModal, createWelcomeEditHandler } from '../src/services/welcomeEdit.js';
import { translate } from '../src/services/localization.js';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { createMemberMessageHandler } from '../src/events/memberMessages.js';
import { makeGuild } from './helpers/guild.js';

test('goodbye exposes edit copy preview test with no kind selector', () => {
  const json = goodbye.data.toJSON();
  assert.equal(json.name, 'goodbye');
  assert.deepEqual(
    json.options.map((s) => s.name),
    ['set', 'title', 'edit', 'copy', 'preview', 'test'],
  );
  assert.equal(json.options[3].options[0].name, 'link');
});
test('goodbye edit prefills its own text and GIF in all locales; never welcome assets', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const settings = {
      message: 'Hi',
      goodbyeMessage: 'Bye {username}',
      image: 'https://x.io/w.png',
      goodbyeImage: 'https://x.io/b.gif',
    };
    let modal;
    await goodbye.execute(
      {
        user: { id: '9' },
        guildId: 'g',
        memberPermissions: { has: () => true },
        options: { getSubcommand: () => 'edit' },
        showModal: async (m) => {
          modal = m.toJSON();
        },
      },
      { guildConfig: { get: () => ({ language: locale, welcome: settings }) } },
    );
    assert.equal(modal.title, translate(locale, 'goodbyeEditTitle'));
    assert.equal(modal.custom_id, 'welcomeEdit:goodbye:9');
    assert.equal(modal.components[0].components[0].value, 'Bye {username}');
    assert.equal(modal.components[1].components[0].value, 'https://x.io/b.gif');
    assert.deepEqual(modal, buildModal('goodbye', '9', settings, locale).toJSON());
  }
});
test('goodbye modal clears only goodbye image and rejects unsafe URLs', async () => {
  const patches = [];
  const c = {
    guildConfig: { patch: (g, s, p) => patches.push(p), get: () => ({ language: 'en' }) },
    localization: { t: (g, k) => k, locale: () => 'en' },
    logger: { warn() {}, error() {} },
  };
  const i = (url) => ({
    isModalSubmit: () => true,
    customId: 'welcomeEdit:goodbye:9',
    user: { id: '9' },
    guildId: 'g',
    guild: { members: { fetch: async () => ({ permissions: { has: () => true } }) } },
    fields: {
      getTextInputValue: (key) => {
        if (key === 'title') throw new Error('legacy');
        return key === 'image' ? url : 'Bye';
      },
    },
    reply: async () => {},
  });
  await createWelcomeEditHandler(c)(i(''));
  await createWelcomeEditHandler(c)(i('http://x.io/b.gif'));
  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0], {
    goodbyeMessage: 'Bye',
    goodbyeCustom: true,
    goodbyeImage: undefined,
  });
});
test('goodbye preview, test and leaving event use goodbye text image and member title without pinging', async () => {
  const db = openDatabase(':memory:');
  try {
    const guildConfig = new GuildConfig(new GuildSettings(db));
    const s = makeGuild();
    const actor = {
      id: '100000000000000009',
      guild: s.guild,
      displayName: 'Leaving member',
      user: { username: 'leaver' },
      permissions: { has: () => true },
    };
    s.guild.members.fetch = async () => actor;
    guildConfig.patch('g', 'welcome', {
      channelId: '100000000000000001',
      goodbyeEnabled: true,
      goodbyeMessage: 'Bye {username}',
      goodbyeCustom: true,
      goodbyeImage: 'https://x.io/b.gif',
      message: 'WELCOME',
      image: 'https://x.io/w.png',
      mentionMember: true,
    });
    const c = { guildConfig, config: { memberEventsEnabled: true }, logger: { warn() {} } };
    let sub = 'preview',
      reply;
    const i = {
      guild: s.guild,
      guildId: 'g',
      member: actor,
      user: { id: actor.id, username: 'leaver' },
      options: { getSubcommand: () => sub },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => {
        reply = p;
      },
    };
    await goodbye.execute(i, c);
    assert.equal(reply.embeds[0].data.description, 'Bye leaver');
    assert.equal(reply.embeds[0].data.title, 'Leaving member');
    assert.equal(reply.embeds[0].data.image.url, 'https://x.io/b.gif');
    sub = 'test';
    await goodbye.execute(i, c);
    await createMemberMessageHandler(c, 'goodbye')(actor);
    for (const p of s.sent) {
      assert.equal(p.embeds[0].data.description, 'Bye leaver');
      assert.equal(p.embeds[0].data.title, 'Leaving member');
      assert.equal(p.embeds[0].data.image.url, 'https://x.io/b.gif');
      assert.deepEqual(p.allowedMentions, { parse: [], users: [] });
    }
    assert.equal(s.sent.length, 2);
    assert.equal(guildConfig.get('g').welcome.message, 'WELCOME');
    s.guild.members.fetch = async () => ({ ...actor, permissions: { has: () => false } });
    await assert.rejects(() => goodbye.execute(i, c), /userPermission/);
  } finally {
    db.close();
  }
});
