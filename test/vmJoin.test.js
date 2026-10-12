import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { VoiceMaster, privateVoiceOverwrites } from '../src/services/voiceMaster.js';
import { VoiceReadiness } from '../src/services/voiceReadiness.js';
import {
  VoiceJoin,
  createVoiceJoinHandler,
  createVoiceCleanupHandler,
} from '../src/services/vmJoin.js';
import command from '../src/commands/voicemaster/vmjoin.js';
const g = '100000000000000001',
  u = '100000000000000002',
  b = '100000000000000003',
  cat = '100000000000000004',
  lobby = '100000000000000005',
  dest = '100000000000000006',
  a = '100000000000000007';
function setup() {
  const db = openDatabase(':memory:'),
    v = new VoiceMaster(db),
    j = new VoiceJoin(db),
    ready = new VoiceReadiness(),
    calls = [];
  ready.initialReady();
  let current = lobby;
  const member = {
      id: u,
      guild: { id: g },
      user: { bot: false },
      permissions: { has: () => true },
      voice: {
        setChannel: async (channel) => {
          calls.push('move');
          current = channel.id;
        },
      },
    },
    actor = { id: a, guild: { id: g }, permissions: { has: () => true } },
    bot = { id: b, guild: { id: g }, permissions: { has: () => true } },
    category = {
      id: cat,
      guildId: g,
      type: ChannelType.GuildCategory,
      permissionsFor: () => ({ has: () => true }),
    },
    source = {
      id: lobby,
      guildId: g,
      type: ChannelType.GuildVoice,
      permissionsFor: () => ({ has: () => true }),
    },
    channel = {
      id: dest,
      guildId: g,
      parentId: cat,
      type: ChannelType.GuildVoice,
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: {
        cache: new Map(
          privateVoiceOverwrites(g, b, u).map((r) => [
            r.id,
            {
              type: r.type,
              allow: { bitfield: (r.allow ?? []).reduce((a, b) => a | b, 0n) },
              deny: { bitfield: (r.deny ?? []).reduce((a, b) => a | b, 0n) },
            },
          ]),
        ),
      },
    },
    client = { user: { id: b }, isReady: () => true },
    guild = {
      id: g,
      afkChannelId: null,
      members: {
        fetch: async ({ user }) => (user === a ? actor : member),
        fetchMe: async () => bot,
      },
      channels: {
        fetch: async (id) => (id === cat ? category : id === lobby ? source : channel),
        create: async () => {
          calls.push('create');
          return channel;
        },
      },
      voiceStates: { fetch: async () => ({ id: u, guild: { id: g }, channelId: current }) },
    },
    state = { guild, client, id: u, channelId: lobby },
    old = { guild, client, id: u, channelId: null },
    c = {
      voiceMaster: v,
      voiceJoin: j,
      voiceReadiness: ready,
      config: { voiceEventsEnabled: true },
      logger: { warn: (...a) => process.env.DBG && console.log(JSON.stringify(a)) },
      guildConfig: { get: () => ({ language: 'en' }) },
    };
  v.setup(g, cat);
  return {
    db,
    v,
    j,
    c,
    member,
    actor,
    bot,
    category,
    source,
    channel,
    guild,
    state,
    old,
    calls,
    join: () => j.set(g, lobby, a),
    setCurrent: (x) => (current = x),
  };
}
test('vmjoin policy isolatedpersistent revision off keeps move receipts restart uncertain', () => {
  const s = setup();
  try {
    assert.equal(s.j.get(g), null);
    s.join();
    assert.equal(new VoiceJoin(s.db).get(g).channel_id, lobby);
    const rev = s.j.get(g).revision;
    s.join();
    assert.notEqual(s.j.get(g).revision, rev);
    s.j.reserve(g, u, dest);
    s.j.recover();
    assert.equal(s.db.prepare('SELECT status FROM vm_join_moves').get().status, 'uncertain');
    s.j.off(g);
    assert.equal(s.j.get(g), null);
    assert.equal(s.db.prepare('SELECT count(*) n FROM vm_join_moves').get().n, 1);
  } finally {
    s.db.close();
  }
});
test('vmjoin exact native futurejoin creates private ownedchannel moves once observed replay ignored', async () => {
  const s = setup();
  try {
    s.join();
    const h = createVoiceJoinHandler(s.c);
    await h(s.old, s.state);
    assert.deepEqual(s.calls, ['create', 'move']);
    assert.equal(s.v.owned(g, u).status, 'active');
    assert.equal(s.db.prepare('SELECT status FROM vm_join_moves').get().status, 'completed');
    await h(s.old, s.state);
    assert.equal(s.calls.length, 2);
  } finally {
    s.db.close();
  }
});
test('vmjoin bot member actor permission voice readiness AFK lobby wrongguild guard noeffects', async () => {
  for (const change of [
    (s) => (s.member.user.bot = true),
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.source.type = ChannelType.GuildStageVoice),
    (s) => s.c.voiceReadiness.disconnected(0),
    (s) => s.setCurrent(null),
    (s) => (s.source.guildId = 'other'),
    (s) => (s.c.config.voiceEventsEnabled = false),
  ]) {
    const s = setup();
    try {
      s.join();
      change(s);
      await createVoiceJoinHandler(s.c)(s.old, s.state);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('vmjoin policyrace precreate prevents create uncertaincreation blocks later no blindretry', async () => {
  const s = setup();
  try {
    s.join();
    s.guild.channels.fetch = async (id) => {
      if (id === cat) {
        s.j.off(g);
        return s.category;
      }
      return s.source;
    };
    await createVoiceJoinHandler(s.c)(s.old, s.state);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
  const t = setup();
  try {
    t.join();
    t.guild.channels.create = async () => {
      t.calls.push('attempt');
      throw Error('network');
    };
    const h = createVoiceJoinHandler(t.c);
    await h(t.old, t.state);
    await h(t.old, t.state);
    assert.deepEqual(t.calls, ['attempt']);
    assert.equal(t.v.owned(g, u).status, 'uncertain');
  } finally {
    t.db.close();
  }
});
test('vmjoin movedaway aftercreate leaves trackedchannel no forcedmove uncertainmove frozen', async () => {
  const s = setup();
  try {
    s.join();
    s.guild.channels.create = async () => {
      s.calls.push('create');
      s.setCurrent(null);
      return s.channel;
    };
    await createVoiceJoinHandler(s.c)(s.old, s.state);
    assert.deepEqual(s.calls, ['create']);
    assert.equal(s.v.owned(g, u).status, 'active');
  } finally {
    s.db.close();
  }
  const t = setup();
  try {
    t.join();
    t.member.voice.setChannel = async () => {
      t.calls.push('moveattempt');
      throw Error('network');
    };
    const h = createVoiceJoinHandler(t.c);
    await h(t.old, t.state);
    await h(t.old, t.state);
    assert.deepEqual(t.calls, ['create', 'moveattempt']);
    assert.equal(t.db.prepare('SELECT status FROM vm_join_moves').get().status, 'uncertain');
  } finally {
    t.db.close();
  }
});
test('vmjoin3paths private3locale confirm freshauthority manualexistinglobbyguard', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        guild: s.guild,
        guildId: g,
        client: s.state.client,
        user: { id: a },
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => s.source,
          getBoolean: () => true,
        },
        reply: async (p) => (reply = p),
      };
      for (const sub of ['setup', 'config', 'off']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      i.options.getSubcommand = () => 'setup';
      i.options.getBoolean = () => false;
      await assert.rejects(() => command.execute(i, s.c), /vmJoinConfirm/);
      i.options.getBoolean = () => true;
      s.actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, s.c), /userPermission/);
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});

