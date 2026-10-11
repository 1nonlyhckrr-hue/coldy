import { VoiceReadiness } from '../src/services/voiceReadiness.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { voiceAction } from '../src/services/voice.js';
import command from '../src/commands/voice/voice.js';
const ids = {
  actor: '100000000000000001',
  bot: '100000000000000002',
  target: '100000000000000003',
  owner: '100000000000000004',
  source: '100000000000000005',
  dest: '100000000000000006',
};
function setup() {
  const voiceReadiness = new VoiceReadiness();
  voiceReadiness.initialReady();
  const db = openDatabase(':memory:'),
    calls = [];
  const member = (id, n) => ({
    id,
    guild: { id: 'g' },
    user: { bot: false },
    permissions: { has: () => true },
    roles: {
      highest: {
        position: n,
        comparePositionTo(r) {
          return this.position - r.position;
        },
      },
    },
    voice: {
      channelId: ids.source,
      setMute: async (...a) => calls.push(['mute', ...a]),
      setDeaf: async (...a) => calls.push(['deaf', ...a]),
      setChannel: async (...a) => calls.push(['channel', ...a]),
    },
  });
  const actor = member(ids.actor, 5),
    bot = member(ids.bot, 8),
    target = member(ids.target, 2);
  const channel = (id) => ({
    id,
    client: { isReady: () => true, user: { id: ids.bot } },
    guildId: 'g',
    type: ChannelType.GuildVoice,
    permissionsFor: () => ({ has: () => true }),
    members: new Map(),
    userLimit: 0,
  });
  const source = channel(ids.source),
    dest = channel(ids.dest);
  const i = {
    id: 'interaction1',
    client: { isReady: () => true, user: { id: ids.bot } },
    guildId: 'g',
    user: { id: ids.actor },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      ownerId: ids.owner,
      voiceStates: { cache: new Map() },
      members: {
        fetch: async ({ user }) => (user === ids.actor ? actor : target),
        fetchMe: async () => bot,
      },
      channels: { fetch: async (id) => (id === ids.source ? source : dest) },
    },
  };
  Object.defineProperty(i.guild.voiceStates, 'cache', {
    get: () =>
      new Map(
        [...source.members.keys()]
          .map((id) => [id, { channelId: source.id }])
          .concat([...dest.members.keys()].map((id) => [id, { channelId: dest.id }])),
      ),
  });
  return {
    db,
    c: { config: { voiceEventsEnabled: true }, voiceReadiness, cases: new ModerationCases(db) },
    i,
    calls,
    actor,
    bot,
    target,
    source,
    dest,
  };
}
const input = (action) => ({ action, targetId: ids.target, channelId: ids.dest });
test('all six voice effects use exact Discord method and persistent completed cases', async () => {
  for (const action of ['mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'move']) {
    const s = setup();
    try {
      const { id } = await voiceAction(s.i, s.c, input(action));
      assert.equal(s.calls.length, 1);
      const expected = ['mute', 'unmute'].includes(action)
        ? ['mute', action === 'mute']
        : ['deafen', 'undeafen'].includes(action)
          ? ['deaf', action === 'deafen']
          : ['channel', action === 'move' ? s.dest : null];
      assert.deepEqual(s.calls[0].slice(0, 2), expected);
      assert.equal(
        s.db.prepare('SELECT status,action FROM moderation_cases WHERE id=?').get(id).status,
        'completed',
      );
    } finally {
      s.db.close();
    }
  }
});
test('actor, bot, app and channel permissions fail before case or effect', async () => {
  for (const change of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.i.appPermissions.has = () => false),
    (s) => (s.source.permissionsFor = () => ({ has: () => false })),
    (s) => (s.dest.permissionsFor = () => ({ has: () => false })),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice refuses protected target, bots and unsafe hierarchy', async () => {
  for (const change of [
    (s) => (s.i.guild.ownerId = ids.target),
    (s) => (s.target.user.bot = true),
    (s) => (s.target.roles.highest.position = 8),
    (s) => (s.actor.roles.highest.position = 2),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => voiceAction(s.i, s.c, input('mute')));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice refuses absent, stage, foreign, same and full channels', async () => {
  for (const change of [
    (s) => (s.target.voice.channelId = null),
    (s) => (s.source.type = ChannelType.GuildStageVoice),
    (s) => (s.dest.type = ChannelType.GuildText),
    (s) => (s.dest.guildId = 'foreign'),
    (s) => (s.dest.id = ids.source),
    (s) => {
      s.dest.userLimit = 1;
      s.dest.members.set('other', {});
    },
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice refuses membership/channel race without following target', async () => {
  const s = setup();
  let n = 0;
  s.i.guild.members.fetch = async ({ user }) => {
    if (user === ids.actor) return s.actor;
    n++;
    return n === 1 ? s.target : { ...s.target, voice: { channelId: ids.dest } };
  };
  try {
    await assert.rejects(() => voiceAction(s.i, s.c, input('disconnect')), /voiceMoved/);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('voice duplicate IDs and storage failure prevent repeat effects', async () => {
  const s = setup();
  try {
    await voiceAction(s.i, s.c, input('mute'));
    await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /modDuplicate/);
    assert.equal(s.calls.length, 1);
    s.i.id = 'second';
    s.c.cases.begin = () => {
      throw new Error('db');
    };
    await assert.rejects(() => voiceAction(s.i, s.c, input('deafen')));
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('voice ambiguous failure is no-retry and definite rejection remains failed', async () => {
  for (const definite of [false, true]) {
    const s = setup();
    let n = 0;
    s.target.voice.setMute = async () => {
      n++;
      throw Object.assign(new Error('SECRET'), definite ? { code: 50013, status: 403 } : {});
    };
    try {
      await assert.rejects(
        () => voiceAction(s.i, s.c, input('mute')),
        (e) => !e.message.includes('SECRET'),
      );
      assert.equal(n, 1);
      assert.equal(
        s.db.prepare('SELECT status FROM moderation_cases').get().status,
        definite ? 'failed' : 'uncertain',
      );
      await assert.rejects(() => voiceAction(s.i, s.c, input('mute')));
      assert.equal(n, 1);
    } finally {
      s.db.close();
    }
  }
});
test('voice reports accepted action with failed final storage without repeating', async () => {
  const s = setup();
  s.c.cases.finish = () => {
    throw new Error('db');
  };
  try {
    await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /voiceStorageIncomplete/);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('voice input validation and command schema limits', async () => {
  assert.equal(command.data.toJSON().options.length, 6);
  assert.equal(command.cooldownMs, 5000);
  const s = setup();
  try {
    for (const bad of [
      { action: 'all', targetId: ids.target },
      { action: 'mute', targetId: 'bad' },
      { ...input('mute'), reason: ' ' },
      { ...input('move'), channelId: 'bad' },
      { ...input('mute'), reason: 'x'.repeat(401) },
    ])
      await assert.rejects(() => voiceAction(s.i, s.c, bad));
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('voice wrapper executes all six paths in every locale without pings', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const action of ['mute', 'unmute', 'deafen', 'undeafen', 'disconnect', 'move']) {
      const s = setup(),
        edits = [];
      s.c.localization = { locale: () => locale };
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => edits.push(p);
      s.i.options = {
        getSubcommand: () => action,
        getUser: () => ({ id: ids.target }),
        getChannel: () => ({ id: ids.dest }),
        getString: () => null,
      };
      try {
        await command.execute(s.i, s.c);
        assert.equal(edits.length, 1);
        assert.deepEqual(edits[0].allowedMentions.parse, []);
        assert.equal(edits[0].embeds.length, 1);
      } finally {
        s.db.close();
      }
    }
});

test('voice rechecks current target hierarchy and destination access after refresh', async () => {
  for (const mode of ['hierarchy', 'access']) {
    const s = setup();
    let n = 0;
    s.i.guild.members.fetch = async ({ user }) => {
      if (user === ids.actor) return s.actor;
      n++;
      if (n === 1) return s.target;
      const current = { ...s.target, roles: { highest: { position: 9 } } };
      return mode === 'hierarchy' ? current : { ...s.target, fresh: true };
    };
    if (mode === 'access') s.dest.permissionsFor = (member) => ({ has: () => !member.fresh });
    try {
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')));
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice runtime disabled fails before any voice/member reads or effects', async () => {
  const s = setup();
  try {
    s.c.config = { voiceEventsEnabled: false };
    await assert.rejects(
      () => voiceAction(s.i, s.c, { action: 'mute', targetId: ids.target }),
      /voiceRuntimeDisabled/,
    );
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});

test('voice effects require exact returned guild/actor/bot/target identity before case or mutation', async () => {
  for (const kind of ['guild', 'actor', 'actorGuild', 'bot', 'botGuild', 'client', 'targetGuild']) {
    const s = setup();
    try {
      if (kind === 'guild') s.i.guild.id = 'other';
      if (kind === 'actor') s.actor.id = ids.owner;
      if (kind === 'actorGuild') s.actor.guild.id = 'other';
      if (kind === 'bot') s.bot.id = ids.owner;
      if (kind === 'botGuild') s.bot.guild.id = 'other';
      if (kind === 'client') s.i.client.user.id = null;
      if (kind === 'targetGuild') s.target.guild.id = 'other';
      await assert.rejects(() => voiceAction(s.i, s.c, input('mute')));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice source and destination lookups must return exact requested channel IDs', async () => {
  for (const kind of ['source', 'destination']) {
    const s = setup();
    try {
      if (kind === 'source') s.source.id = ids.owner;
      else s.dest.id = ids.owner;
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')), /voiceChannelInvalid/);
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice final target refetch must preserve guild identity before effect even with matching channel and hierarchy', async () => {
  const s = setup();
  let targets = 0;
  try {
    s.i.guild.members.fetch = async ({ user }) =>
      user === ids.actor
        ? s.actor
        : ++targets === 2
          ? { ...s.target, guild: { id: 'other' } }
          : s.target;
    await assert.rejects(() => voiceAction(s.i, s.c, input('disconnect')), /voiceMoved/);
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});

test('voice final actor and bot refresh reject authority lost during channel lookup', async () => {
  for (const kind of ['actor', 'bot', 'actorGuild', 'botGuild']) {
    const s = setup();
    try {
      const fetch = s.i.guild.channels.fetch;
      s.i.guild.channels.fetch = async (id) => {
        if (kind === 'actor') s.actor.permissions.has = () => false;
        if (kind === 'bot') s.bot.permissions.has = () => false;
        if (kind === 'actorGuild') s.actor.guild.id = 'other';
        if (kind === 'botGuild') s.bot.guild.id = 'other';
        return fetch(id);
      };
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')));
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice final fresh actor hierarchy cannot borrow earlier higher role snapshot', async () => {
  const s = setup();
  let calls = 0;
  try {
    s.i.guild.members.fetch = async ({ user }) => {
      if (user !== ids.actor) return s.target;
      if (++calls === 1) return s.actor;
      return { ...s.actor, roles: { highest: { comparePositionTo: () => -1 } } };
    };
    await assert.rejects(() => voiceAction(s.i, s.c, input('mute')));
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});
test('voice destination filling while final principals refresh prevents move without case', async () => {
  const s = setup();
  let calls = 0;
  try {
    s.dest.userLimit = 1;
    s.i.guild.members.fetchMe = async () => {
      if (++calls === 2) s.dest.members.set('human', {});
      return s.bot;
    };
    await assert.rejects(() => voiceAction(s.i, s.c, input('move')), /voiceChannelFull/);
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});

test('voice uncertain action cannot be repeated through a fresh interaction for same target/type', async () => {
  const s = setup();
  let attempts = 0;
  try {
    s.target.voice.setMute = async () => {
      attempts++;
      throw Error('network');
    };
    await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /voiceActionUncertain/);
    s.i.id = 'fresh';
    await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /voicePriorUncertain/);
    assert.equal(attempts, 1);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 1);
  } finally {
    s.db.close();
  }
});
test('voice unresolved prior gate is scoped by guild,target and exact action type', async () => {
  for (const kind of ['same', 'guild', 'target', 'action']) {
    const s = setup();
    try {
      const id = s.c.cases.begin({
        guildId: kind === 'guild' ? 'other' : 'g',
        targetId: kind === 'target' ? ids.owner : ids.target,
        actorId: ids.actor,
        action: kind === 'action' ? 'voice_deafen' : 'voice_mute',
        reason: 'x',
        interactionId: 'prior',
      });
      s.c.cases.finish(id, 'uncertain');
      if (kind === 'same')
        await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /voicePriorUncertain/);
      else await voiceAction(s.i, s.c, input('mute'));
      assert.equal(s.calls.length, kind === 'same' ? 0 : 1);
    } finally {
      s.db.close();
    }
  }
});
test('voice pending cases block same type while failed/completed receipts permit new explicit request', async () => {
  for (const status of ['pending', 'failed', 'completed']) {
    const s = setup();
    try {
      const id = s.c.cases.begin({
        guildId: 'g',
        targetId: ids.target,
        actorId: ids.actor,
        action: 'voice_disconnect',
        reason: 'x',
        interactionId: 'prior',
      });
      if (status !== 'pending') s.c.cases.finish(id, status);
      if (status === 'pending')
        await assert.rejects(
          () => voiceAction(s.i, s.c, input('disconnect')),
          /voicePriorUncertain/,
        );
      else await voiceAction(s.i, s.c, input('disconnect'));
      assert.equal(s.calls.length, status === 'pending' ? 0 : 1);
    } finally {
      s.db.close();
    }
  }
});

test('voice move refuses unknown or invalid native capacity instead of assuming unlimited', async () => {
  for (const limit of [undefined, null, NaN, Infinity, -1, 100, 1.5, '0']) {
    const s = setup();
    try {
      s.dest.userLimit = limit;
      await assert.rejects(() => voiceAction(s.i, s.c, input('move')), /voiceChannelInvalid/);
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice move final capacity validity check rejects malformed limit changed during authority refresh', async () => {
  const s = setup();
  let calls = 0;
  try {
    s.i.guild.members.fetchMe = async () => {
      if (++calls === 2) s.dest.userLimit = undefined;
      return s.bot;
    };
    await assert.rejects(() => voiceAction(s.i, s.c, input('move')), /voiceChannelInvalid/);
    assert.equal(s.calls.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    s.db.close();
  }
});

test('voice audit reasons reject control characters before any native lookup or case creation', async () => {
  for (const reason of ['line\nbreak', 'a\u0000b', 'a\u001bb', 'a\u007fb', 'a\tb']) {
    const s = setup();
    let reads = 0;
    try {
      s.i.guild.members.fetch = async () => {
        reads++;
        throw Error('must not read');
      };
      await assert.rejects(
        () => voiceAction(s.i, s.c, { ...input('mute'), reason }),
        /modReasonBounds/,
      );
      assert.equal(reads, 0);
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('voice valid Unicode audit reason remains literal and trims only surrounding spaces', async () => {
  const s = setup();
  try {
    const reason = '  कारण: "explicit" $5 `literal`  ';
    await voiceAction(s.i, s.c, { ...input('mute'), reason });
    assert.equal(s.db.prepare('SELECT reason FROM moderation_cases').get().reason, reason.trim());
    assert(s.calls[0][2].endsWith(reason.trim()));
  } finally {
    s.db.close();
  }
});

test('voice target must be positively human in initial and final lookup;unknown bot status fails closed', async () => {
  for (const stage of ['initial', 'final'])
    for (const value of [undefined, null, 'false', 0]) {
      const s = setup();
      let targets = 0;
      try {
        if (stage === 'initial') s.target.user.bot = value;
        else
          s.i.guild.members.fetch = async ({ user }) =>
            user === ids.actor
              ? s.actor
              : ++targets === 2
                ? { ...s.target, user: { bot: value } }
                : s.target;
        await assert.rejects(() => voiceAction(s.i, s.c, input('mute')), /voiceBotTarget/);
        assert.equal(s.calls.length, 0);
        assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
      } finally {
        s.db.close();
      }
    }
});
test('voice malformed source channel identity fails before channel lookup without chasing target', async () => {
  for (const id of ['bad', '1', '1'.repeat(21), 123]) {
    const s = setup();
    let channels = 0;
    try {
      s.target.voice.channelId = id;
      s.i.guild.channels.fetch = async () => {
        channels++;
        throw Error('unexpected');
      };
      await assert.rejects(() => voiceAction(s.i, s.c, input('disconnect')), /voiceChannelInvalid/);
      assert.equal(channels, 0);
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
