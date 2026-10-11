import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import {
  MessageSchedules,
  AutomationRunner,
  parseScheduledTime,
} from '../src/services/automations.js';
import command from '../src/commands/automations/automation.js';
const channelId = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:');
  let now = Date.now();
  const store = new MessageSchedules(db, () => now),
    sent = [];
  const channel = {
      id: channelId,
      guildId: 'g',
      type: 0,
      permissionsFor: () => ({ has: () => true }),
      send: async (p) => {
        sent.push(p);
        return { id: 'native-message' };
      },
    },
    guild = {
      id: 'g',
      client: { user: { id: 'b' } },
      members: {
        fetch: async ({ user }) => ({
          id: user,
          guild: { id: 'g' },
          permissions: { has: () => true },
        }),
        fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }),
      },
      channels: { fetch: async () => channel },
    },
    c = {
      messageSchedules: store,
      guildConfig: new GuildConfig(new GuildSettings(db)),
      logger: { warn: () => {} },
    };
  const runner = new AutomationRunner(c, { guilds: { fetch: async () => guild } });
  const input = {
    guildId: 'g',
    channelId,
    body: 'Hi @everyone',
    dueAt: now + 60000,
    interactionId: 'i',
  };
  return {
    db,
    store,
    c,
    guild,
    channel,
    runner,
    sent,
    input,
    advance: (ms) => (now += ms),
    now: () => now,
  };
}
test('explicit timezone parser refuses naive/invalid calendar times', () => {
  assert.equal(parseScheduledTime('2026-10-12T09:00:00+05:30'), Date.parse('2026-10-12T03:30:00Z'));
  for (const v of ['2026-10-12T09:00:00', '2026-02-30T09:00:00Z', 'bad', '2026-10-12T25:00:00Z'])
    assert.throws(() => parseScheduledTime(v));
});
test('schedule bounds, duplicate source, guild isolation and cancellation', () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    assert.equal(x.store.get(id, 'other'), undefined);
    assert.throws(() => x.store.create(x.input));
    assert.throws(() => x.store.create({ ...x.input, interactionId: '2', dueAt: x.now() }));
    assert.throws(() => x.store.cancel(id, 'other'));
    x.store.cancel(id, 'g');
    assert.equal(x.store.get(id, 'g').status, 'cancelled');
    assert.throws(() => x.store.cancel(id, 'g'));
  } finally {
    x.db.close();
  }
});
test('claim-before-send prevents duplicate delivery after success or uncertain failure', async () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    x.advance(60001);
    await Promise.all([x.runner.tick(), x.runner.tick()]);
    assert.equal(x.sent.length, 1);
    assert.equal(x.store.get(id, 'g').status, 'done');
    assert.deepEqual(x.sent[0].allowedMentions.parse, []);
    x.store.create({ ...x.input, interactionId: '2', dueAt: x.now() + 60000 });
    x.advance(60001);
    x.channel.send = async () => {
      throw new Error('network');
    };
    await x.runner.tick();
    assert.equal(x.store.get(2, 'g').status, 'uncertain');
    await x.runner.tick();
    assert.equal(x.store.get(2, 'g').status, 'uncertain');
  } finally {
    x.db.close();
  }
});
test('missed repeating sends skip backlog and maintain interval phase', async () => {
  const x = setup();
  try {
    x.store.create({ ...x.input, repeatMs: 600000 });
    x.advance(4 * 600000);
    await x.runner.tick();
    assert.equal(x.sent.length, 1);
    const r = x.store.get(1, 'g');
    assert(r.due_at > x.now());
    assert.equal((r.due_at - x.input.dueAt) % 600000, 0);
    await x.runner.tick();
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});
test('restart turns in-flight jobs uncertain and timer starts only once', () => {
  const x = setup();
  try {
    x.store.create(x.input);
    x.advance(60001);
    assert(x.store.claim());
    x.store.recover();
    assert.equal(x.store.get(1, 'g').status, 'uncertain');
    assert.equal(x.store.claim(), null);
    x.runner.start();
    const timer = x.runner.timer;
    x.runner.start();
    assert.equal(x.runner.timer, timer);
    x.runner.stop();
  } finally {
    x.db.close();
  }
});
test('all four schedule commands execute with ISO time and locale', async () => {
  const x = setup();
  try {
    x.c.guildConfig.setLanguage('g', 'hi');
    let sub = 'create';
    const replies = [],
      i = {
        id: 'i',
        guild: x.guild,
        guildId: 'g',
        user: { id: 'actor' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => sub,
          getChannel: () => ({ id: channelId }),
          getString: (name) =>
            name === 'at'
              ? new Date(x.now() + 120000).toISOString().replace(/\.\d{3}Z$/, 'Z')
              : 'Hi',
          getInteger: (name) => (name === 'id' ? 1 : null),
        },
      };
    for (const s of ['create', 'list', 'config', 'cancel']) {
      sub = s;
      await command.execute(i, x.c);
    }
    assert.equal(replies.length, 4);
    assert.match(replies[0].embeds[0].data.description, /शेड्यूल/);
  } finally {
    x.db.close();
  }
});
test('named zone create path persists one-time message and returns exact UTC in every locale', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      const local = new Date(x.now() + 120000).toISOString().slice(0, 19),
        replies = [],
        i = {
          id: 'zone',
          guild: x.guild,
          guildId: 'g',
          user: { id: 'actor' },
          deferReply: async () => {},
          editReply: async (p) => replies.push(p),
          options: {
            getSubcommand: () => 'createzone',
            getChannel: () => ({ id: channelId }),
            getString: (n) => (n === 'local' ? local : n === 'timezone' ? 'UTC' : 'text'),
          },
        };
      await command.execute(i, x.c);
      const row = x.store.get(1, 'g');
      assert.equal(row.repeat_ms, null);
      assert.equal(row.due_at, Date.parse(local + 'Z'));
      assert(replies[0].embeds[0].data.description.includes(new Date(row.due_at).toISOString()));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
    } finally {
      x.db.close();
    }
  }
});

