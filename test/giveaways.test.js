import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { Giveaways, sampleWinners } from '../src/services/giveaways.js';
import {
  GiveawayRunner,
  createGiveaway,
  createGiveawayButtonHandler,
} from '../src/services/giveawayDelivery.js';
import { Cooldowns } from '../src/services/cooldowns.js';
import { handleInteractionError } from '../src/utils/errors.js';
import command from '../src/commands/giveaway/giveaway.js';
const channelId = '100000000000000001',
  user1 = '100000000000000002',
  user2 = '100000000000000003';
const input = {
  guildId: 'g',
  channelId,
  prize: 'Book',
  winnerCount: 1,
  durationMs: 60000,
  interactionId: 'create',
};
function setup() {
  const db = openDatabase(':memory:');
  let now = Date.now();
  const giveaways = new Giveaways(db, () => now),
    guildConfig = new GuildConfig(new GuildSettings(db)),
    sent = [],
    edits = [],
    replies = [];
  const member = {
    guild: { id: 'g' },
    user: { bot: false },
    permissions: { has: () => true },
    roles: { cache: new Map() },
  };
  const message = { id: 'message', author: { id: 'bot' }, edit: async (p) => edits.push(p) };
  const guild = {
    id: 'g',
    client: { user: { id: 'bot' } },
    members: {
      fetch: async ({ user }) => ({ ...member, id: user }),
      fetchMe: async () => ({ ...member, id: 'bot', guild: { id: 'g' } }),
    },
    roles: { fetch: async () => ({ id: 'role', guild: { id: 'g' } }) },
  };
  const channel = {
    id: input.channelId,
    guildId: 'g',
    type: 0,
    permissionsFor: () => ({ has: () => true }),
    send: async (p) => {
      sent.push(p);
      return message;
    },
    messages: { fetch: async () => message },
  };
  guild.channels = { fetch: async () => channel };
  const client = { user: { id: 'bot' }, guilds: { fetch: async () => guild } };
  const context = {
    giveaways,
    guildConfig,
    cooldowns: new Cooldowns(),
    handleInteractionError,
    logger: { error: () => {}, warn: () => {} },
  };
  context.giveawayRunner = new GiveawayRunner(context, client);
  const i = {
    id: 'create',
    guild,
    guildId: 'g',
    channelId,
    user: { id: user1 },
    isButton: () => true,
    inGuild: () => true,
    customId: 'luna:giveaway:1',
    message,
    deferReply: async () => {
      i.deferred = true;
    },
    reply: async (p) => replies.push(p),
    editReply: async (p) => replies.push(p),
  };
  return {
    db,
    context,
    giveaways,
    guildConfig,
    guild,
    channel,
    member,
    message,
    client,
    i,
    sent,
    edits,
    replies,
    advance: (ms) => (now += ms),
  };
}
function create(x) {
  const id = x.giveaways.reserve(input);
  x.giveaways.activate(id, 'message');
  return id;
}
test('giveaway sampling is unique, bounded and uses an explicit random source', () => {
  assert.deepEqual(sampleWinners(['a', 'a', 'b'], 3, () => 0).sort(), ['a', 'b']);
  assert.deepEqual(sampleWinners([], 2), []);
  assert.throws(() => sampleWinners(['a', 'b'], 1, () => 8));
});
test('giveaway schema, duplicates and guild isolation fail closed', () => {
  const x = setup();
  try {
    create(x);
    assert.equal(x.giveaways.get(1, 'other'), undefined);
    assert.throws(() => x.giveaways.reserve(input));
    assert.throws(() => x.giveaways.reserve({ ...input, interactionId: 'two', winnerCount: 21 }));
    assert.throws(() => x.giveaways.reserve({ ...input, interactionId: 'two', durationMs: 1 }));
    assert.throws(() => x.giveaways.reserve({ ...input, interactionId: 'two', prize: ' ' }));
    assert.equal(x.giveaways.list('g').length, 1);
  } finally {
    x.db.close();
  }
});
test('entries deduplicate, reject late/foreign joins and preserve draw version', () => {
  const x = setup();
  try {
    create(x);
    assert.equal(x.giveaways.enter(1, 'g', user1), true);
    assert.equal(x.giveaways.enter(1, 'g', user1), false);
    assert.throws(() => x.giveaways.enter(1, 'other', user1));
    x.advance(60001);
    assert.throws(() => x.giveaways.enter(1, 'g', user2));
    const g = x.giveaways.draw(1, 'g', [user1, user2]);
    assert.deepEqual(JSON.parse(g.winners_json), [user1]);
    assert.equal(g.draw_version, 1);
    assert.equal(x.giveaways.draw(1, 'g', []).draw_version, 1);
    x.giveaways.endPublished(1, 1);
    assert.equal(x.giveaways.get(1, 'g').status, 'ended');
  } finally {
    x.db.close();
  }
});
test('rerolls exclude previous winners and can honestly have no eligible winners', () => {
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.giveaways.enter(1, 'g', user2);
    let g = x.giveaways.draw(1, 'g', [user1], { random: () => 0 });
    x.giveaways.endPublished(1, g.draw_version);
    g = x.giveaways.draw(1, 'g', [user1, user2], { reroll: true, random: () => 0 });
    assert.deepEqual(JSON.parse(g.winners_json), [user2]);
    x.giveaways.endPublished(1, g.draw_version);
    g = x.giveaways.draw(1, 'g', [user2], { reroll: true });
    assert.deepEqual(JSON.parse(g.winners_json), []);
  } finally {
    x.db.close();
  }
});
test('publication verifies permissions and preserves uncertain sends without repeat', async () => {
  const x = setup();
  try {
    const id = await createGiveaway(x.i, x.context, {
      channelId,
      prize: 'Book',
      winnerCount: 1,
      durationMs: 60000,
    });
    assert.equal(id, 1);
    assert.equal(x.giveaways.get(1, 'g').status, 'active');
    assert.deepEqual(x.sent[0].allowedMentions.parse, []);
    x.i.id = 'two';
    x.channel.send = async () => {
      throw new Error('network');
    };
    await assert.rejects(
      () =>
        createGiveaway(x.i, x.context, {
          channelId,
          prize: 'Book',
          winnerCount: 1,
          durationMs: 60000,
        }),
      /giveawaySendUncertain/,
    );
    assert.equal(x.giveaways.get(2, 'g').status, 'uncertain');
  } finally {
    x.db.close();
  }
});
test('button validates original message, current role and membership before join', async () => {
  const x = setup();
  try {
    create(x);
    const h = createGiveawayButtonHandler(x.context);
    x.i.message = { id: 'copied' };
    await h(x.i);
    assert.equal(x.giveaways.entries(1).length, 0);
    x.i.message = x.message;
    x.context.cooldowns.entries.clear();
    await h(x.i);
    assert.deepEqual(x.giveaways.entries(1), [user1]);
    x.i.user.id = user2;
    x.member.user.bot = true;
    await h(x.i);
    assert.equal(x.giveaways.entries(1).length, 1);
  } finally {
    x.db.close();
  }
});
test('runner revalidates entrants and preserves winners across edit failures', async () => {
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.giveaways.enter(1, 'g', user2);
    x.guild.members.fetch = async ({ user }) => {
      if (user === user2) throw { code: 10007 };
      return { ...x.member, id: user };
    };
    let attempts = 0;
    x.message.edit = async () => {
      attempts++;
      if (attempts === 1) throw new Error('network');
    };
    await assert.rejects(() => x.context.giveawayRunner.finish(1, 'g'));
    const saved = x.giveaways.get(1, 'g');
    assert.equal(saved.status, 'ending');
    assert.deepEqual(JSON.parse(saved.winners_json), [user1]);
    x.guild.members.fetch = async () => {
      throw new Error('should not draw again');
    };
    await x.context.giveawayRunner.finish(1, 'g');
    assert.equal(x.giveaways.get(1, 'g').draw_version, 1);
    assert.equal(x.giveaways.get(1, 'g').status, 'ended');
    assert.equal(attempts, 2);
  } finally {
    x.db.close();
  }
});
test('unverifiable eligibility pauses without choosing winners', async () => {
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.guild.members.fetch = async () => {
      throw new Error('network');
    };
    await assert.rejects(
      () => x.context.giveawayRunner.finish(1, 'g'),
      /giveawayEligibilityUnavailable/,
    );
    assert.equal(x.giveaways.get(1, 'g').status, 'active');
    assert.equal(x.giveaways.get(1, 'g').draw_version, 0);
  } finally {
    x.db.close();
  }
});
test('due runner recovers ending records, avoids duplicate timers and localizes results', async () => {
  const x = setup();
  try {
    x.guildConfig.setLanguage('g', 'hi');
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.advance(60001);
    await x.context.giveawayRunner.tick();
    assert.equal(x.giveaways.get(1, 'g').status, 'ended');
    assert.match(x.edits[0].embeds[0].data.description, /विजेता/);
    assert.equal(x.edits[0].components[0].toJSON().components[0].disabled, true);
    x.context.giveawayRunner.start();
    const timer = x.context.giveawayRunner.timer;
    x.context.giveawayRunner.start();
    assert.equal(timer, x.context.giveawayRunner.timer);
    x.context.giveawayRunner.stop();
  } finally {
    x.db.close();
  }
});
test('management five paths execute actual runner and paginated storage', async () => {
  const x = setup();
  try {
    let sub = 'start';
    x.i.options = {
      getSubcommand: () => sub,
      getChannel: () => ({ id: channelId }),
      getString: () => 'Book',
      getRole: () => null,
      getInteger: (name) => (name === 'page' ? null : 1),
    };
    for (const action of ['start', 'config', 'list', 'end', 'reroll']) {
      sub = action;
      await command.execute(x.i, x.context);
    }
    assert.equal(x.replies.length, 5);
    assert.equal(x.giveaways.get(1, 'g').status, 'ended');
    assert.equal(x.giveaways.get(1, 'g').draw_version, 2);
  } finally {
    x.db.close();
  }
});

