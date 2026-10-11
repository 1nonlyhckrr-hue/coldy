import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { AntinukeAlerts, createAntinukeHandler } from '../src/services/antinuke.js';
import command from '../src/commands/antinuke/antinuke.js';
import { translate } from '../src/services/localization.js';
const ids = {
    actor: '100000000000000001',
    owner: '100000000000000002',
    bot: '100000000000000003',
    channel: '100000000000000004',
  },
  now = Date.now();
const guild = { id: 'g', ownerId: ids.owner, client: { user: { id: ids.bot } } };
const entry = (n, extra = {}) => ({
  id: String(100000000000000100n + BigInt(n)),
  executorId: ids.actor,
  action: AuditLogEvent.ChannelDelete,
  createdTimestamp: now,
  ...extra,
});
function setup() {
  const db = openDatabase(':memory:'),
    r = new AntinukeAlerts(db);
  r.patch('g', { enabled: true, channelId: ids.channel, threshold: 2, windowSeconds: 60 });
  return { db, r };
}
test('antinuke off by default and requires configured channel', () => {
  const db = openDatabase(':memory:');
  try {
    const r = new AntinukeAlerts(db);
    assert.equal(r.record(entry(1), guild, now), null);
    r.patch('g', { enabled: true });
    assert.equal(r.record(entry(1), guild, now), null);
  } finally {
    db.close();
  }
});
test('audit mixed-action threshold is replay safe and one incident per actor/window', () => {
  const { db, r } = setup();
  try {
    assert.equal(r.record(entry(1), guild, now), null);
    assert.equal(r.record(entry(1), guild, now), null);
    const incident = r.record(entry(2, { action: AuditLogEvent.RoleDelete }), guild, now);
    assert.equal(incident.count, 2);
    assert.equal(r.record(entry(3), guild, now), null);
    assert.equal(r.incidents('g').length, 1);
    assert.equal(r.incidents('other').length, 0);
    assert.equal(r.record(entry(4), guild, now + 61000), null);
    assert(r.record(entry(5), guild, now + 61000));
  } finally {
    db.close();
  }
});
test('owner bot trust and unrelated/stale/unknown executor events excluded', () => {
  const { db, r } = setup();
  try {
    r.trust('g', '100000000000000009', true);
    for (const extra of [
      { executorId: ids.owner },
      { executorId: ids.bot },
      { executorId: '100000000000000009' },
      { executorId: null },
      { action: AuditLogEvent.MessageDelete },
      { createdTimestamp: now - 300001 },
      { createdTimestamp: now + 30001 },
      { id: 'bad' },
    ])
      assert.equal(r.record(entry(1, extra), guild, now), null);
    assert.equal(db.prepare('SELECT count(*) n FROM antinuke_events').get().n, 0);
  } finally {
    db.close();
  }
});
test('audit config validates thresholds/trust limits and cleanup preserves current records', () => {
  const { db, r } = setup();
  try {
    for (const changes of [
      { threshold: 1 },
      { threshold: 21 },
      { windowSeconds: 9 },
      { windowSeconds: 301 },
      { unknown: true },
    ])
      assert.throws(() => r.patch('g', changes));
    for (let n = 0; n < 20; n++) r.trust('g', String(100000000000000500n + BigInt(n)), true);
    assert.throws(() => r.trust('g', '100000000000000999', true));
    r.record(entry(1), guild, now);
    r.record(entry(2), guild, now);
    r.finish(1, 'alerted');
    r.cleanup(now + 31 * 86400000);
    assert.equal(r.incidents('g').length, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM antinuke_events').get().n, 0);
  } finally {
    db.close();
  }
});
test('audit handler sends localized no-ping alert once without any punishment API', async () => {
  const { db, r } = setup(),
    sent = [];
  const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => ({
          id: ids.channel,
          guildId: 'g',
          type: ChannelType.GuildText,
          permissionsFor: () => ({ has: () => true }),
          send: async (p) => sent.push(p),
        }),
      },
    },
    c = {
      antinuke: r,
      localization: { locale: () => 'hi', t: (_g, k, p) => translate('hi', k, p) },
      logger: { warn() {} },
    };
  try {
    const h = createAntinukeHandler(c);
    await h(entry(1), g);
    await h(entry(2), g);
    await h(entry(2), g);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].allowedMentions.parse, []);
    assert.match(sent[0].embeds[0].data.description, /दंड नहीं/);
    assert.equal(r.incidents('g')[0].status, 'alerted');
  } finally {
    db.close();
  }
});
test('alert channel rejection and uncertain send never repeat', async () => {
  for (const missing of [true, false]) {
    const { db, r } = setup();
    let n = 0;
    const g = {
        ...guild,
        members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
        channels: {
          fetch: async () =>
            missing
              ? null
              : {
                  id: ids.channel,
                  guildId: 'g',
                  type: ChannelType.GuildText,
                  permissionsFor: () => ({ has: () => true }),
                  send: async () => {
                    n++;
                    throw new Error('SECRET');
                  },
                },
        },
      },
      c = {
        antinuke: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
        logger: { warn() {} },
      };
    try {
      const h = createAntinukeHandler(c);
      await h(entry(1), g);
      await h(entry(2), g);
      await h(entry(3), g);
      assert.equal(n, missing ? 0 : 1);
      assert.equal(r.incidents('g')[0].status, missing ? 'unavailable' : 'uncertain');
    } finally {
      db.close();
    }
  }
});
test('all six antinuke slash paths execute in three locales with fresh authorization', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const { db, r } = setup(),
      replies = [],
      g = {
        ...guild,
        members: {
          fetch: async ({ user }) => ({
            id: user,
            guild: { id: 'g' },
            permissions: { has: () => true },
          }),
          fetchMe: async () => ({
            id: ids.bot,
            guild: { id: 'g' },
            permissions: { has: () => true },
          }),
        },
      },
      channel = {
        id: ids.channel,
        guildId: 'g',
        type: ChannelType.GuildText,
        permissionsFor: () => ({ has: () => true }),
      };
    g.channels = { fetch: async () => channel };
    const c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
    };
    let sub = 'enable';
    const i = {
      guildId: 'g',
      guild: g,
      user: { id: ids.actor },
      options: {
        getSubcommand: () => sub,
        getChannel: () => channel,
        getInteger: (n) => (n === 'count' ? 5 : 60),
        getUser: () => ({ id: ids.actor }),
        getBoolean: () => true,
      },
      deferReply: async () => {},
      editReply: async (p) => replies.push(p),
    };
    try {
      for (const action of ['enable', 'threshold', 'trust', 'config', 'incidents', 'disable']) {
        sub = action;
        await command.execute(i, c);
      }
      assert.equal(replies.length, 6);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
      g.members.fetch = async () => ({ permissions: { has: () => false } });
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});
test('audit runtime and View Audit Log gate prevent enabling', async () => {
  const { db, r } = setup();
  try {
    const c = {
        antinuke: r,
        config: { auditEventsEnabled: false },
        localization: { locale: () => 'en' },
      },
      i = {
        guildId: 'g',
        guild: {
          id: 'g',
          client: { user: { id: ids.bot } },
          channels: {
            fetch: async () => ({
              id: ids.channel,
              guildId: 'g',
              type: 0,
              permissionsFor: () => ({ has: () => true }),
            }),
          },
          members: {
            fetch: async () => ({
              id: ids.actor,
              guild: { id: 'g' },
              permissions: { has: () => true },
            }),
            fetchMe: async () => ({
              id: ids.bot,
              guild: { id: 'g' },
              permissions: { has: () => false },
            }),
          },
        },
        user: { id: ids.actor },
        options: { getSubcommand: () => 'enable', getChannel: () => ({ id: ids.channel }) },
        deferReply: async () => {},
      };
    await assert.rejects(() => command.execute(i, c), /antinukeRuntimeDisabled/);
    c.config.auditEventsEnabled = true;
    await assert.rejects(() => command.execute(i, c), /antinukeBotPermission/);
  } finally {
    db.close();
  }
});

