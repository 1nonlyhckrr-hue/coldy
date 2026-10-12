import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { Jail, changeJail, setupJail } from '../src/services/jail.js';
import command from '../src/commands/moderation/jail.js';
const g = '100000000000000001',
  a = '100000000000000002',
  b = '100000000000000003',
  u = '100000000000000004',
  ch = '100000000000000005';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const member = (id) => ({
    id,
    guild: { id: g },
    user: { bot: false },
    moderatable: true,
    permissions: { has: (p) => p !== P.Administrator },
    roles: { highest: { comparePositionTo: () => 5 } },
    communicationDisabledUntilTimestamp: null,
  });
  const actor = member(a),
    bot = member(b),
    target = member(u);
  target.disableCommunicationUntil = async (until, reason) => {
    calls.push({ until, reason });
    target.communicationDisabledUntilTimestamp = until;
  };
  const channel = { id: ch, guildId: g, type: ChannelType.GuildText };
  const guild = {
    id: g,
    ownerId: a,
    fetch: async () => guild,
    members: { fetch: async ({ user }) => (user === a ? actor : target), fetchMe: async () => bot },
    channels: { fetch: async () => channel },
  };
  const i = {
      id: 'i',
      guild,
      guildId: g,
      user: { id: a },
      client: { user: { id: b } },
      appPermissions: { has: () => true },
    },
    c = {
      jail: new Jail(db),
      cases: new ModerationCases(db),
      guildConfig: { get: () => ({ language: 'en' }) },
    };
  return {
    db,
    c,
    i,
    target,
    actor,
    bot,
    channel,
    calls,
    configure: () => setupJail(i, c, { channelId: ch, confirm: true }),
    apply: () => changeJail(i, c, { userId: u, duration: '1h', confirm: true }),
    release: () => changeJail(i, c, { userId: u, release: true, confirm: true }),
  };
}
test('jail offdefault ownerconfirmed config persistence isolation no roles/overwrites', async () => {
  const s = setup();
  try {
    assert.equal(s.c.jail.config(g), null);
    await s.configure();
    assert.equal(new Jail(s.db).config(g).channel_id, ch);
    assert.equal(s.c.jail.config('foreign'), null);
    assert.equal(s.calls.length, 0);
    s.c.jail.reset(g);
    assert.equal(s.c.jail.config(g), null);
    s.i.guild.ownerId = 'foreign';
    await assert.rejects(() => s.configure(), /jailUnavailable/);
  } finally {
    s.db.close();
  }
});
test('jail exact absolute native timeout case and exactowned release no roles replaced', async () => {
  const s = setup();
  try {
    await s.configure();
    const r = await s.apply();
    assert.equal(s.calls[0].until, r.until);
    assert.equal(s.target.communicationDisabledUntilTimestamp, r.until);
    assert.equal(s.c.jail.get(g, u).status, 'active');
    assert.equal(s.c.cases.inspectCase(g, r.caseId).status, 'completed');
    s.i.id = 'release';
    await s.release();
    assert.equal(s.calls[1].until, null);
    assert.equal(s.c.jail.get(g, u).status, 'released');
    s.c.jail.reset(g);
  } finally {
    s.db.close();
  }
});
test('jail refuses existingtimeout and thirdpartytimeoutdrift no clobber or retry', async () => {
  const s = setup();
  try {
    await s.configure();
    s.target.communicationDisabledUntilTimestamp = Date.now() + 100000;
    await assert.rejects(() => s.apply(), /jailBlocked/);
    assert.equal(s.calls.length, 0);
    s.target.communicationDisabledUntilTimestamp = null;
    await s.apply();
    s.target.communicationDisabledUntilTimestamp += 1000;
    await assert.rejects(() => s.release(), /jailBlocked/);
    assert.equal(s.calls.length, 1);
    assert.throws(() => s.c.jail.reset(g), /jailBlocked/);
  } finally {
    s.db.close();
  }
});
test('jail freshtarget/native actor/bot/hierarchy/botuser/admin/foreign/confirm/duration guard', async () => {
  for (const change of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.bot.roles.highest.comparePositionTo = () => 0),
    (s) => (s.target.user.bot = true),
    (s) => (s.target.permissions.has = () => true),
    (s) => (s.target.guild.id = 'foreign'),
    (s) => (s.target.moderatable = false),
    (s) => (s.channel.type = ChannelType.GuildVoice),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(async () => {
        await s.configure();
        await s.apply();
      });
      assert.equal(s.calls.length, 0);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    await s.configure();
    await assert.rejects(() =>
      changeJail(s.i, s.c, { userId: u, duration: 'forever', confirm: true }),
    );
    await assert.rejects(
      () => changeJail(s.i, s.c, { userId: u, duration: '1h', confirm: false }),
      /jailConfirm/,
    );
  } finally {
    s.db.close();
  }
});
test('jail submittedunknown and postproof mismatch persistentuncertain restart no retry', async () => {
  for (const kind of ['network', 'proof']) {
    const s = setup();
    try {
      await s.configure();
      s.target.disableCommunicationUntil = async () => {
        s.calls.push('attempt');
        if (kind === 'network') throw Error('network');
      };
      await assert.rejects(() => s.apply(), /jailBlocked/);
      assert.equal(s.c.jail.get(g, u).status, 'uncertain');
      await assert.rejects(() => s.apply(), /jailBlocked/);
      await assert.rejects(() => s.release(), /jailBlocked/);
      assert.equal(s.calls.length, 1);
      s.db.prepare("UPDATE jail_members SET status='applying'").run();
      new Jail(s.db).recover();
      assert.equal(s.c.jail.get(g, u).status, 'uncertain');
    } finally {
      s.db.close();
    }
  }
});
test('jail due native deadline settles metadata only reset safe no automaticrole restoration', async () => {
  const s = setup();
  try {
    await s.configure();
    await s.apply();
    s.db.prepare('UPDATE jail_members SET until_ms=?').run(Date.now() - 1000);
    assert.equal(s.c.jail.list(g).total, 0);
    assert.equal(s.c.jail.get(g, u).status, 'expired');
    assert.equal(s.calls.length, 1);
    s.c.jail.reset(g);
  } finally {
    s.db.close();
  }
});
test('jail six commandpaths private localized safeembeds/attachments no mentions', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.guildConfig.get = () => ({ language });
      let reply;
      const i = {
        ...s.i,
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => ({ id: ch }),
          getUser: () => ({ id: u }),
          getString: (name) => (name === 'duration' ? '1h' : null),
          getBoolean: () => true,
        },
        reply: async (p) => (reply = p),
      };
      for (const sub of ['setup', 'config', 'apply', 'list', 'release', 'reset']) {
        i.id = sub;
        i.options.getSubcommand = () => sub;
        await command.execute(i, s.c);
        assert.equal(reply.flags, 64);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.files.length, 1);
        assert(reply.embeds[0].data.description.length > 0);
      }
    } finally {
      s.db.close();
    }
  }
});
