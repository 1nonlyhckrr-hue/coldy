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
          send: async (p) => {
            sent.push(p);
            return { id: 'native-alert' };
          },
        }),
      },
    },
    c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
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
        config: { auditEventsEnabled: true },
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
      config: { auditEventsEnabled: true },
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
        config: { auditEventsEnabled: true },
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

test('audit alert finish requires one recorded reservation and terminal states cannot rewrite', () => {
  const { db, r } = setup();
  try {
    r.record(entry(1), guild, now);
    r.record(entry(2), guild, now);
    for (const status of ['alerted', 'uncertain', 'unavailable']) {
      db.prepare("UPDATE antinuke_incidents SET status='recorded' WHERE id=1").run();
      r.finish(1, status);
      assert.equal(r.incidents('g')[0].status, status);
      for (const next of ['alerted', 'uncertain', 'unavailable'])
        assert.throws(() => r.finish(1, next));
    }
    assert.throws(() => r.finish(999, 'alerted'));
    assert.throws(() => r.finish(1, 'bad'));
  } finally {
    db.close();
  }
});
test('accepted audit send missing native identity becomes uncertain without automatic replay', async () => {
  for (const returned of [undefined, {}, { id: '' }, { id: 42 }]) {
    const { db, r } = setup();
    let sends = 0;
    const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => ({
          id: ids.channel,
          guildId: 'g',
          type: 0,
          permissionsFor: () => ({ has: () => true }),
          send: async () => {
            sends++;
            return returned;
          },
        }),
      },
    };
    const h = createAntinukeHandler({
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      logger: { warn() {} },
    });
    try {
      await h(entry(1), g);
      await h(entry(2), g);
      await h(entry(2), g);
      assert.equal(sends, 1);
      assert.equal(r.incidents('g')[0].status, 'uncertain');
    } finally {
      db.close();
    }
  }
});
test('unresolved audit metadata excludes terminal/foreign rows and paginates oldest first', () => {
  const { db, r } = setup();
  try {
    for (let n = 0; n < 15; n++)
      db.prepare(
        'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
      ).run('g', ids.actor, 1, 2, n === 14 ? 'alerted' : 'uncertain', now + n);
    db.prepare(
      'INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,?,?)',
    ).run('other', ids.actor, 1, 2, 'recorded', now - 1);
    const first = r.unresolved('g', 1),
      second = r.unresolved('g', 2);
    assert.equal(first.length, 10);
    assert.equal(second.length, 4);
    assert(first[0].id < second[0].id);
    assert.equal(r.unresolved('other').length, 1);
    assert.deepEqual(Object.keys(first[0]), [
      'id',
      'actor_id',
      'event_count',
      'status',
      'created_at',
    ]);
    for (const p of [0, 11, 1.5, '1']) assert.throws(() => r.unresolved('g', p));
  } finally {
    db.close();
  }
});
test('unresolved audit slash is exact current manager gated private localized and stored-only', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const { db, r } = setup();
    try {
      r.record(entry(1), guild, now);
      r.record(entry(2), guild, now);
      let reply;
      const i = {
        guildId: 'g',
        guild: {
          id: 'g',
          members: {
            fetch: async () => ({
              id: 'actor',
              guild: { id: 'g' },
              permissions: { has: () => true },
            }),
          },
        },
        user: { id: 'actor' },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
        options: { getSubcommand: () => 'unresolved', getInteger: () => 1 },
      };
      const c = {
        antinuke: r,
        config: { auditEventsEnabled: true },
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      const before = r.incidents('g');
      await command.execute(i, c);
      assert.deepEqual(r.incidents('g'), before);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(
        reply.embeds[0].data.description.includes(translate(locale, 'antinukeState_recorded')),
      );
      i.guild.members.fetch = async () => ({
        id: 'wrong',
        guild: { id: 'g' },
        permissions: { has: () => true },
      });
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});

test('enable audit monitor rechecks exact manager after final async bot lookup before configuration mutation', async () => {
  for (const kind of ['permission', 'identity', 'guild', 'runtime']) {
    const { db, r } = setup();
    try {
      r.patch('g', { enabled: false });
      let allowed = true,
        changed = false;
      const g = {
          ...guild,
          members: {
            fetch: async () => ({
              id: changed && kind === 'identity' ? 'wrong' : ids.actor,
              guild: { id: changed && kind === 'guild' ? 'other' : 'g' },
              permissions: { has: () => allowed },
            }),
            fetchMe: async () => {
              changed = true;
              if (kind === 'permission') allowed = false;
              if (kind === 'runtime') c.config.auditEventsEnabled = false;
              return { id: ids.bot, guild: { id: 'g' }, permissions: { has: () => true } };
            },
          },
          channels: {
            fetch: async () => ({
              id: ids.channel,
              guildId: 'g',
              type: 0,
              permissionsFor: () => ({ has: () => true }),
            }),
          },
        },
        c = {
          antinuke: r,
          config: { auditEventsEnabled: true },
          localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
        },
        i = {
          guildId: 'g',
          guild: g,
          user: { id: ids.actor },
          options: { getSubcommand: () => 'enable', getChannel: () => ({ id: ids.channel }) },
          deferReply: async () => {},
          editReply: async () => {
            throw Error('unexpected reply');
          },
        };
      await assert.rejects(() => command.execute(i, c));
      assert.equal(r.get('g').enabled, false);
    } finally {
      db.close();
    }
  }
});
test('audit alert checks latest disabled destination/trust policy after lookup before send and preserves metadata without retry', async () => {
  for (const change of [
    { enabled: false },
    { channelId: '100000000000000009' },
    { trustedUsers: [ids.actor] },
  ]) {
    const { db, r } = setup();
    let sends = 0;
    try {
      const g = {
          ...guild,
          members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
          channels: {
            fetch: async () => {
              r.patch('g', change);
              return {
                id: ids.channel,
                guildId: 'g',
                type: 0,
                permissionsFor: () => ({ has: () => true }),
                send: async () => {
                  sends++;
                  return { id: 'native' };
                },
              };
            },
          },
        },
        h = createAntinukeHandler({
          antinuke: r,
          config: { auditEventsEnabled: true },
          localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
          logger: { warn() {} },
        });
      await h(entry(1), g);
      await h(entry(2), g);
      assert.equal(sends, 0);
      assert.equal(r.incidents('g')[0].status, 'unavailable');
      assert.equal(r.incidents('g')[0].actor_id, ids.actor);
      await h(entry(2), g);
      assert.equal(sends, 0);
    } finally {
      db.close();
    }
  }
});
test('audit alert owner change during destination lookup suppresses scheduled alert without punishment or rewritten policy', async () => {
  const { db, r } = setup();
  let sends = 0;
  try {
    const before = r.get('g'),
      g = {
        ...guild,
        members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
        channels: {
          fetch: async () => {
            g.ownerId = ids.actor;
            return {
              id: ids.channel,
              guildId: 'g',
              type: 0,
              permissionsFor: () => ({ has: () => true }),
              send: async () => {
                sends++;
              },
            };
          },
        },
      },
      h = createAntinukeHandler({
        antinuke: r,
        config: { auditEventsEnabled: true },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
        logger: { warn() {} },
      });
    await h(entry(1), g);
    await h(entry(2), g);
    assert.equal(sends, 0);
    assert.deepEqual(r.get('g'), before);
    assert.equal(r.incidents('g')[0].status, 'unavailable');
  } finally {
    db.close();
  }
});

test('antinuke alert finalized or deleted while native channel lookup waits cannot send stale incident', async () => {
  for (const status of ['uncertain', 'alerted', 'deleted']) {
    const { db, r } = setup();
    let sends = 0;
    const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => {
          if (status === 'deleted') db.prepare('DELETE FROM antinuke_incidents').run();
          else r.finish(1, status);
          return {
            id: ids.channel,
            guildId: 'g',
            type: ChannelType.GuildText,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {
              sends++;
              return { id: 'receipt' };
            },
          };
        },
      },
    };
    const c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      logger: { warn() {} },
    };
    try {
      const h = createAntinukeHandler(c);
      await h(entry(1), g);
      await h(entry(2), g);
      assert.equal(sends, 0);
      assert.equal(r.incidents('g')[0]?.status, status === 'deleted' ? undefined : status);
    } finally {
      db.close();
    }
  }
});
test('antinuke recorded gate exact guild/state and blank send receipt never reports alerted', async () => {
  const { db, r } = setup();
  let sends = 0;
  const g = {
    ...guild,
    members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
    channels: {
      fetch: async () => ({
        id: ids.channel,
        guildId: 'g',
        type: ChannelType.GuildText,
        permissionsFor: () => ({ has: () => true }),
        send: async () => {
          sends++;
          assert(r.recorded(1, 'g'));
          assert(!r.recorded(1, 'other'));
          return { id: ' ' };
        },
      }),
    },
  };
  const c = {
    antinuke: r,
    config: { auditEventsEnabled: true },
    localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
    logger: { warn() {} },
  };
  try {
    const h = createAntinukeHandler(c);
    await h(entry(1), g);
    await h(entry(2), g);
    assert.equal(sends, 1);
    assert.equal(r.incidents('g')[0].status, 'uncertain');
    assert(!r.recorded(1, 'g'));
  } finally {
    db.close();
  }
});