test('giveaway eligibility rejects wrong fetched user instead of drawing from stale identity', async () => {
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.guild.members.fetch = async () => ({ ...x.member, id: user2 });
    await assert.rejects(
      () => x.context.giveawayRunner.finish(1, 'g'),
      /giveawayEligibilityUnavailable/,
    );
    assert.equal(x.giveaways.get(1, 'g').status, 'active');
    assert.equal(x.edits.length, 0);
  } finally {
    x.db.close();
  }
});
test('giveaway required role must be fresh exact selected identity and result edit refetches exact message', async () => {
  const x = setup();
  try {
    x.guild.roles.fetch = async (id, opts) => {
      assert.equal(opts.force, true);
      return { id: 'wrong', guild: { id: 'g' } };
    };
    await assert.rejects(
      () => createGiveaway(x.i, x.context, { ...input, requiredRoleId: user2 }),
      /giveawayRoleInvalid/,
    );
    assert.equal(x.sent.length, 0);
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.channel.messages.fetch = async (opts) => {
      assert.equal(opts.force, true);
      assert.equal(opts.message, 'message');
      return { ...x.message, id: 'wrong' };
    };
    await assert.rejects(() => x.context.giveawayRunner.finish(1, 'g'), /giveawayMessageInvalid/);
    assert.equal(x.edits.length, 0);
    assert.equal(x.giveaways.get(1, 'g').status, 'ending');
  } finally {
    x.db.close();
  }
});

