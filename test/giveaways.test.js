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
    user: { bot: false },
    permissions: { has: () => true },
    roles: { cache: new Map() },
  };
  const message = { id: 'message', author: { id: 'bot' }, edit: async (p) => edits.push(p) };
  const guild = {
    id: 'g',
    members: { fetch: async () => member, fetchMe: async () => member },
    roles: { fetch: async () => ({ id: 'role', guild: { id: 'g' } }) },
  };
  const channel = {
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
      return x.member;
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