test('antinuke invalid audit clock cannot record event or mutate cleanup watermark/incident', () => {
  const { db, r } = setup();
  try {
    for (const clock of [null, NaN, Infinity, -1, 1.5, '1000']) {
      assert.equal(r.record(entry(1), guild, clock), null);
      assert.equal(r.lastCleanup, 0);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM antinuke_events').get().n, 0);
    assert.equal(r.incidents('g').length, 0);
    assert.equal(r.record(entry(1), guild, now), null);
    assert(r.record(entry(2), guild, now));
  } finally {
    db.close();
  }
});
test('antinuke invalid cleanup clock preserves event and incident records;zero clock is accepted', () => {
  const { db, r } = setup();
  try {
    r.record(entry(1), guild, now);
    r.record(entry(2), guild, now);
    const events = db.prepare('SELECT * FROM antinuke_events').all();
    const incidents = r.incidents('g');
    for (const clock of [null, NaN, Infinity, -1, 1.5, '1000']) {
      assert.throws(() => r.cleanup(clock), /clock/);
      assert.deepEqual(db.prepare('SELECT * FROM antinuke_events').all(), events);
      assert.deepEqual(r.incidents('g'), incidents);
    }
    r.cleanup(0);
    assert.deepEqual(r.incidents('g'), incidents);
  } finally {
    db.close();
  }
});

test('antinuke clock rollback cannot count future audit records into current threshold', () => {
  const { db, r } = setup();
  try {
    assert.equal(r.record(entry(1), guild, now), null);
    assert.equal(r.record(entry(2), guild, now - 1), null);
    assert.equal(r.incidents('g').length, 0);
    const incident = r.record(entry(3), guild, now - 1);
    assert.equal(incident.count, 2);
    assert.equal(r.incidents('g').length, 1);
  } finally {
    db.close();
  }
});
test('antinuke future stored incident cannot suppress current-window alert after clock rollback', () => {
  const { db, r } = setup();
  try {
    db.prepare(
      "INSERT INTO antinuke_incidents(guild_id,actor_id,action,event_count,status,created_at) VALUES(?,?,?,?,'recorded',?)",
    ).run('g', ids.actor, AuditLogEvent.ChannelDelete, 2, now + 1000);
    assert.equal(r.record(entry(1), guild, now), null);
    const incident = r.record(entry(2), guild, now);
    assert.equal(incident.count, 2);
    assert.equal(r.incidents('g').length, 2);
    assert.equal(r.record(entry(3), guild, now), null);
  } finally {
    db.close();
  }
});

test('antinuke enable rejects malformed runtime consent without activating stored alert policy', async () => {
  for (const flag of [undefined, null, 1, 'true', 'false', {}]) {
    const db = openDatabase(':memory:');
    try {
      const r = new AntinukeAlerts(db);
      const g = {
        ...guild,
        members: {
          fetch: async () => ({
            id: ids.actor,
            guild: { id: 'g' },
            permissions: { has: () => true },
          }),
        },
      };
      const i = {
        guild: g,
        guildId: 'g',
        user: { id: ids.actor },
        options: { getSubcommand: () => 'enable' },
        deferReply: async () => {},
        editReply: async () => {
          throw new Error('unexpected reply');
        },
      };
      const c = {
        antinuke: r,
        config: { auditEventsEnabled: flag },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      };
      await assert.rejects(() => command.execute(i, c), /antinukeRuntimeDisabled/);
      assert.equal(r.get('g').enabled, false);
      assert.equal(db.prepare('SELECT count(*) n FROM antinuke_config').get().n, 0);
    } finally {
      db.close();
    }
  }
});

test('antinuke runtime revoked initially or during channel validation cannot record/send new alert', async () => {
  for (const stage of ['initial', 'final']) {
    for (const flag of [false, undefined, null, 1, 'true', 'false', {}]) {
      const { db, r } = setup();
      let sends = 0;
      const c = {
        antinuke: r,
        config: { auditEventsEnabled: stage === 'initial' ? flag : true },
        localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
        logger: { warn() {} },
      };
      const g = {
        ...guild,
        members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
        channels: {
          fetch: async () => {
            c.config.auditEventsEnabled = flag;
            return {
              id: ids.channel,
              guildId: 'g',
              type: ChannelType.GuildText,
              permissionsFor: () => ({ has: () => true }),
              send: async () => {
                sends++;
                return { id: 'receipt' };
              },
            };
          },
        },
      };
      try {
        const h = createAntinukeHandler(c);
        await h(entry(1), g);
        await h(entry(2), g);
        assert.equal(sends, 0);
        assert.equal(r.incidents('g').length, stage === 'initial' ? 0 : 1);
        if (stage === 'final') assert.equal(r.incidents('g')[0].status, 'unavailable');
        assert.equal(
          db.prepare('SELECT count(*) n FROM antinuke_events').get().n,
          stage === 'initial' ? 0 : 2,
        );
      } finally {
        db.close();
      }
    }
  }
});

test('antinuke threshold/window policy changed during native lookup prevents stale alert with no retry', async () => {
  for (const change of [
    { threshold: 3 },
    { windowSeconds: 10 },
    { threshold: 20, windowSeconds: 300 },
  ]) {
    const { db, r } = setup();
    let sends = 0;
    const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => {
          r.patch('g', change);
          return {
            id: ids.channel,
            guildId: 'g',
            type: ChannelType.GuildText,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {
              sends++;
              return { id: 'receipt' };
            },
          };
        },
      },
    };
    const c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      logger: { warn() {} },
    };
    try {
      const h = createAntinukeHandler(c);
      await h(entry(1), g);
      await h(entry(2), g);
      await h(entry(2), g);
      assert.equal(sends, 0);
      assert.equal(r.incidents('g')[0].status, 'unavailable');
      assert.equal(r.incidents('g')[0].event_count, 2);
      for (const [key, value] of Object.entries(change)) assert.equal(r.get('g')[key], value);
    } finally {
      db.close();
    }
  }
});