test('schedule text erasure requires completed/cancelled scope and preserves replay metadata', async () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    assert.throws(() => x.store.forget(id, 'g'), /automationForgetInvalid/);
    assert.throws(() => x.store.forget(id, 'other'), /automationForgetInvalid/);
    x.advance(60001);
    await x.runner.tick();
    x.store.forget(id, 'g');
    x.store.forget(id, 'g');
    const row = x.store.get(id, 'g');
    assert.equal(row.body, '[erased]');
    assert.equal(row.status, 'done');
    assert.equal(row.interaction_id, 'i');
    assert.throws(() => x.store.create(x.input));
    assert.equal(x.sent.length, 1);
    const two = x.store.create({ ...x.input, dueAt: x.now() + 60000, interactionId: 'two' });
    x.store.cancel(two, 'g');
    x.store.forget(two, 'g');
    assert.equal(x.store.get(two, 'g').body, '[erased]');
    const three = x.store.create({ ...x.input, dueAt: x.now() + 60000, interactionId: 'three' });
    x.advance(60001);
    x.store.claim();
    assert.throws(() => x.store.forget(three, 'g'));
    x.store.finish(three, false);
    assert.throws(() => x.store.forget(three, 'g'));
  } finally {
    x.db.close();
  }
});
test('schedule forget confirmation,current permission and localization gate metadata-only erasure', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const x = setup();
    let confirm = false;
    const replies = [];
    const id = x.store.create(x.input);
    x.store.cancel(id, 'g');
    x.c.guildConfig.setLanguage('g', language);
    const i = {
      user: { id: 'actor' },
      guild: x.guild,
      guildId: 'g',
      deferReply: async () => {},
      editReply: async (p) => replies.push(p),
      options: { getSubcommand: () => 'forget', getBoolean: () => confirm, getInteger: () => id },
    };
    try {
      await assert.rejects(() => command.execute(i, x.c), /automationForgetConfirm/);
      assert.equal(x.store.get(id, 'g').body, x.input.body);
      confirm = true;
      await command.execute(i, x.c);
      assert.equal(x.store.get(id, 'g').body, '[erased]');
      assert.equal(x.sent.length, 0);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      x.guild.members.fetch = async () => ({ permissions: { has: () => false } });
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('pending schedule text edit is guild isolated and preserves timing/repeat/replay metadata', () => {
  const x = setup();
  try {
    const id = x.store.create({ ...x.input, repeatMs: 600000 }),
      before = x.store.get(id, 'g');
    x.store.editPending(id, 'g', 'CURRENT TEXT');
    const after = x.store.get(id, 'g');
    assert.equal(after.body, 'CURRENT TEXT');
    for (const key of [
      'due_at',
      'channel_id',
      'repeat_ms',
      'interaction_id',
      'created_at',
      'status',
    ])
      assert.equal(after[key], before[key]);
    assert.throws(() => x.store.editPending(id, 'other', 'LEAK'), /automationEditInvalid/);
    assert.throws(() => x.store.editPending(id, 'g', ''));
    assert.equal(x.sent.length, 0);
    x.advance(60000);
    assert.equal(x.store.claim().body, 'CURRENT TEXT');
    assert.throws(() => x.store.editPending(id, 'g', 'SENDING'), /automationEditInvalid/);
    x.store.finish(id, false);
    assert.throws(() => x.store.editPending(id, 'g', 'UNCERTAIN'), /automationEditInvalid/);
    x.store.cancel(id, 'g');
    assert.throws(() => x.store.editPending(id, 'g', 'CANCELLED'), /automationEditInvalid/);
  } finally {
    x.db.close();
  }
});
test('schedule edit slash is private localized current-authority and sends nothing', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    const id = x.store.create(x.input);
    x.c.guildConfig.setLanguage('g', locale);
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'actor' },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
      options: {
        getSubcommand: () => 'edit',
        getInteger: () => id,
        getString: () => 'private updated',
      },
    };
    try {
      await command.execute(i, x.c);
      assert.equal(x.store.get(id, 'g').body, 'private updated');
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(!JSON.stringify(replies).includes('private updated'));
      assert.equal(x.sent.length, 0);
      x.guild.members.fetch = async () => ({
        id: 'other',
        guild: { id: 'g' },
        permissions: { has: () => true },
      });
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('automation runner delivers edited pending text once and never the replaced body', async () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    x.store.editPending(id, 'g', 'CURRENT @everyone');
    x.advance(60000);
    await x.runner.tick();
    await x.runner.tick();
    assert.equal(x.sent.length, 1);
    assert.equal(x.sent[0].embeds[0].data.description, 'CURRENT @everyone');
    assert.deepEqual(x.sent[0].allowedMentions.parse, []);
    assert.equal(x.store.get(id, 'g').status, 'done');
    assert.throws(() => x.store.editPending(id, 'g', 'completed'), /automationEditInvalid/);
  } finally {
    x.db.close();
  }
});
test('edited pending schedule survives SQLite reopen with unchanged time and interaction guard', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'luna-schedule-edit-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  const now = Date.now();
  try {
    let store = new MessageSchedules(db, () => now);
    const input = {
      guildId: 'g',
      channelId,
      body: 'old',
      dueAt: now + 60000,
      interactionId: 'source',
    };
    const id = store.create(input);
    store.editPending(id, 'g', 'new');
    db.close();
    db = openDatabase(path);
    store = new MessageSchedules(db, () => now);
    store.recover();
    const row = store.get(id, 'g');
    assert.equal(row.body, 'new');
    assert.equal(row.due_at, input.dueAt);
    assert.equal(row.status, 'pending');
    assert.equal(row.interaction_id, 'source');
    assert.throws(() => store.create(input));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pending schedule reschedule preserves text/destination/interval and advances repeats from new due time', () => {
  const x = setup();
  try {
    const id = x.store.create({ ...x.input, repeatMs: 600000 }),
      before = x.store.get(id, 'g');
    const next = Math.ceil((x.now() + 120000) / 1000) * 1000;
    x.store.reschedulePending(id, 'g', next);
    const after = x.store.get(id, 'g');
    assert.equal(after.due_at, next);
    for (const key of ['body', 'channel_id', 'repeat_ms', 'interaction_id', 'created_at', 'status'])
      assert.equal(after[key], before[key]);
    x.advance(60000);
    assert.equal(x.store.claim(), null);
    x.advance(next - x.now());
    assert.equal(x.store.claim().id, id);
    x.store.finish(id, true);
    assert.equal(x.store.get(id, 'g').due_at, next + 600000);
  } finally {
    x.db.close();
  }
});
test('reschedule rejects bad bounds/foreign/nonpending records and slash localizes exact UTC result', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    const id = x.store.create(x.input);
    x.c.guildConfig.setLanguage('g', locale);
    const next = Math.ceil((x.now() + 120000) / 1000) * 1000;
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'actor' },
      deferReply: async () => {},
      editReply: async (p) => replies.push(p),
      options: {
        getSubcommand: () => 'reschedule',
        getInteger: () => id,
        getString: () => new Date(next).toISOString().replace('.000', ''),
      },
    };
    try {
      for (const due of [x.now(), x.now() + 366 * 86400000, 1.5])
        assert.throws(() => x.store.reschedulePending(id, 'g', due), /automationTimeBounds/);
      assert.throws(() => x.store.reschedulePending(id, 'other', next), /automationEditInvalid/);
      await command.execute(i, x.c);
      assert.equal(x.store.get(id, 'g').due_at, next);
      assert(replies[0].embeds[0].data.description.includes(new Date(next).toISOString()));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(x.sent.length, 0);
      x.store.cancel(id, 'g');
      assert.throws(() => x.store.reschedulePending(id, 'g', next), /automationEditInvalid/);
    } finally {
      x.db.close();
    }
  }
});

