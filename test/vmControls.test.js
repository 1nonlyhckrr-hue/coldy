import {
  VoiceControls,
  privateVoiceControls,
  createVoiceControlHandler,
} from '../src/services/vmControls.js';
import { VoiceReadiness } from '../src/services/voiceReadiness.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { VoiceMaster, privateVoiceOverwrites } from '../src/services/voiceMaster.js';
import { ModerationCases } from '../src/services/moderation.js';
import { ChannelType } from 'discord.js';
import { translate } from '../src/services/localization.js';
const ids = {
  owner: '100000000000000001',
  bot: '100000000000000002',
  category: '100000000000000003',
  channel: '100000000000000004',
};
const overwrites = (rules) =>
  new Map(
    rules.map((r) => [
      r.id,
      {
        type: r.type,
        allow: { bitfield: (r.allow ?? []).reduce((a, b) => a | b, 0n) },
        deny: { bitfield: (r.deny ?? []).reduce((a, b) => a | b, 0n) },
      },
    ]),
  );
function setup() {
  const voiceReadiness = new VoiceReadiness();
  voiceReadiness.initialReady();
  const db = openDatabase(':memory:'),
    calls = [],
    v = new VoiceMaster(db),
    owner = {
      id: ids.owner,
      guild: { id: 'g' },
      user: { bot: false },
      permissions: { has: () => true },
    },
    bot = { id: ids.bot, guild: { id: 'g' }, permissions: { has: () => true } },
    category = {
      id: ids.category,
      client: { isReady: () => true, user: { id: ids.bot } },
      guildId: 'g',
      type: ChannelType.GuildCategory,
      permissionsFor: () => ({ has: () => true }),
    },
    channel = {
      id: ids.channel,
      guildId: 'g',
      type: ChannelType.GuildVoice,
      members: new Map(),
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: { cache: overwrites(privateVoiceOverwrites('g', ids.bot, ids.owner)) },
      setName: async (...a) => calls.push(['rename', ...a]),
      setUserLimit: async (...a) => calls.push(['limit', ...a]),
      delete: async (...a) => calls.push(['delete', ...a]),
    };
  const i = {
      id: 'i1',
      client: { isReady: () => true, user: { id: ids.bot } },
      guildId: 'g',
      user: { id: ids.owner },
      appPermissions: { has: () => true },
      guild: {
        id: 'g',
        voiceStates: { cache: new Map() },
        members: { fetch: async () => owner, fetchMe: async () => bot },
        channels: {
          fetch: async (id) => (id === ids.category ? category : channel),
          create: async (options) => {
            calls.push(['create', options]);
            return channel;
          },
        },
      },
    },
    c = {
      voiceControls: new VoiceControls(db),
      logger: { error: () => {}, warn: () => {} },
      config: { voiceEventsEnabled: true },
      voiceReadiness,
      voiceMaster: v,
      cases: new ModerationCases(db),
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    };
  Object.defineProperty(i.guild.voiceStates, 'cache', {
    configurable: true,
    get: () => new Map([...channel.members.keys()].map((id) => [id, { channelId: channel.id }])),
  });
  v.setup('g', ids.category);
  const row = v.reserve('g', ids.owner, 'initial');
  v.created(row, ids.channel);
  v.activate(row, ids.channel);
  return { db, c, i, calls, owner, bot, category, channel };
}
test('private ownercontrols three oneuse buttons bind guildownerrow token10min3locale no mutation', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.localization.locale = () => language;
      const p = await privateVoiceControls(s.i, s.c);
      assert.deepEqual(p.allowedMentions.parse, []);
      const buttons = p.components[0].toJSON().components;
      assert.equal(buttons.length, 3);
      assert.equal(s.calls.length, 0);
      for (const b of buttons) assert(b.custom_id.startsWith('luna:vm:'));
      const token = buttons[0].custom_id.split(':')[2],
        row = s.c.voiceControls.get(token);
      assert.equal(row.owner_id, ids.owner);
      assert.equal(row.channel_row, 1);
      assert.equal(row.status, 'ready');
    } finally {
      s.db.close();
    }
  }
});
function interaction(s, customId) {
  let result;
  return {
    ...s.i,
    customId,
    isButton: () => true,
    deferReply: async () => {},
    editReply: async (p) => (result = p),
    getResult: () => result,
  };
}
test('ownerbutton close only trackedemptychannel consumes persistentpanel duplicate no seconddelete', async () => {
  const s = setup();
  try {
    const p = await privateVoiceControls(s.i, s.c),
      buttons = p.components[0].toJSON().components,
      i = interaction(s, buttons[2].custom_id),
      h = createVoiceControlHandler(s.c);
    await h(i);
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0][0], 'delete');
    const token = i.customId.split(':')[2];
    assert.equal(s.c.voiceControls.get(token).status, 'completed');
    await h(i);
    assert.equal(s.calls.length, 1);
    assert(i.getResult().embeds.length);
  } finally {
    s.db.close();
  }
});
test('ownerbutton unknownnativeeffect paneluncertain replayblocked restartreservedfrozen', async () => {
  const s = setup();
  try {
    const p = await privateVoiceControls(s.i, s.c),
      i = interaction(s, p.components[0].toJSON().components[2].custom_id);
    s.channel.delete = async () => {
      s.calls.push(['attempt']);
      throw Error('network');
    };
    const h = createVoiceControlHandler(s.c);
    await h(i);
    await h(i);
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.voiceControls.get(i.customId.split(':')[2]).status, 'uncertain');
    const token = s.c.voiceControls.create('g', ids.owner, 1);
    s.c.voiceControls.reserve(token);
    s.c.voiceControls.recover();
    assert.equal(s.c.voiceControls.get(token).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('ownerbutton foreign owner guild expired staleownedrow malformed wrongkind refuse effects', async () => {
  for (const mutate of [
    (s, i) => (i.user = { id: 'foreign' }),
    (s, i) => (i.guildId = 'other'),
    (s, i) => (s.c.voiceControls.now = () => Date.now() + 700000),
    (s, i) => s.c.voiceMaster.status(1, 'closed'),
    (s, i) => (i.customId = 'luna:vm:bad:close'),
  ]) {
    const s = setup();
    try {
      const p = await privateVoiceControls(s.i, s.c),
        i = interaction(s, p.components[0].toJSON().components[2].custom_id);
      mutate(s, i);
      await createVoiceControlHandler(s.c)(i);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    const i = interaction(s, 'unrelated');
    assert.equal(await createVoiceControlHandler(s.c)(i), false);
  } finally {
    s.db.close();
  }
});
test('ownerbutton occupiedchannel guard not weakened invalidpermission before native consumespanel', async () => {
  for (const change of [
    (s) => s.channel.members.set('connected', {}),
    (s) => (s.bot.permissions.has = () => false),
    (s) => s.c.voiceReadiness.disconnected(0),
  ]) {
    const s = setup();
    try {
      const p = await privateVoiceControls(s.i, s.c),
        i = interaction(s, p.components[0].toJSON().components[0].custom_id);
      change(s);
      await createVoiceControlHandler(s.c)(i);
      assert.equal(s.calls.length, 0);
      assert.equal(s.c.voiceControls.get(i.customId.split(':')[2]).status, 'uncertain');
    } finally {
      s.db.close();
    }
  }
});
test('ownerbuttons lock and explicitlylabelledshareunlock preserve nativeoverwrite verification', async () => {
  for (const action of ['lock', 'unlock']) {
    const s = setup();
    try {
      s.channel.permissionOverwrites.set = async (rules) => {
        s.calls.push([action]);
        s.channel.permissionOverwrites.cache = overwrites(rules);
      };
      const p = await privateVoiceControls(s.i, s.c),
        button = p.components[0]
          .toJSON()
          .components.find((b) => b.custom_id.endsWith(':' + action)),
        i = interaction(s, button.custom_id);
      await createVoiceControlHandler(s.c)(i);
      assert.deepEqual(s.calls, [[action]]);
      assert.equal(s.c.voiceControls.get(i.customId.split(':')[2]).status, 'completed');
      assert.equal(
        s.c.voiceMaster.owned('g', ids.owner).public_access,
        action === 'unlock' ? 1 : 0,
      );
    } finally {
      s.db.close();
    }
  }
});