test('antinuke recorded snapshot gate matches original actor/action/count and does not mutate metadata', () => {
  const { db, r } = setup();
  try {
    r.record(entry(1), guild, now);
    const incident = r.record(entry(2), guild, now);
    assert.equal(r.recorded(incident.id, 'g', incident), true);
    for (const change of [
      { actorId: ids.owner },
      { action: AuditLogEvent.RoleDelete },
      { count: 3 },
    ])
      assert.equal(r.recorded(incident.id, 'g', { ...incident, ...change }), false);
    assert.equal(r.recorded(incident.id, 'other', incident), false);
    assert.equal(r.incidents('g')[0].event_count, 2);
  } finally {
    db.close();
  }
});
test('antinuke changed stored incident actor/action/count during native lookup cannot send stale alert', async () => {
  for (const [column, value] of [
    ['actor_id', ids.owner],
    ['action', AuditLogEvent.RoleDelete],
    ['event_count', 3],
  ]) {
    const { db, r } = setup();
    let sends = 0;
    const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => {
          db.prepare(`UPDATE antinuke_incidents SET ${column}=? WHERE id=1`).run(value);
          return {
            id: ids.channel,
            guildId: 'g',
            type: ChannelType.GuildText,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {
              sends++;
              return { id: 'receipt' };
            },
          };
        },
      },
    };
    const c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      logger: { warn() {} },
    };
    try {
      const h = createAntinukeHandler(c);
      await h(entry(1), g);
      await h(entry(2), g);
      assert.equal(sends, 0);
      assert.equal(r.incidents('g')[0][column], value);
      assert.equal(r.incidents('g')[0].status, 'recorded');
    } finally {
      db.close();
    }
  }
});