test('automation create paths repeat current admin after destination lookup before storing', async () => {
  for (const sub of ['create', 'createzone']) {
    const x = setup();
    try {
      let lost = false;
      const fetch = x.guild.members.fetch;
      x.guild.members.fetch = async (opts) => {
        const actor = await fetch(opts);
        if (lost) actor.permissions = { has: () => false };
        return actor;
      };
      const channels = x.guild.channels.fetch;
      x.guild.channels.fetch = async (...args) => {
        lost = true;
        return channels(...args);
      };
      const i = {
        id: 'i',
        guildId: 'g',
        guild: x.guild,
        user: { id: 'a' },
        deferReply: async () => {},
        options: { getSubcommand: () => sub, getChannel: () => ({ id: channelId }) },
      };
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
      assert.equal(x.store.list('g').length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('automation runner forces exact source guild and pauses foreign lookup without channel access/send', async () => {
  const x = setup();
  try {
    x.store.create(x.input);
    x.advance(60001);
    let channels = 0;
    const runner = new AutomationRunner(x.c, {
      guilds: {
        fetch: async (o) => {
          assert.deepEqual(o, { guild: 'g', force: true });
          return {
            id: 'other',
            channels: {
              fetch: async () => {
                channels++;
                return x.channel;
              },
            },
          };
        },
      },
    });
    await runner.tick();
    assert.equal(channels, 0);
    assert.equal(x.sent.length, 0);
    assert.equal(x.store.get(1, 'g').status, 'uncertain');
  } finally {
    x.db.close();
  }
});

test('schedule inspect privately shows exact stored body/metadata without mutation or destination lookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      const id = x.store.create({
          ...x.input,
          body: 'private @everyone **text**',
          repeatMs: 600000,
        }),
        before = x.store.get(id, 'g'),
        replies = [];
      x.c.guildConfig.setLanguage('g', locale);
      x.guild.channels.fetch = async () => {
        throw Error('must not fetch destination');
      };
      await command.execute(
        {
          guildId: 'g',
          guild: x.guild,
          user: { id: 'a' },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => replies.push(p),
          options: { getSubcommand: () => 'inspect', getInteger: () => id },
        },
        x.c,
      );
      assert.deepEqual(x.store.get(id, 'g'), before);
      assert.equal(x.sent.length, 0);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(replies[0].embeds[0].data.description.includes(before.body));
      assert(replies[0].embeds[0].data.description.includes(new Date(before.due_at).toISOString()));
    } finally {
      x.db.close();
    }
  }
});
test('schedule inspect refuses missing or foreign records without private text disclosure', async () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    for (const guildId of ['other', 'g']) {
      let replies = 0;
      const guild = {
        ...x.guild,
        id: guildId,
        members: {
          fetch: async ({ user }) => ({
            id: user,
            guild: { id: guildId },
            permissions: { has: () => true },
          }),
        },
      };
      await assert.rejects(
        () =>
          command.execute(
            {
              guildId,
              guild,
              user: { id: 'a' },
              deferReply: async () => {},
              editReply: async () => {
                replies++;
              },
              options: {
                getSubcommand: () => 'inspect',
                getInteger: () => (guildId === 'other' ? id : 999),
              },
            },
            x.c,
          ),
        /automationInspectMissing/,
      );
      assert.equal(replies, 0);
    }
  } finally {
    x.db.close();
  }
});

