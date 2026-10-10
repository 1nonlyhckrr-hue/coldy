import { VoiceReadiness } from '../src/services/voiceReadiness.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import {
  VoiceMaster,
  privateVoiceOverwrites,
  verifyPrivateVoice,
  openPrivateVoice,
  editPrivateVoice,
} from '../src/services/voiceMaster.js';
import { ModerationCases } from '../src/services/moderation.js';
import { ChannelType } from 'discord.js';
import command from '../src/commands/voicemaster/voicemaster.js';
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
    owner = { id: ids.owner, user: { bot: false }, permissions: { has: () => true } },
    bot = { id: ids.bot, permissions: { has: () => true } },
    category = {
      id: ids.category,
      client: { isReady: () => true },
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
      client: { isReady: () => true },
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
  return { db, c, i, calls, owner, bot, category, channel };
}
test('private voice overwrites deny everyone and grant owner only minimal access', () => {
  const rules = privateVoiceOverwrites('g', ids.bot, ids.owner);
  assert.equal(rules.length, 3);
  assert.equal(rules[0].deny.length, 2);
  assert.throws(() => privateVoiceOverwrites('g', 'g', ids.owner));
});
test('private channel created with stored ownership, one per user, no movement side effect', async () => {
  const s = setup();
  try {
    const r = await openPrivateVoice(s.i, s.c);
    assert.equal(r.channelId, ids.channel);
    const options = s.calls[0][1];
    assert.equal(options.userLimit, 1);
    assert.equal(options.type, ChannelType.GuildVoice);
    assert.equal(options.parent, ids.category);
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'active');
    assert.equal(s.c.voiceMaster.owned('other', ids.owner), undefined);
    await assert.rejects(() => openPrivateVoice(s.i, s.c), /vmAlreadyOpen/);
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('private voice permission/category/identity checks prevent reservation and create', async () => {
  for (const change of [
    (s) => (s.category.type = ChannelType.GuildText),
    (s) => (s.category.guildId = 'other'),
    (s) => (s.category.permissionsFor = () => ({ has: () => false })),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.owner.user.bot = true),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => openPrivateVoice(s.i, s.c));
      assert.equal(s.calls.length, 0);
      assert.equal(s.c.voiceMaster.owned('g', ids.owner), undefined);
    } finally {
      s.db.close();
    }
  }
});
test('create uncertainty/privacy mismatch blocks repeated creation and recovery never replays', async () => {
  for (const mismatch of [false, true]) {
    const s = setup();
    if (mismatch) s.channel.permissionOverwrites.cache.clear();
    else
      s.i.guild.channels.create = async () => {
        s.calls.push(['create']);
        throw new Error('SECRET');
      };
    try {
      await assert.rejects(() => openPrivateVoice(s.i, s.c), /vmCreateUncertain/);
      await assert.rejects(() => openPrivateVoice(s.i, s.c), /vmAlreadyOpen/);
      assert.equal(s.calls.length, 1);
      assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
      s.c.voiceMaster.recover();
      assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
    } finally {
      s.db.close();
    }
  }
});
test('owner rename/limit/empty close are recorded with exact methods', async () => {
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    for (const [action, extra] of [
      ['rename', { name: 'Quiet room' }],
      ['limit', { limit: 3 }],
      ['close', {}],
    ]) {
      s.i.id = action;
      await editPrivateVoice(s.i, s.c, { action, ...extra });
    }
    assert.deepEqual(
      s.calls.map((c) => c[0]),
      ['create', 'rename', 'limit', 'delete'],
    );
    assert.equal(s.c.voiceMaster.owned('g', ids.owner), undefined);
    assert.equal(
      s.db.prepare("SELECT count(*) n FROM moderation_cases WHERE status='completed'").get().n,
      3,
    );
  } finally {
    s.db.close();
  }
});
test('nonempty, edited access, foreign and unowned channel cannot be deleted', async () => {
  for (const change of [
    (s) => s.channel.members.set('member', {}),
    (s) =>
      s.channel.permissionOverwrites.cache.set('outsider', {
        type: 1,
        allow: { bitfield: 0n },
        deny: { bitfield: 0n },
      }),
    (s) => (s.channel.guildId = 'other'),
    (s) => (s.i.user.id = 'other'),
  ]) {
    const s = setup();
    try {
      await openPrivateVoice(s.i, s.c);
      change(s);
      await assert.rejects(() => editPrivateVoice(s.i, s.c, { action: 'close' }));
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('channel access bitfield/type drift is refused', () => {
  const s = setup();
  try {
    const row = { guild_id: 'g', owner_id: ids.owner, channel_id: ids.channel };
    verifyPrivateVoice(s.channel, row, ids.bot);
    s.channel.permissionOverwrites.cache.get(ids.owner).type = 0;
    assert.throws(() => verifyPrivateVoice(s.channel, row, ids.bot));
  } finally {
    s.db.close();
  }
});
test('duplicate action and uncertain delete are never retried', async () => {
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    s.i.id = 'delete';
    s.channel.delete = async () => {
      s.calls.push(['delete']);
      throw new Error('SECRET');
    };
    await assert.rejects(() => editPrivateVoice(s.i, s.c, { action: 'close' }), /vmEditUncertain/);
    s.i.id = 'new';
    await assert.rejects(() => editPrivateVoice(s.i, s.c, { action: 'close' }), /vmNotActive/);
    assert.equal(s.calls.length, 2);
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('name/limit bounds and storage failure prevent effect', async () => {
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    for (const bad of [
      { action: 'rename', name: ' ' },
      { action: 'rename', name: 'a\nb' },
      { action: 'rename', name: 'a'.repeat(81) },
      { action: 'limit', limit: 0 },
      { action: 'limit', limit: 100 },
      { action: 'all' },
    ])
      await assert.rejects(() => editPrivateVoice(s.i, s.c, bad));
    s.c.cases.begin = () => {
      throw new Error('db');
    };
    await assert.rejects(() => editPrivateVoice(s.i, s.c, { action: 'close' }));
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
test('all six VoiceMaster slash paths reply privately in all locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    let sub = 'setup';
    s.i.options = {
      getSubcommand: () => sub,
      getChannel: () => s.category,
      getString: () => 'Quiet',
      getInteger: () => 2,
    };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    try {
      for (const action of ['setup', 'config', 'open', 'rename', 'limit', 'close']) {
        sub = action;
        s.i.id = action;
        await command.execute(s.i, s.c);
      }
      assert.equal(replies.length, 6);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});

test('created channel ID retained for privacy failure and ownership survives restart', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path');
  const s = setup();
  try {
    s.channel.permissionOverwrites.cache.clear();
    await assert.rejects(() => openPrivateVoice(s.i, s.c));
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).channel_id, ids.channel);
  } finally {
    s.db.close();
  }
  const dir = mkdtempSync(join(tmpdir(), 'luna-vm-')),
    path = join(dir, 'db');
  try {
    let db = openDatabase(path),
      v = new VoiceMaster(db);
    v.setup('g', ids.category);
    const id = v.reserve('g', ids.owner, 'source');
    v.created(id, ids.channel);
    v.activate(id, ids.channel);
    db.close();
    db = openDatabase(path);
    v = new VoiceMaster(db);
    v.recover();
    assert.equal(v.owned('g', ids.owner).status, 'active');
    assert.equal(v.owned('g', ids.owner).channel_id, ids.channel);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reconcile restores uncertain tracked private channel without any Discord mutation', async () => {
  const { reconcilePrivateVoice } = await import('../src/services/voiceMaster.js');
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    const row = s.c.voiceMaster.owned('g', ids.owner);
    s.c.voiceMaster.status(row.id, 'uncertain');
    s.i.id = 'repair';
    const original = s.i.guild.channels.fetch;
    s.i.guild.channels.fetch = async (id, options) => {
      assert.equal(id, ids.channel);
      assert.equal(options.force, true);
      return original(id);
    };
    const r = await reconcilePrivateVoice(s.i, s.c, { confirm: true });
    assert.equal(r.status, 'active');
    assert.equal(s.calls.length, 1);
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'active');
    await assert.rejects(() => reconcilePrivateVoice(s.i, s.c, { confirm: true }), /modDuplicate/);
  } finally {
    s.db.close();
  }
});
test('reconcile observed missing channel frees ownership, not on denied or network fetch', async () => {
  const { reconcilePrivateVoice } = await import('../src/services/voiceMaster.js');
  for (const kind of ['null', 'unknown', 'denied', 'network']) {
    const s = setup();
    try {
      await openPrivateVoice(s.i, s.c);
      s.i.id = 'repair';
      s.i.guild.channels.fetch = async () => {
        if (kind === 'null') return null;
        throw Object.assign(
          new Error('SECRET'),
          kind === 'unknown'
            ? { code: 10003, status: 404 }
            : kind === 'denied'
              ? { code: 50001, status: 403 }
              : {},
        );
      };
      if (['null', 'unknown'].includes(kind)) {
        assert.equal((await reconcilePrivateVoice(s.i, s.c, { confirm: true })).status, 'closed');
        assert.equal(s.c.voiceMaster.owned('g', ids.owner), undefined);
      } else {
        await assert.rejects(
          () => reconcilePrivateVoice(s.i, s.c, { confirm: true }),
          /vmRepairUnavailable/,
        );
        assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'active');
      }
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('reconcile refuses unrecorded/foreign/changed access channels and no confirmation', async () => {
  const { reconcilePrivateVoice } = await import('../src/services/voiceMaster.js');
  for (const change of [
    (s) => (s.channel.guildId = 'other'),
    (s) => (s.channel.id = 'other'),
    (s) => s.channel.permissionOverwrites.cache.clear(),
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.i.user.id = 'other'),
  ]) {
    const s = setup();
    try {
      await openPrivateVoice(s.i, s.c);
      s.i.id = 'repair';
      change(s);
      await assert.rejects(() => reconcilePrivateVoice(s.i, s.c, { confirm: true }));
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
  const s = setup();
  try {
    await assert.rejects(
      () => reconcilePrivateVoice(s.i, s.c, { confirm: false }),
      /vmRepairConfirm/,
    );
    const id = s.c.voiceMaster.reserve('g', ids.owner, 'uncertain-create');
    s.c.voiceMaster.status(id, 'uncertain');
    await assert.rejects(() => reconcilePrivateVoice(s.i, s.c, { confirm: true }), /vmRepairNoId/);
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('reconcile storage failure rolls back repaired status and contains ownership race', async () => {
  const { reconcilePrivateVoice } = await import('../src/services/voiceMaster.js');
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    const row = s.c.voiceMaster.owned('g', ids.owner);
    s.c.voiceMaster.status(row.id, 'uncertain');
    s.i.id = 'repair';
    s.c.cases.finish = () => {
      throw new Error('db');
    };
    await assert.rejects(() => reconcilePrivateVoice(s.i, s.c, { confirm: true }));
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
    s.i.guild.channels.fetch = async () => {
      s.c.voiceMaster.status(row.id, 'closed');
      return s.channel;
    };
    await assert.rejects(() => reconcilePrivateVoice(s.i, s.c, { confirm: true }), /vmNotActive/);
  } finally {
    s.db.close();
  }
});
test('reconcile slash replies privately with no pings in all locales', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    try {
      await openPrivateVoice(s.i, s.c);
      s.i.id = 'repair';
      s.i.options = { getSubcommand: () => 'reconcile', getBoolean: () => true };
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => replies.push(p);
      await command.execute(s.i, s.c);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert.equal(
        replies[0].embeds[0].data.description,
        translate(locale, 'vmRepairActive', { id: 1, channel: ids.channel }),
      );
    } finally {
      s.db.close();
    }
  }
});
test('voice create/edit force current channel/category records instead of cached privacy state', async () => {
  const s = setup();
  try {
    const fetch = s.i.guild.channels.fetch,
      seen = [];
    s.i.guild.channels.fetch = async (id, options) => {
      assert.equal(options.force, true);
      seen.push(id);
      return fetch(id);
    };
    await openPrivateVoice(s.i, s.c);
    s.i.id = 'rename';
    await editPrivateVoice(s.i, s.c, { action: 'rename', name: 'Quiet' });
    assert.deepEqual(seen, [ids.category, ids.channel]);
  } finally {
    s.db.close();
  }
});

test('unlock requires explicit broad-audience consent,empty channel and stored verified overwrite state', async () => {
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    s.channel.permissionOverwrites.set = async (rules) => {
      s.calls.push(['access']);
      s.channel.permissionOverwrites.cache = overwrites(rules);
    };
    s.i.id = 'unlock';
    await assert.rejects(
      () => editPrivateVoice(s.i, s.c, { action: 'unlock', share: false }),
      /vmPublicConfirm/,
    );
    s.channel.members.set('visitor', {});
    await assert.rejects(
      () => editPrivateVoice(s.i, s.c, { action: 'unlock', share: true }),
      /vmNotEmpty/,
    );
    s.channel.members.clear();
    await editPrivateVoice(s.i, s.c, { action: 'unlock', share: true });
    const row = s.c.voiceMaster.owned('g', ids.owner);
    assert.equal(row.public_access, 1);
    verifyPrivateVoice(s.channel, row, ids.bot);
    s.i.id = 'lock';
    await editPrivateVoice(s.i, s.c, { action: 'lock' });
    assert.equal(s.c.voiceMaster.owned('g', ids.owner).public_access, 0);
    assert.equal(s.calls.filter((x) => x[0] === 'access').length, 2);
  } finally {
    s.db.close();
  }
});
test('access API or post-write native privacy verification failure blocks further edits', async () => {
  for (const kind of ['network', 'drift']) {
    const s = setup();
    try {
      await openPrivateVoice(s.i, s.c);
      let calls = 0;
      s.channel.permissionOverwrites.set = async () => {
        calls++;
        if (kind === 'network') throw new Error('SECRET');
      };
      s.i.id = 'unlock';
      await assert.rejects(
        () => editPrivateVoice(s.i, s.c, { action: 'unlock', share: true }),
        /vmEditUncertain/,
      );
      assert.equal(s.c.voiceMaster.owned('g', ids.owner).status, 'uncertain');
      s.i.id = 'retry';
      await assert.rejects(
        () => editPrivateVoice(s.i, s.c, { action: 'unlock', share: true }),
        /vmNotActive/,
      );
      assert.equal(calls, 1);
    } finally {
      s.db.close();
    }
  }
});
test('lock/unlock replies privately in all locales,restore exact minimal access', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    try {
      await openPrivateVoice(s.i, s.c);
      s.channel.permissionOverwrites.set = async (rules) =>
        (s.channel.permissionOverwrites.cache = overwrites(rules));
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'unlock';
      s.i.options = { getSubcommand: () => sub, getBoolean: () => true };
      s.i.deferReply = async () => {};
      s.i.editReply = async (p) => replies.push(p);
      s.i.id = 'unlock';
      await command.execute(s.i, s.c);
      sub = 'lock';
      s.i.id = 'lock';
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 2);
      for (const p of replies) assert.deepEqual(p.allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});
test('VoiceMaster occupancy-dependent effects cannot run with missing voice intent runtime', async () => {
  const { reconcilePrivateVoice } = await import('../src/services/voiceMaster.js');
  const s = setup();
  try {
    s.c.config = { voiceEventsEnabled: false };
    for (const run of [
      () => openPrivateVoice(s.i, s.c),
      () => editPrivateVoice(s.i, s.c, { action: 'close' }),
      () => reconcilePrivateVoice(s.i, s.c, { confirm: true }),
    ])
      await assert.rejects(run, /voiceRuntimeDisabled/);
    assert.equal(s.calls.length, 0);
  } finally {
    s.db.close();
  }
});
test('uncached voice member still blocks empty-room close/access changes', async () => {
  const s = setup();
  try {
    await openPrivateVoice(s.i, s.c);
    Object.defineProperty(s.i.guild.voiceStates, 'cache', {
      value: new Map([['uncached', { channelId: ids.channel, member: null }]]),
      configurable: true,
    });
    assert.equal(s.channel.members.size, 0);
    s.i.id = 'close';
    await assert.rejects(() => editPrivateVoice(s.i, s.c, { action: 'close' }), /vmNotEmpty/);
    s.i.id = 'unlock';
    await assert.rejects(
      () => editPrivateVoice(s.i, s.c, { action: 'unlock', share: true }),
      /vmNotEmpty/,
    );
    assert.equal(s.calls.length, 1);
  } finally {
    s.db.close();
  }
});
