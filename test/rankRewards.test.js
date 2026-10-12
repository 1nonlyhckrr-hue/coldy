import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { MessageRanks } from '../src/services/leaderboard.js';
import { VoiceRanks } from '../src/services/voiceRanks.js';
import {
  RankRewards,
  configureRankReward,
  claimRankReward,
  eligibleRankRewards,
  removeRankReward,
} from '../src/services/rankRewards.js';
import command from '../src/commands/leaderboard/rankreward.js';
const g = '100000000000000001',
  u = '100000000000000002',
  b = '100000000000000003',
  r = '100000000000000004';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    actor = {
      id: u,
      guild: { id: g },
      user: { bot: false },
      permissions: { has: () => true },
      roles: { cache: new Map(), highest: { comparePositionTo: () => 5 } },
    },
    bot = {
      id: b,
      guild: { id: g },
      permissions: { has: () => true },
      roles: { highest: { comparePositionTo: () => 5 } },
    },
    role = { id: r, guild: { id: g }, managed: false, permissions: new PermissionsBitField(0n) };
  actor.roles.add = async (id) => {
    calls.push(id);
    actor.roles.cache.set(id, role);
  };
  const guild = {
      id: g,
      ownerId: u,
      fetch: async () => guild,
      members: { fetch: async () => actor, fetchMe: async () => bot },
      roles: { fetch: async () => role },
    },
    i = {
      guild,
      guildId: g,
      user: { id: u },
      client: { user: { id: b } },
      appPermissions: { has: () => true },
    },
    c = {
      rankRewards: new RankRewards(db),
      messageRanks: new MessageRanks(db),
      voiceRanks: new VoiceRanks(db),
      guildConfig: { get: () => ({ language: 'en' }) },
    };
  c.messageRanks.enable(g, true);
  c.voiceRanks.enable(g, true);
  db.prepare('INSERT INTO message_rank_daily VALUES(?,?,?,?)').run(
    g,
    u,
    new Date().toISOString().slice(0, 10),
    10,
  );
  c.voiceRanks.record(g, u, Date.now() - 120000, Date.now());
  return {
    db,
    c,
    i,
    actor,
    bot,
    role,
    calls,
    configure: (kind = 'messages', threshold = 10) =>
      configureRankReward(i, c, { roleId: r, kind, threshold, confirm: true }),
    claim: () => claimRankReward(i, c, { roleId: r, confirm: true }),
  };
}
test('reward offdefault boundedrules persistence/guildisolation ownerconfirm no nativegrant', async () => {
  const s = setup();
  try {
    assert.deepEqual(s.c.rankRewards.rules(g), []);
    await s.configure();
    assert.equal(new RankRewards(s.db).rules(g).length, 1);
    assert.deepEqual(s.c.rankRewards.rules('other'), []);
    assert.equal(s.calls.length, 0);
    s.i.guild.ownerId = 'other';
    await assert.rejects(() => s.configure(), /rankRewardUnavailable/);
  } finally {
    s.db.close();
  }
});
test('reward message/voice retainedthreshold confirmedone-shot exactroleproof removalkeepsrolesreceipts', async () => {
  for (const kind of ['messages', 'voice-minutes']) {
    const s = setup();
    try {
      await s.configure(kind, kind === 'messages' ? 10 : 2);
      const list = await eligibleRankRewards(s.i, s.c);
      assert.equal(list[0].eligible, true);
      await s.claim();
      assert.deepEqual(s.calls, [r]);
      assert.equal(s.c.rankRewards.receipt(g, u, r).status, 'granted');
      await assert.rejects(() => s.claim(), /rankRewardBlocked/);
      await removeRankReward(s.i, s.c, { roleId: r, confirm: true });
      assert(s.actor.roles.cache.has(r));
      assert.equal(s.c.rankRewards.receipt(g, u, r).status, 'granted');
      await s.configure(kind, 1);
      s.actor.roles.cache.delete(r);
      await assert.rejects(() => s.claim(), /rankRewardBlocked/);
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('reward permissions rolechange/managed/hierarchy/nativebot/foreignactor/input guards no grants', async () => {
  for (const change of [
    (s) => (s.role.permissions = new PermissionsBitField(P.ViewChannel)),
    (s) => (s.role.managed = true),
    (s) => (s.role.guild.id = 'other'),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.actor.guild.id = 'other'),
    (s) => (s.actor.user.bot = true),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => s.configure());
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    await assert.rejects(
      () =>
        configureRankReward(s.i, s.c, { roleId: r, kind: 'invites', threshold: 1, confirm: true }),
      /rankRewardInput/,
    );
    await assert.rejects(
      () =>
        configureRankReward(s.i, s.c, {
          roleId: r,
          kind: 'messages',
          threshold: 1,
          confirm: false,
        }),
      /rankRewardConfirm/,
    );
  } finally {
    s.db.close();
  }
});
test('reward optout/disabled/countreset/expiry/preexistingrole prevent automaticclaim', async () => {
  for (const change of [
    (s) => s.c.messageRanks.privacy(g, u, true),
    (s) => s.c.messageRanks.enable(g, false),
    (s) => s.c.messageRanks.resetMine(g, u),
    (s) => s.actor.roles.cache.set(r, s.role),
    (s) => s.db.prepare("UPDATE message_rank_daily SET day='2020-01-01'").run(),
  ]) {
    const s = setup();
    try {
      await s.configure();
      change(s);
      await assert.rejects(() => s.claim());
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
});
test('reward ambiguous/postproof/policyaftereffect freeze persistent no retry restartreserved', async () => {
  for (const kind of ['network', 'proof', 'policy']) {
    const s = setup();
    try {
      await s.configure();
      s.actor.roles.add = async (id) => {
        s.calls.push(id);
        if (kind === 'network') throw Error('network');
        if (kind === 'policy') {
          s.actor.roles.cache.set(id, s.role);
          s.c.messageRanks.enable(g, false);
        }
      };
      await assert.rejects(() => s.claim(), /rankRewardBlocked/);
      assert.equal(s.c.rankRewards.receipt(g, u, r).status, 'uncertain');
      await assert.rejects(() => s.claim(), /rankRewardBlocked/);
      assert.equal(s.calls.length, 1);
      s.db.prepare("UPDATE rank_reward_receipts SET status='reserved'").run();
      new RankRewards(s.db).recover();
      assert.equal(s.c.rankRewards.receipt(g, u, r).status, 'uncertain');
    } finally {
      s.db.close();
    }
  }
});
test('rewardfivepaths threelocales privateattachment branded no mentions no automaticrevoke', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        ...s.i,
        options: {
          getSubcommand: () => 'set',
          getRole: () => ({ id: r }),
          getString: () => 'messages',
          getInteger: () => 10,
          getBoolean: () => true,
        },
        reply: async (p) => (reply = p),
      };
      for (const sub of ['set', 'config', 'eligible', 'claim', 'remove']) {
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(reply.embeds[0].data.description);
        assert.equal(reply.files.length, 1);
      }
      assert(s.actor.roles.cache.has(r));
    } finally {
      s.db.close();
    }
  }
});