test('pending repeat change preserves other metadata and omit stops after one next send', async () => {
  const x = setup();
  try {
    const id = x.store.create({ ...x.input, repeatMs: 600000 }),
      before = x.store.get(id, 'g');
    x.store.repeatPending(id, 'g', 1200000);
    const after = x.store.get(id, 'g');
    for (const key of ['body', 'channel_id', 'due_at', 'status', 'interaction_id', 'created_at'])
      assert.equal(after[key], before[key]);
    assert.equal(after.repeat_ms, 1200000);
    x.store.repeatPending(id, 'g', null);
    x.advance(60000);
    await x.runner.tick();
    assert.equal(x.sent.length, 1);
    assert.equal(x.store.get(id, 'g').status, 'done');
    assert.throws(() => x.store.repeatPending(id, 'g', 600000), /automationEditInvalid/);
  } finally {
    x.db.close();
  }
});
test('repeat path current admin/confirmation/bounds/guild/status checked with private locale reply', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      const id = x.store.create(x.input),
        replies = [];
      x.c.guildConfig.setLanguage('g', locale);
      let confirm = false;
      const i = {
        guildId: 'g',
        guild: x.guild,
        user: { id: 'a' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => 'repeat',
          getBoolean: () => confirm,
          getInteger: (name) => (name === 'id' ? id : 10),
        },
      };
      await assert.rejects(() => command.execute(i, x.c), /automationRepeatConfirm/);
      assert.equal(x.store.get(id, 'g').repeat_ms, null);
      for (const value of [0, 599999, 30 * 86400000 + 1, 1.5])
        assert.throws(() => x.store.repeatPending(id, 'g', value));
      assert.throws(() => x.store.repeatPending(id, 'other', 600000), /automationEditInvalid/);
      confirm = true;
      await command.execute(i, x.c);
      assert.equal(x.store.get(id, 'g').repeat_ms, 600000);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(x.sent.length, 0);
      x.advance(60000);
      x.store.claim();
      assert.throws(() => x.store.repeatPending(id, 'g', null), /automationEditInvalid/);
    } finally {
      x.db.close();
    }
  }
});