test('stale trusted user can be removed without current member but adding still verifies', async () => {
  const { db, r } = setup();
  const actor = { id: ids.actor, guild: { id: 'g' }, permissions: { has: () => true } };
  const c = {
      antinuke: r,
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    },
    i = {
      guildId: 'g',
      guild: {
        id: 'g',
        members: { fetch: async ({ user }) => (user === ids.actor ? actor : null) },
      },
      user: { id: ids.actor },
      options: {
        getSubcommand: () => 'trust',
        getUser: () => ({ id: '100000000000000009' }),
        getBoolean: () => false,
      },
      deferReply: async () => {},
      editReply: async () => {},
    };
  try {
    r.trust('g', '100000000000000009', true);
    await command.execute(i, c);
    assert.equal(r.get('g').trustedUsers.length, 0);
    i.options.getBoolean = () => true;
    await assert.rejects(() => command.execute(i, c), /antinukeUserInvalid/);
  } finally {
    db.close();
  }
});

test('antinuke admin identity and enable lookup races leave configuration unchanged', async () => {
  for (const kind of ['actor', 'guild', 'permissionRace', 'runtimeRace', 'bot']) {
    const { db, r } = setup();
    try {
      r.patch('g', { enabled: false });
      let allowed = true;
      const actor = {
          id: kind === 'actor' ? 'wrong' : ids.actor,
          guild: { id: 'g' },
          permissions: { has: () => allowed },
        },
        bot = {
          id: kind === 'bot' ? 'wrong' : ids.bot,
          guild: { id: 'g' },
          permissions: { has: () => true },
        };
      const c = {
        antinuke: r,
        config: { auditEventsEnabled: true },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
      const i = {
        guildId: 'g',
        user: { id: ids.actor },
        deferReply: async () => {},
        options: { getSubcommand: () => 'enable', getChannel: () => ({ id: ids.channel }) },
        guild: {
          id: kind === 'guild' ? 'other' : 'g',
          client: { user: { id: ids.bot } },
          members: { fetch: async () => actor, fetchMe: async () => bot },
          channels: {
            fetch: async () => {
              if (kind === 'permissionRace') allowed = false;
              if (kind === 'runtimeRace') c.config.auditEventsEnabled = false;
              return {
                id: ids.channel,
                guildId: 'g',
                type: 0,
                permissionsFor: () => ({ has: () => true }),
              };
            },
          },
        },
      };
      await assert.rejects(() => command.execute(i, c));
      assert.equal(r.get('g').enabled, false);
    } finally {
      db.close();
    }
  }
});
test('antinuke trust verifies member guild and repeats admin authority after target lookup', async () => {
  for (const foreign of [true, false]) {
    const { db, r } = setup();
    try {
      let allowed = true;
      const c = {
        antinuke: r,
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
      const i = {
        guildId: 'g',
        user: { id: ids.actor },
        deferReply: async () => {},
        options: {
          getSubcommand: () => 'trust',
          getUser: () => ({ id: ids.owner }),
          getBoolean: () => true,
        },
        guild: {
          id: 'g',
          members: {
            fetch: async ({ user }) => {
              if (user === ids.actor)
                return { id: user, guild: { id: 'g' }, permissions: { has: () => allowed } };
              allowed = false;
              return { id: user, guild: { id: foreign ? 'other' : 'g' } };
            },
          },
        },
      };
      await assert.rejects(() => command.execute(i, c));
      assert.deepEqual(r.get('g').trustedUsers, []);
    } finally {
      db.close();
    }
  }
});