test('self-entry withdrawal is active/deadline/guild scoped,idempotent and allows reentry', () => {
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.giveaways.enter(1, 'g', user2);
    assert.throws(() => x.giveaways.leave(1, 'other', user1));
    assert.throws(() => x.giveaways.leave(1, 'g', 'invalid'));
    assert(x.giveaways.leave(1, 'g', user1));
    assert.equal(x.giveaways.leave(1, 'g', user1), false);
    assert.deepEqual(x.giveaways.entries(1), [user2]);
    assert(x.giveaways.enter(1, 'g', user1));
    x.advance(60000);
    assert.throws(() => x.giveaways.leave(1, 'g', user1), /giveawayNotActive/);
    x.giveaways.draw(1, 'g', [user1, user2]);
    assert.throws(() => x.giveaways.leave(1, 'g', user1));
  } finally {
    x.db.close();
  }
});
test('giveawayleave exact current user private localized reply needs no management permission', async () => {
  const { default: leave } = await import('../src/commands/giveaway/giveawayleave.js');
  const { Localization } = await import('../src/services/localization.js');
  for (const language of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      create(x);
      x.giveaways.enter(1, 'g', user1);
      x.guildConfig.setLanguage('g', language);
      x.context.localization = new Localization(x.guildConfig);
      x.member.permissions.has = () => false;
      x.i.options = { getInteger: () => 1 };
      await leave.execute(x.i, x.context);
      assert.deepEqual(x.giveaways.entries(1), []);
      assert.deepEqual(x.replies[0].allowedMentions.parse, []);
      x.guild.members.fetch = async () => ({ ...x.member, id: user2 });
      await assert.rejects(() => leave.execute(x.i, x.context), /giveawayUserInvalid/);
    } finally {
      x.db.close();
    }
  }
});