test('audit alert policyreset/trustIDremoval exactscope/defaults/receipts preserved without nativepermissions', () => {
  const { db, r } = setup();
  try {
    r.trust('g', ids.actor, true);
    r.patch('other', { enabled: true, trustedUsers: [ids.actor] });
    assert.equal(r.removeTrust('g', ids.actor), 1);
    assert.equal(r.removeTrust('g', ids.actor), 0);
    assert.throws(() => r.removeTrust('g', 'bad'));
    r.record(entry(1), guild, now);
    r.record(entry(2), guild, now);
    const events = db.prepare('SELECT count(*) n FROM antinuke_events').get().n;
    const reset = r.resetPolicy('g');
    assert.deepEqual(reset, { enabled: false, threshold: 5, windowSeconds: 60, trustedUsers: [] });
    assert.equal(r.get('other').enabled, true);
    assert.equal(db.prepare('SELECT count(*) n FROM antinuke_events').get().n, events);
    assert.equal(r.incidents('g').length, 1);
    assert.equal(r.record(entry(3), guild, now), null);
  } finally {
    db.close();
  }
});
test('audit reset during nativealertvalidation suppresses send while preserving unavailable incident', async () => {
  const { db, r } = setup();
  try {
    let sent = 0;
    const g = {
      ...guild,
      members: { fetchMe: async () => ({ id: ids.bot, guild: { id: 'g' } }) },
      channels: {
        fetch: async () => {
          r.resetPolicy('g');
          return {
            id: ids.channel,
            guildId: 'g',
            type: 0,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {
              sent++;
              return { id: 'message' };
            },
          };
        },
      },
    };
    const c = {
      antinuke: r,
      config: { auditEventsEnabled: true },
      localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) },
      logger: { warn: () => {} },
    };
    r.record(entry(1), g, Date.now());
    await createAntinukeHandler(c)(entry(2), g);
    assert.equal(sent, 0);
    assert.equal(r.incidents('g')[0].status, 'unavailable');
  } finally {
    db.close();
  }
});
test('audit exportpolicy/resetpolicy/removetrust private3locale bytes/currentmanager/confirm no native lookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const { db, r } = setup();
    try {
      r.trust('g', ids.actor, true);
      const member = { id: ids.actor, guild: { id: 'g' }, permissions: { has: () => true } };
      const g = { ...guild, members: { fetch: async () => member } };
      let sub = 'exportpolicy',
        confirm = false,
        reply;
      const c = {
        antinuke: r,
        config: { auditEventsEnabled: false },
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      const i = {
        guild: g,
        guildId: 'g',
        user: { id: ids.actor },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
        options: {
          getSubcommand: () => sub,
          getBoolean: () => confirm,
          getString: () => ids.actor,
        },
      };
      await command.execute(i, c);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), r.get('g'));
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'removetrust';
      await assert.rejects(() => command.execute(i, c), /antinukeResetConfirm/);
      confirm = true;
      await command.execute(i, c);
      assert.deepEqual(r.get('g').trustedUsers, []);
      sub = 'resetpolicy';
      await command.execute(i, c);
      assert.equal(r.get('g').enabled, false);
      member.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /userPermission/);
    } finally {
      db.close();
    }
  }
});