test('accepted scheduled send missing native identity stops repeating job uncertain without replay', async () => {
  const x = setup();
  try {
    x.store.create({ ...x.input, repeatMs: 600000 });
    x.channel.send = async (p) => {
      x.sent.push(p);
      return {};
    };
    x.advance(60001);
    await x.runner.tick();
    assert.equal(x.store.list('g')[0].status, 'uncertain');
    x.advance(1200000);
    await x.runner.tick();
    assert.equal(x.sent.length, 1);
  } finally {
    x.db.close();
  }
});

test('schedule finish requires one sending reservation and boolean outcome', () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    assert.throws(() => x.store.finish(id, true), /not sending/);
    assert.throws(() => x.store.finish(999, true), /not sending/);
    x.advance(60001);
    x.store.claim();
    assert.throws(() => x.store.finish(id, 'true'), /outcome/);
    x.store.finish(id, true);
    assert.equal(x.store.get(id, 'g').status, 'done');
    assert.throws(() => x.store.finish(id, false), /not sending/);
    assert.equal(x.store.get(id, 'g').status, 'done');
  } finally {
    x.db.close();
  }
});

test('named-zone reschedule moves one pending instant with text destination and elapsed repeat preserved in three locales', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      const id = x.store.create({ ...x.input, repeatMs: 600000 }),
        before = x.store.get(id, 'g'),
        next = Math.ceil((x.now() + 120000) / 1000) * 1000,
        local = new Date(next).toISOString().slice(0, 19),
        replies = [];
      x.guild.channels.fetch = async () => {
        throw Error('no destination lookup');
      };
      await command.execute(
        {
          guild: x.guild,
          guildId: 'g',
          user: { id: 'actor' },
          deferReply: async () => {},
          editReply: async (p) => replies.push(p),
          options: {
            getSubcommand: () => 'reschedulezone',
            getInteger: () => id,
            getString: (n) => (n === 'local' ? local : 'UTC'),
          },
        },
        x.c,
      );
      const after = x.store.get(id, 'g');
      assert.deepEqual(after, { ...before, due_at: next });
      assert.equal(
        replies[0].embeds[0].data.description,
        translate(locale, 'automationZoneRescheduled', {
          zone: 'UTC',
          iso: new Date(next).toISOString(),
        }),
      );
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('named-zone reschedule rejects DST ambiguity gap invalidzone nonpending foreign and stale instants without mutation', async () => {
  for (const kind of ['ambiguous', 'gap', 'zone', 'foreign', 'cancelled', 'past']) {
    const x = setup();
    try {
      const id = x.store.create(x.input);
      if (kind === 'cancelled') x.store.cancel(id, 'g');
      const before = x.store.get(id, 'g');
      let local = new Date(x.now() + 120000).toISOString().slice(0, 19),
        zone = 'UTC';
      if (kind === 'ambiguous') {
        local = '2026-11-01T01:30:00';
        zone = 'America/New_York';
      }
      if (kind === 'gap') {
        local = '2027-03-14T02:30:00';
        zone = 'America/New_York';
      }
      if (kind === 'zone') zone = 'Fake/Zone';
      if (kind === 'past') local = '2020-01-01T00:00:00';
      await assert.rejects(() =>
        command.execute(
          {
            guild: x.guild,
            guildId: 'g',
            user: { id: 'actor' },
            deferReply: async () => {},
            editReply: async () => assert.fail('no output'),
            options: {
              getSubcommand: () => 'reschedulezone',
              getInteger: () => (kind === 'foreign' ? id + 1 : id),
              getString: (n) => (n === 'local' ? local : zone),
            },
          },
          x.c,
        ),
      );
      assert.deepEqual(x.store.get(id, 'g'), before);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('named-zone reschedule current manager failure blocks before modifying schedule', async () => {
  const x = setup();
  try {
    const id = x.store.create(x.input),
      before = x.store.get(id, 'g');
    x.guild.members.fetch = async () => ({
      id: 'actor',
      guild: { id: 'g' },
      permissions: { has: () => false },
    });
    await assert.rejects(
      () =>
        command.execute(
          {
            guild: x.guild,
            guildId: 'g',
            user: { id: 'actor' },
            deferReply: async () => {},
            options: { getSubcommand: () => 'reschedulezone' },
          },
          x.c,
        ),
      /userPermission/,
    );
    assert.deepEqual(x.store.get(id, 'g'), before);
  } finally {
    x.db.close();
  }
});

test('pending destination edit preserves scheduling snapshot and produces private three-locale no-send result', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      const id = x.store.create({ ...x.input, repeatMs: 600000 }),
        before = x.store.get(id, 'g'),
        newChannel = '100000000000000009',
        replies = [];
      x.guild.channels.fetch = async () => ({ ...x.channel, id: newChannel });
      await command.execute(
        {
          guild: x.guild,
          guildId: 'g',
          user: { id: 'actor' },
          deferReply: async () => {},
          editReply: async (p) => replies.push(p),
          options: {
            getSubcommand: () => 'destination',
            getInteger: () => id,
            getChannel: () => ({ id: newChannel }),
          },
        },
        x.c,
      );
      assert.deepEqual(x.store.get(id, 'g'), { ...before, channel_id: newChannel });
      assert.equal(
        replies[0].embeds[0].data.description,
        translate(locale, 'automationDestinationSaved', { channel: newChannel }),
      );
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('destination edit rejects concurrent claimed edited or cancelled snapshots without overwriting latest state', () => {
  for (const kind of ['claimed', 'body', 'time', 'repeat', 'cancelled']) {
    const x = setup();
    try {
      const id = x.store.create(x.input),
        before = x.store.get(id, 'g');
      if (kind === 'claimed') {
        x.advance(60001);
        x.store.claim();
      }
      if (kind === 'body') x.store.editPending(id, 'g', 'new body');
      if (kind === 'time') x.store.reschedulePending(id, 'g', x.now() + 120000);
      if (kind === 'repeat') x.store.repeatPending(id, 'g', 600000);
      if (kind === 'cancelled') x.store.cancel(id, 'g');
      const latest = x.store.get(id, 'g');
      assert.throws(
        () => x.store.destinationPending(before, '100000000000000009'),
        /automationEditInvalid/,
      );
      assert.deepEqual(x.store.get(id, 'g'), latest);
    } finally {
      x.db.close();
    }
  }
});
test('destination edit rejects missing foreign unavailable and manager permission loss during channel fetch', async () => {
  for (const kind of ['missing', 'unavailable', 'foreign', 'permission', 'race']) {
    const x = setup();
    try {
      const id = x.store.create(x.input),
        newChannel = '100000000000000009';
      let lost = false;
      const fetch = x.guild.members.fetch;
      x.guild.members.fetch = async (o) => {
        const member = await fetch(o);
        if (lost) member.permissions.has = () => false;
        return member;
      };
      x.guild.channels.fetch = async () => {
        if (kind === 'permission') lost = true;
        if (kind === 'race') x.store.cancel(id, 'g');
        return kind === 'unavailable'
          ? null
          : { ...x.channel, id: newChannel, guildId: kind === 'foreign' ? 'other' : 'g' };
      };
      await assert.rejects(() =>
        command.execute(
          {
            guild: x.guild,
            guildId: 'g',
            user: { id: 'actor' },
            deferReply: async () => {},
            editReply: async () => assert.fail('no output'),
            options: {
              getSubcommand: () => 'destination',
              getInteger: () => (kind === 'missing' ? id + 1 : id),
              getChannel: () => ({ id: newChannel }),
            },
          },
          x.c,
        ),
      );
      assert.equal(x.store.get(id, 'g').channel_id, channelId);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('bulk pending cancellation is guild-scoped preserves content and skips in-flight uncertain terminal records', () => {
  const x = setup();
  try {
    const records = [];
    for (const status of ['pending', 'sending', 'uncertain', 'done', 'cancelled']) {
      const id = x.store.create({ ...x.input, interactionId: status });
      x.db.prepare('UPDATE message_schedules SET status=? WHERE id=?').run(status, id);
      records.push(x.store.get(id, 'g'));
    }
    const foreign = x.store.create({ ...x.input, guildId: 'other', interactionId: 'other' }),
      foreignBefore = x.store.get(foreign, 'other');
    assert.equal(x.store.cancelPending('g'), 1);
    for (const row of records)
      assert.deepEqual(
        x.store.get(row.id, 'g'),
        row.status === 'pending' ? { ...row, status: 'cancelled' } : row,
      );
    assert.deepEqual(x.store.get(foreign, 'other'), foreignBefore);
    assert.equal(x.store.cancelPending('g'), 0);
    x.advance(60001);
    assert.equal(x.store.claim()?.guild_id, 'other');
    assert.throws(() => x.store.cancelPending(''));
  } finally {
    x.db.close();
  }
});
test('cancelpending explicit confirmation produces private localized count without native sends', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      const id = x.store.create(x.input),
        before = x.store.get(id, 'g');
      let payload;
      const i = {
        guildId: 'g',
        guild: x.guild,
        user: { id: 'actor' },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          payload = p;
        },
        options: { getSubcommand: () => 'cancelpending', getBoolean: () => true },
      };
      await command.execute(i, x.c);
      assert.equal(
        payload.embeds[0].data.description,
        translate(locale, 'automationPendingCancelled', { n: 1 }),
      );
      assert.deepEqual(payload.allowedMentions.parse, []);
      assert.equal(x.sent.length, 0);
      assert.deepEqual(x.store.get(id, 'g'), { ...before, status: 'cancelled' });
    } finally {
      x.db.close();
    }
  }
});
test('cancelpending denied confirmation or current manager identity never changes any schedule', async () => {
  for (const kind of ['confirm', 'permission', 'actor', 'guild']) {
    const x = setup();
    try {
      const id = x.store.create(x.input),
        before = x.store.get(id, 'g');
      if (kind !== 'confirm')
        x.guild.members.fetch = async () => ({
          id: kind === 'actor' ? 'other' : 'actor',
          guild: { id: kind === 'guild' ? 'other' : 'g' },
          permissions: { has: () => kind !== 'permission' },
        });
      await assert.rejects(() =>
        command.execute(
          {
            guildId: 'g',
            guild: x.guild,
            user: { id: 'actor' },
            deferReply: async () => {},
            editReply: async () => assert.fail('no success'),
            options: { getSubcommand: () => 'cancelpending', getBoolean: () => false },
          },
          x.c,
        ),
      );
      assert.deepEqual(x.store.get(id, 'g'), before);
      assert.equal(x.sent.length, 0);
    } finally {
      x.db.close();
    }
  }
});

test('upcoming metadata is pending-only guild-scoped due ordered deterministic paginated and body-free', () => {
  const x = setup();
  try {
    for (let n = 0; n < 25; n++)
      x.store.create({
        ...x.input,
        interactionId: String(n),
        dueAt: x.now() + 60000 + (24 - n) * 1000,
      });
    x.db
      .prepare(
        "INSERT INTO message_schedules(guild_id,channel_id,body,due_at,status,interaction_id,created_at) VALUES('g',?,'secret',?,'uncertain','terminal',?)",
      )
      .run(channelId, x.now(), x.now());
    x.store.create({ ...x.input, guildId: 'other', interactionId: 'foreign' });
    const a = x.store.upcoming('g'),
      b = x.store.upcoming('g', 2),
      c = x.store.upcoming('g', 3);
    assert.equal(a.length, 10);
    assert.equal(b.length, 10);
    assert.equal(c.length, 5);
    assert(a[0].due_at < b[0].due_at);
    assert.equal(a[0].id, 25);
    assert.deepEqual(Object.keys(a[0]), ['id', 'channel_id', 'due_at', 'repeat_ms']);
    assert.equal(x.store.upcoming('other').length, 1);
    for (const p of [0, 4, 1.5, '1'])
      assert.throws(() => x.store.upcoming('g', p), /automationQueuePageInvalid/);
  } finally {
    x.db.close();
  }
});
test('schedule overview aggregates beyond100 recent rows without body/channel disclosure and isolates guild', () => {
  const x = setup();
  try {
    for (let n = 0; n < 105; n++)
      x.db
        .prepare(
          "INSERT INTO message_schedules(guild_id,channel_id,body,due_at,status,interaction_id,created_at) VALUES('g',?,'private',?,'done',?,?)",
        )
        .run(channelId, x.now(), String(n), x.now());
    x.store.create(x.input);
    x.store.create({ ...x.input, guildId: 'other', interactionId: 'foreign' });
    const rows = x.store.overview('g');
    assert.equal(x.store.list('g').length, 100);
    assert.equal(rows.find((r) => r.status === 'done').count, 105);
    assert.equal(rows.find((r) => r.status === 'pending').count, 1);
    assert.equal(rows.find((r) => r.status === 'pending').next_due, x.input.dueAt);
    assert.equal(rows.find((r) => r.status === 'done').next_due, null);
    assert.deepEqual(Object.keys(rows[0]), ['status', 'count', 'next_due']);
    assert.equal(x.store.overview('empty').length, 0);
  } finally {
    x.db.close();
  }
});
test('upcoming reads reflect claims and cancellation without mutating jobs or replaying uncertain work', () => {
  const x = setup();
  try {
    const id = x.store.create(x.input);
    x.advance(60000);
    assert.equal(x.store.upcoming('g')[0].id, id);
    x.store.claim();
    assert.equal(x.store.upcoming('g').length, 0);
    x.store.finish(id, false);
    assert.equal(x.store.overview('g')[0].status, 'uncertain');
    assert.equal(x.store.claim(), null);
    x.store.cancel(id, 'g');
    assert.equal(x.store.overview('g')[0].status, 'cancelled');
  } finally {
    x.db.close();
  }
});
test('upcoming and overview slash localize private metadata without sends or schedule mutations', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['upcoming', 'overview']) {
      const x = setup();
      try {
        x.store.create(x.input);
        x.c.guildConfig.setLanguage('g', locale);
        let reply;
        const before = x.store.list('g');
        const i = {
          guild: x.guild,
          guildId: 'g',
          user: { id: 'actor' },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => {
            reply = p;
          },
          options: { getSubcommand: () => sub, getInteger: () => null },
        };
        await command.execute(i, x.c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        const desc = reply.embeds[0].data.description;
        assert(
          desc.includes(
            translate(locale, sub === 'overview' ? 'automationOverview' : 'automationUpcoming', {
              page: 1,
            }),
          ),
        );
        assert(!desc.includes(x.input.body));
        assert.deepEqual(x.store.list('g'), before);
        assert.equal(x.sent.length, 0);
      } finally {
        x.db.close();
      }
    }
});
test('queue read slash gates current exact manager before accessing storage and rejects invalid list/page bounds', async () => {
  const x = setup();
  try {
    let reads = 0;
    const original = x.store.upcoming.bind(x.store);
    x.store.upcoming = (...a) => {
      reads++;
      return original(...a);
    };
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'actor' },
      deferReply: async () => {},
      editReply: async () => {},
      options: { getSubcommand: () => 'upcoming', getInteger: () => 1 },
    };
    for (const actor of [
      { id: 'wrong', guild: { id: 'g' }, permissions: { has: () => true } },
      { id: 'actor', guild: { id: 'other' }, permissions: { has: () => true } },
      { id: 'actor', guild: { id: 'g' }, permissions: { has: () => false } },
    ]) {
      x.guild.members.fetch = async () => actor;
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    }
    assert.equal(reads, 0);
    x.guild.members.fetch = async () => ({
      id: 'actor',
      guild: { id: 'g' },
      permissions: { has: () => true },
    });
    i.options.getInteger = () => 4;
    await assert.rejects(() => command.execute(i, x.c), /automationQueuePageInvalid/);
    i.options.getSubcommand = () => 'list';
    for (const p of [0, 1.5, -1]) {
      i.options.getInteger = () => p;
      await assert.rejects(() => command.execute(i, x.c), /responderPageInvalid/);
    }
  } finally {
    x.db.close();
  }
});

test('upcoming recurrence filter applies before pagination with stable due/id order and guild/pending scope', () => {
  const x = setup();
  try {
    for (let n = 0; n < 24; n++)
      x.store.create({
        ...x.input,
        interactionId: 'r' + n,
        dueAt: x.now() + 60000 + (n % 3) * 1000,
        ...(n % 2 ? { repeatMs: 600000 } : {}),
      });
    const foreign = x.store.create({
      ...x.input,
      guildId: 'foreign',
      interactionId: 'foreign',
      repeatMs: 600000,
    });
    const one = x.store.upcoming('g', 1, { recurring: false }),
      two = x.store.upcoming('g', 2, { recurring: false });
    assert.equal(one.length, 10);
    assert.equal(two.length, 2);
    assert(one.every((r) => r.repeat_ms === null));
    assert.equal(new Set([...one, ...two].map((r) => r.id)).size, 12);
    const repeats = x.store.upcoming('g', 1, { recurring: true });
    assert(repeats.every((r) => r.repeat_ms === 600000 && r.id !== foreign));
    for (let n = 1; n < repeats.length; n++)
      assert(
        repeats[n].due_at > repeats[n - 1].due_at ||
          (repeats[n].due_at === repeats[n - 1].due_at && repeats[n].id > repeats[n - 1].id),
      );
    x.store.cancel(repeats[0].id, 'g');
    assert(!x.store.upcoming('g', 1, { recurring: true }).some((r) => r.id === repeats[0].id));
  } finally {
    x.db.close();
  }
});
test('upcoming recurrence strict boolean/unset filter does not mutate jobs or disclose bodies', () => {
  const x = setup();
  try {
    x.store.create(x.input);
    const before = x.store.list('g');
    for (const v of ['true', 0, 1, {}, []])
      assert.throws(
        () => x.store.upcoming('g', 1, { recurring: v }),
        /automationQueueFilterInvalid/,
      );
    assert.deepEqual(x.store.upcoming('g', 1), x.store.upcoming('g', 1, { recurring: null }));
    assert.deepEqual(x.store.upcoming('g', 1, { recurring: true }), []);
    assert(!Object.hasOwn(x.store.upcoming('g', 1, { recurring: false })[0], 'body'));
    assert.deepEqual(x.store.list('g'), before);
  } finally {
    x.db.close();
  }
});
test('upcoming recurring slash passes explicit false/true without enabling or sending and remains private in three locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const recurring of [false, true]) {
      const x = setup();
      try {
        x.c.guildConfig.setLanguage('g', locale);
        x.store.create(x.input);
        x.store.create({ ...x.input, interactionId: 'repeat', repeatMs: 600000 });
        const replies = [],
          before = x.store.list('g');
        let defer;
        const i = {
          guildId: 'g',
          guild: x.guild,
          user: { id: 'u' },
          options: {
            getSubcommand: () => 'upcoming',
            getInteger: () => 1,
            getBoolean: () => recurring,
          },
          deferReply: async (p) => {
            defer = p;
          },
          editReply: async (p) => replies.push(p),
        };
        await command.execute(i, x.c);
        assert.equal(defer.flags, 64);
        const body = replies[0].embeds[0].data.description;
        assert(body.includes(recurring ? '#2' : '#1'));
        assert(!body.includes(recurring ? '#1' : '#2'));
        assert(!body.includes(x.input.body));
        assert.deepEqual(replies[0].allowedMentions.parse, []);
        assert.equal(x.sent.length, 0);
        assert.deepEqual(x.store.list('g'), before);
      } finally {
        x.db.close();
      }
    }
});