test('giveaway creation rejects foreign moderator and postlookup permission loss before reservation', async () => {
  for (const kind of ['guild', 'permissionRace']) {
    const x = setup();
    try {
      const fetch = x.guild.members.fetch;
      let lost = false;
      x.guild.members.fetch = async (opts) => {
        const member = await fetch(opts);
        if (kind === 'guild') member.guild = { id: 'other' };
        if (lost) member.permissions = { has: () => false };
        return member;
      };
      const channels = x.guild.channels.fetch;
      x.guild.channels.fetch = async (...a) => {
        lost = true;
        return channels(...a);
      };
      await assert.rejects(() => createGiveaway(x.i, x.context, input), /userPermission/);
      assert.equal(x.sent.length, 0);
      assert.equal(x.giveaways.list('g').length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('giveawayleave refuses foreign current member without removing entry', async () => {
  const { default: leave } = await import('../src/commands/giveaway/giveawayleave.js');
  const x = setup();
  try {
    create(x);
    x.giveaways.enter(1, 'g', user1);
    x.i.options = { getInteger: () => 1 };
    x.guild.members.fetch = async () => ({ ...x.member, id: user1, guild: { id: 'other' } });
    await assert.rejects(() => leave.execute(x.i, x.context), /giveawayUserInvalid/);
    assert.deepEqual(x.giveaways.entries(1), [user1]);
  } finally {
    x.db.close();
  }
});

test('manual draw guard blocks permission loss before draw and before publishing saved winners', async () => {
  for (const stage of ['draw', 'publish']) {
    const x = setup();
    try {
      create(x);
      x.giveaways.enter(1, 'g', user1);
      let guards = 0;
      await assert.rejects(() =>
        x.context.giveawayRunner.finish(1, 'g', {
          authorize: async () => {
            if (++guards === (stage === 'draw' ? 1 : 2)) throw Error('lost authority');
          },
        }),
      );
      const saved = x.giveaways.get(1, 'g');
      assert.equal(saved.draw_version, stage === 'draw' ? 0 : 1);
      assert.equal(saved.status, stage === 'draw' ? 'active' : 'ending');
      assert.equal(x.edits.length, 0);
      assert.equal(x.context.giveawayRunner.busy.size, 0);
    } finally {
      x.db.close();
    }
  }
});
test('giveaway runner rejects foreign live guild/member and button rejects foreign member without draw/entry', async () => {
  for (const kind of ['guild', 'member', 'button']) {
    const x = setup();
    try {
      create(x);
      if (kind !== 'button') x.giveaways.enter(1, 'g', user1);
      if (kind === 'guild') x.client.guilds.fetch = async () => ({ ...x.guild, id: 'other' });
      else
        x.guild.members.fetch = async ({ user }) => ({
          ...x.member,
          id: user,
          guild: { id: 'other' },
        });
      if (kind === 'button') {
        await createGiveawayButtonHandler(x.context)(x.i);
        assert.deepEqual(x.giveaways.entries(1), []);
      } else {
        await assert.rejects(
          () => x.context.giveawayRunner.finish(1, 'g'),
          /giveawayEligibilityUnavailable/,
        );
        assert.equal(x.giveaways.get(1, 'g').draw_version, 0);
      }
      assert.equal(x.edits.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('giveaway activation requires one pending record and valid message identity', () => {
  const x = setup();
  try {
    const id = x.giveaways.reserve(input);
    for (const message of [null, undefined, '', 0])
      assert.throws(() => x.giveaways.activate(id, message), /identity/);
    assert.equal(x.giveaways.get(id, 'g').status, 'pending');
    x.giveaways.activate(id, 'message');
    assert.throws(() => x.giveaways.activate(id, 'other'), /not pending/);
    assert.throws(() => x.giveaways.activate(999, 'message'), /not pending/);
    assert.equal(x.giveaways.get(id, 'g').message_id, 'message');
  } finally {
    x.db.close();
  }
});
test('accepted giveaway send with no returned identity marks uncertain and never repeats source', async () => {
  const x = setup();
  try {
    x.channel.send = async (p) => {
      x.sent.push(p);
      return {};
    };
    await assert.rejects(() => createGiveaway(x.i, x.context, input), /giveawayStorageUncertain/);
    assert.equal(x.giveaways.get(1, 'g').status, 'uncertain');
    await assert.rejects(() => createGiveaway(x.i, x.context, input));
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});