test('vmjoin cleanup deletes only an empty join-created channel, never lobby or hand-made ones', async () => {
  const s = setup();
  try {
    s.join();
    const h = createVoiceJoinHandler(s.c);
    await h(s.old, s.state);
    const row = s.v.owned(g, u);
    assert.equal(row.status, 'active');
    let deleted = 0;
    s.channel.delete = async () => deleted++;
    s.guild.voiceStates.cache = new Map([[u, { channelId: s.channel.id }]]);
    const cleanup = createVoiceCleanupHandler(s.c, { graceMs: 0 });
    const leave = { guild: s.guild, client: s.state.client, id: u, channelId: s.channel.id };
    const gone = { guild: s.guild, client: s.state.client, id: u, channelId: null };
    await cleanup(leave, gone);
    assert.equal(deleted, 0, 'occupied channel is kept');
    s.guild.voiceStates.cache = new Map([[u, { channelId: null }]]);
    await cleanup({ ...leave, channelId: lobby }, gone);
    assert.equal(deleted, 0, 'lobby is never deleted');
    s.db.prepare('DELETE FROM vm_join_moves').run();
    await cleanup(leave, gone);
    assert.equal(deleted, 0, 'channel without a join receipt is never deleted');
    s.db.prepare('INSERT INTO vm_join_moves VALUES(?,?,?,?)').run(g, u, s.channel.id, 'completed');
    await cleanup(leave, gone);
    assert.equal(deleted, 1);
    assert.equal(s.v.inspectRecord(g, row.id)?.status ?? 'closed', 'closed');
  } finally {
    s.db.close();
  }
});
