import { PermissionFlagsBits as P } from 'discord.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { AutoMod, createAutoModHandler } from '../src/services/automod.js';
import { ModerationCases } from '../src/services/moderation.js';
import command from '../src/commands/automod/automod.js';
function setup() {
  const db = openDatabase(':memory:'),
    automod = new AutoMod(db),
    member = {
      id: 'u',
      guild: { id: 'g' },
      communicationDisabledUntilTimestamp: null,
      permissions: { has: () => false },
      roles: { cache: new Map() },
    },
    bot = { id: 'bot', guild: { id: 'g' }, permissions: { has: () => true } },
    deleted = [];
  const guild = {
    id: 'g',
    client: { user: { id: 'bot' } },
    ownerId: 'owner',
    members: { fetch: async () => member, fetchMe: async () => bot },
    roles: { fetch: async () => ({ id: '100000000000000001', guild: { id: 'g' } }) },
  };
  const m = {
    id: 'msg',
    guild,
    author: { id: 'u', bot: false },
    content: 'bad',
    createdTimestamp: Date.now(),
    client: { user: { id: 'bot' } },
    channel: { permissionsFor: () => ({ has: () => true }) },
    delete: async () => deleted.push(1),
  };
  const c = {
    automod,
    cases: new ModerationCases(db),
    config: { messageEventsEnabled: true },
    guildConfig: new GuildConfig(new GuildSettings(db)),
    logger: { warn: () => {} },
  };
  return { db, automod, member, bot, guild, m, c, deleted };
}
test('AutoMod defaults off, guild isolation and literal phrase CRUD', () => {
  const x = setup();
  try {
    assert(!x.automod.get('g').enabled);
    x.automod.word('g', ' BAD ', true);
    x.automod.word('g', 'bad', true);
    assert.deepEqual(x.automod.get('g').words, ['bad']);
    assert.equal(x.automod.get('other').words.length, 0);
    x.automod.word('g', 'bad', false);
    assert.equal(x.automod.get('g').words.length, 0);
    assert.throws(() => x.automod.patch('g', { rules: { unknown: true } }));
  } finally {
    x.db.close();
  }
});
test('all six rules detect bounded literal content without substring false positives', () => {
  const x = setup();
  try {
    const settings = x.automod.patch('g', {
      rules: { words: true, invites: true, links: true, mentions: true, caps: true, spam: true },
      words: ['bad'],
    });
    for (const [content, expected, extra] of [
      ['bad!', 'words', {}],
      ['discord.gg/abc', 'invites', {}],
      ['https://site.example', 'links', {}],
      ['hi', 'mentions', { mentions: { users: { size: 5 } } }],
      ['THIS MESSAGE IS ALL IN UPPERCASE', 'caps', {}],
    ])
      assert.equal(x.automod.detect({ ...x.m, content, ...extra }, settings), expected);
    assert.equal(x.automod.detect({ ...x.m, content: 'badge' }, settings), null);
    x.automod.detect({ ...x.m, id: 'repeat1', content: 'repeat' }, settings);
    x.automod.detect({ ...x.m, id: 'repeat2', content: 'repeat' }, settings);
    assert.equal(x.automod.detect({ ...x.m, id: 'repeat3', content: 'repeat' }, settings), 'spam');
  } finally {
    x.db.close();
  }
});
test('staff, bots, webhooks and exempt roles never trigger destructive actions', async () => {
  const x = setup();
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      rules: { words: true },
      words: ['bad'],
    });
    const h = createAutoModHandler(x.c);
    for (const change of [
      { author: { id: 'u', bot: true } },
      { webhookId: 'w' },
      { system: true },
      { createdTimestamp: 0 },
    ])
      assert.equal(await h({ ...x.m, ...change }), false);
    x.member.permissions.has = () => true;
    assert.equal(await h(x.m), false);
    assert.equal(x.deleted.length, 0);
  } finally {
    x.db.close();
  }
});
test('warnings persist once and suppress autoresponder processing', async () => {
  const x = setup();
  try {
    x.automod.patch('g', { enabled: true, rules: { words: true }, words: ['bad'] });
    const h = createAutoModHandler(x.c);
    assert.equal(await h(x.m), true);
    assert.equal(await h(x.m), true);
    assert.equal(x.c.cases.warnings('g', 'u').length, 1);
    assert.equal(x.automod.incidents('g')[0].status, 'completed');
  } finally {
    x.db.close();
  }
});
test('unconfirmed delete never automatically retries and content is not stored', async () => {
  const x = setup();
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      rules: { words: true },
      words: ['bad'],
    });
    let n = 0;
    x.m.delete = async () => {
      n++;
      throw new Error('network');
    };
    const h = createAutoModHandler(x.c);
    await h(x.m);
    await h(x.m);
    assert.equal(n, 1);
    assert.equal(x.automod.incidents('g')[0].status, 'uncertain');
    assert(!JSON.stringify(x.automod.incidents('g')).includes('network'));
  } finally {
    x.db.close();
  }
});
test('eight management paths enforce runtime, save settings and localize results', async () => {
  const x = setup();
  try {
    x.member.permissions.has = () => true;
    x.c.guildConfig.setLanguage('g', 'hi');
    let sub = 'enable';
    const replies = [],
      i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => sub,
          getString: (name) =>
            name === 'status'
              ? null
              : name === 'action'
                ? 'warn'
                : name === 'name'
                  ? 'words'
                  : 'bad',
          getBoolean: () => true,
          getRole: () => ({ id: '100000000000000001' }),
        },
      };
    x.c.config.messageEventsEnabled = false;
    await assert.rejects(() => command.execute(i, x.c), /responderRuntimeDisabled/);
    x.c.config.messageEventsEnabled = true;
    for (const s of [
      'enable',
      'disable',
      'rule',
      'wordadd',
      'wordremove',
      'exempt',
      'config',
      'incidents',
    ]) {
      sub = s;
      await command.execute(i, x.c);
    }
    assert.equal(replies.length, 8);
    assert.match(replies[0].embeds[0].data.description, /चालू/);
  } finally {
    x.db.close();
  }
});
test('replayed messages do not inflate spam thresholds', () => {
  const x = setup();
  try {
    const settings = x.automod.patch('g', { rules: { spam: true } });
    for (let n = 0; n < 20; n++) assert.equal(x.automod.detect(x.m, settings), null);
  } finally {
    x.db.close();
  }
});
test('timeout action uses bounded until time,fresh native hierarchy and never shortens longer restriction', async () => {
  const x = setup();
  try {
    const effects = [];
    x.member.user = { bot: false };
    x.member.moderatable = true;
    x.member.roles.highest = {};
    x.member.disableCommunicationUntil = async (...a) => effects.push(a);
    x.bot.roles = { highest: { comparePositionTo: () => 1 } };
    x.automod.patch('g', {
      enabled: true,
      action: 'timeout',
      timeoutMinutes: 5,
      rules: { words: true },
      words: ['bad'],
    });
    const h = createAutoModHandler(x.c);
    const before = Date.now();
    await h(x.m);
    assert.equal(effects.length, 1);
    assert.equal(x.deleted.length, 1);
    assert(effects[0][0] >= before + 5 * 60000 && effects[0][0] <= Date.now() + 5 * 60000);
    await h(x.m);
    assert.equal(effects.length, 1);
    x.member.communicationDisabledUntilTimestamp = Date.now() + 60 * 60000;
    await h({ ...x.m, id: 'longer' });
    assert.equal(effects.length, 1);
    assert.equal(x.automod.incidents('g')[0].status, 'completed');
  } finally {
    x.db.close();
  }
});
test('timeout also deletes the message, and a failed or impossible delete never blocks the timeout', async () => {
  for (const mode of ['refused', 'nopermission', 'longer']) {
    const x = setup();
    try {
      const effects = [];
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.member.disableCommunicationUntil = async (...a) => effects.push(a);
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      if (mode === 'refused')
        x.m.delete = async () => {
          throw new Error('unknown message');
        };
      if (mode === 'nopermission')
        x.m.channel = { permissionsFor: () => ({ has: (p) => p !== P.ManageMessages }) };
      if (mode === 'longer') x.member.communicationDisabledUntilTimestamp = Date.now() + 3600000;
      x.automod.patch('g', {
        enabled: true,
        action: 'warn',
        ruleActions: { words: 'timeout' },
        timeoutMinutes: 5,
        rules: { words: true },
        words: ['bad'],
      });
      await createAutoModHandler(x.c)(x.m);
      assert.equal(effects.length, mode === 'longer' ? 0 : 1, mode);
      assert.equal(x.deleted.length, mode === 'longer' ? 1 : mode === 'refused' ? 0 : 0, mode);
      assert.equal(x.automod.incidents('g')[0].status, 'completed', mode);
    } finally {
      x.db.close();
    }
  }
});
test('timeout protected targets,current permission/hierarchy,changed config and native uncertainty fail safely', async () => {
  for (const kind of [
    'admin',
    'staff',
    'bot',
    'owner',
    'hierarchy',
    'permission',
    'unmoderatable',
    'changed',
    'threshold',
    'unknown',
  ]) {
    const x = setup();
    try {
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      const effects = [];
      x.member.disableCommunicationUntil = async () => {
        effects.push(1);
        if (kind === 'unknown') throw new Error('SECRET');
      };
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      let n = 0;
      x.guild.members.fetch = async () => {
        n++;
        if (n === 2) {
          if (kind === 'admin' || kind === 'staff') x.member.permissions.has = () => true;
          if (kind === 'bot') x.member.user.bot = true;
          if (kind === 'owner') x.member.id = x.guild.ownerId;
          if (kind === 'hierarchy') x.bot.roles.highest.comparePositionTo = () => 0;
          if (kind === 'permission') x.bot.permissions.has = () => false;
          if (kind === 'unmoderatable') x.member.moderatable = false;
          if (kind === 'changed') x.automod.patch('g', { enabled: false });
          if (kind === 'threshold') x.automod.patch('g', { mentionLimit: 10 });
        }
        return x.member;
      };
      const h = createAutoModHandler(x.c);
      await h(x.m);
      assert.equal(effects.length, kind === 'unknown' ? 1 : 0);
      assert.equal(x.automod.incidents('g')[0].status, kind === 'unknown' ? 'uncertain' : 'failed');
      await h(x.m);
      assert.equal(effects.length, kind === 'unknown' ? 1 : 0);
    } finally {
      x.db.close();
    }
  }
});
test('timeoutminutes and enable require current manager,explicit confirmation,native permission and localize', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      x.c.guildConfig.setLanguage('g', locale);
      let sub = 'timeoutminutes',
        confirm = false;
      const replies = [],
        i = {
          guild: x.guild,
          guildId: 'g',
          user: { id: 'u' },
          deferReply: async () => {},
          editReply: async (p) => replies.push(p),
          options: {
            getSubcommand: () => sub,
            getString: () => 'timeout',
            getInteger: () => 15,
            getBoolean: () => confirm,
          },
        };
      await command.execute(i, x.c);
      assert.equal(x.automod.get('g').timeoutMinutes, 15);
      assert(!x.automod.get('g').enabled);
      sub = 'enable';
      await assert.rejects(() => command.execute(i, x.c), /automodTimeoutConfirm/);
      confirm = true;
      x.bot.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, x.c), /automodTimeoutPermission/);
      x.bot.permissions.has = () => true;
      await command.execute(i, x.c);
      assert.equal(x.automod.get('g').action, 'timeout');
      assert.equal(
        replies[0].embeds[0].data.description,
        translate(locale, 'automodTimeoutSaved', { minutes: 15 }),
      );
      for (const m of [0, 61, 1.5])
        assert.throws(() => x.automod.patch('g', { timeoutMinutes: m }));
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod ignored channels are bounded,guild isolated and skip native member fetch/effects', async () => {
  const x = setup();
  const id = '100000000000000020';
  let fetches = 0;
  x.m.channel.id = id;
  x.guild.members.fetch = async () => {
    fetches++;
    return x.member;
  };
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      rules: { words: true },
      words: ['bad'],
    });
    x.automod.ignoreChannel('g', id, true);
    x.automod.ignoreChannel('g', id, true);
    assert.equal(x.automod.get('g').ignoredChannels.length, 1);
    assert.equal(x.automod.get('other').ignoredChannels.length, 0);
    assert.equal(await createAutoModHandler(x.c)(x.m), false);
    assert.equal(fetches, 0);
    assert.equal(x.deleted.length, 0);
    assert.equal(x.automod.incidents('g').length, 0);
    x.automod.ignoreChannel('g', id, false);
    assert.equal(x.automod.get('g').ignoredChannels.length, 0);
    for (let n = 0; n < 20; n++)
      x.automod.ignoreChannel('g', String(100000000000001000n + BigInt(n)), true);
    assert.throws(() => x.automod.ignoreChannel('g', id, true));
    assert.equal(x.automod.get('g').ignoredChannels.length, 20);
  } finally {
    x.db.close();
  }
});
test('AutoMod channel exclusion added during native member or delete permission validation prevents effects', async () => {
  for (const stage of ['member', 'bot']) {
    const x = setup(),
      id = '100000000000000020';
    x.m.channel.id = id;
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      rules: { words: true },
      words: ['bad'],
    });
    if (stage === 'member')
      x.guild.members.fetch = async () => {
        x.automod.ignoreChannel('g', id, true);
        return x.member;
      };
    else
      x.guild.members.fetchMe = async () => {
        x.automod.ignoreChannel('g', id, true);
        return x.bot;
      };
    try {
      await createAutoModHandler(x.c)(x.m);
      assert.equal(x.deleted.length, 0);
      if (stage === 'member') assert.equal(x.automod.incidents('g').length, 0);
      else assert.equal(x.automod.incidents('g')[0].status, 'failed');
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod ignorechannel slash requires exact current channel/actor and private locale output', async () => {
  const { ChannelType } = await import('discord.js');
  const id = '100000000000000020';
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    x.member.permissions.has = () => true;
    x.c.guildConfig.setLanguage('g', locale);
    x.guild.channels = {
      fetch: async (selected, o) => {
        assert.equal(selected, id);
        assert.equal(o.force, true);
        return { id, guildId: 'g', type: ChannelType.GuildText };
      },
    };
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'u' },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
      options: {
        getSubcommand: () => 'ignorechannel',
        getChannel: () => ({ id }),
        getBoolean: () => true,
      },
    };
    try {
      await command.execute(i, x.c);
      assert.deepEqual(x.automod.get('g').ignoredChannels, [id]);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      x.guild.channels.fetch = async () => ({
        id: 'other',
        guildId: 'g',
        type: ChannelType.GuildText,
      });
      await assert.rejects(() => command.execute(i, x.c), /channelTypeInvalid/);
      x.member.id = 'other';
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod exact current member identity and runtime prevent wrong-person records/effects', async () => {
  for (const kind of ['id', 'guild', 'missing', 'runtime']) {
    const x = setup();
    x.automod.patch('g', { enabled: true, action: 'warn', rules: { words: true }, words: ['bad'] });
    if (kind === 'id') x.member.id = 'other';
    if (kind === 'guild') x.member.guild.id = 'other';
    if (kind === 'missing') x.guild.members.fetch = async () => null;
    if (kind === 'runtime') x.c.config.messageEventsEnabled = false;
    try {
      await createAutoModHandler(x.c)(x.m);
      assert.equal(x.automod.incidents('g').length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
      assert.equal(x.deleted.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod legacy JSON defaults empty exclusions and channel policy survives actual reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-ignore-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    db.prepare('INSERT INTO automod_settings VALUES(?,?)').run(
      'g',
      JSON.stringify({ enabled: true, action: 'warn', words: ['bad'], rules: { words: true } }),
    );
    let a = new AutoMod(db);
    assert.deepEqual(a.get('g').ignoredChannels, []);
    a.ignoreChannel('g', '100000000000000020', true);
    db.close();
    db = openDatabase(path);
    a = new AutoMod(db);
    assert.deepEqual(a.get('g').ignoredChannels, ['100000000000000020']);
    assert.equal(a.get('g').enabled, true);
    assert.deepEqual(a.get('g').words, ['bad']);
    assert.deepEqual(a.get('other').ignoredChannels, []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AutoMod bounded mention/caps tuning changes detection not enabled state or unrelated policies', () => {
  const x = setup();
  try {
    const s = x.automod.patch('g', {
      rules: { mentions: true, caps: true },
      mentionLimit: 3,
      capsPercent: 50,
      capsMinLetters: 10,
    });
    assert.equal(s.enabled, false);
    assert.equal(
      x.automod.detect(
        { ...x.m, content: 'hi', mentions: { users: { size: 2 }, roles: { size: 0 } } },
        s,
      ),
      null,
    );
    assert.equal(
      x.automod.detect({ ...x.m, content: 'hi', mentions: { users: { size: 3 } } }, s),
      'mentions',
    );
    assert.equal(
      x.automod.detect({ ...x.m, content: 'hi', mentions: { everyone: true } }, s),
      'mentions',
    );
    assert.equal(x.automod.detect({ ...x.m, content: 'AAAAAaaaaa' }, s), null);
    assert.equal(x.automod.detect({ ...x.m, content: 'AAAAAAaaaa' }, s), 'caps');
    assert.equal(x.automod.detect({ ...x.m, content: 'AAAAAAAAA' }, s), null);
    for (const change of [
      { mentionLimit: 1 },
      { mentionLimit: 21 },
      { capsPercent: 49 },
      { capsPercent: 101 },
      { capsMinLetters: 9 },
      { capsMinLetters: 101 },
      { capsPercent: 1.5 },
    ])
      assert.throws(() => x.automod.patch('g', change));
    assert.equal(x.automod.get('other').mentionLimit, 5);
  } finally {
    x.db.close();
  }
});
test('AutoMod thresholds slash requires at least one value,current authority and localized private output', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    x.member.permissions.has = () => true;
    x.c.guildConfig.setLanguage('g', locale);
    let value = null;
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'u' },
      deferReply: async () => {},
      editReply: async (p) => replies.push(p),
      options: {
        getSubcommand: () => 'thresholds',
        getInteger: (n) => (n === 'mentions' ? value : null),
      },
    };
    try {
      await assert.rejects(() => command.execute(i, x.c), /automodThresholdRequired/);
      value = 10;
      await command.execute(i, x.c);
      assert.equal(x.automod.get('g').mentionLimit, 10);
      assert.equal(x.automod.get('g').capsPercent, 80);
      assert.equal(x.automod.get('g').enabled, false);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod tuned thresholds persist across SQLite reopen and legacy settings retain defaults', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-threshold-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    db.prepare('INSERT INTO automod_settings VALUES(?,?)').run(
      'legacy',
      JSON.stringify({ enabled: false, action: 'warn' }),
    );
    let a = new AutoMod(db);
    assert.equal(a.get('legacy').mentionLimit, 5);
    assert.equal(a.get('legacy').capsPercent, 80);
    assert.equal(a.get('legacy').capsMinLetters, 20);
    a.patch('g', { mentionLimit: 12, capsPercent: 95, capsMinLetters: 50 });
    db.close();
    db = openDatabase(path);
    a = new AutoMod(db);
    assert.equal(a.get('g').mentionLimit, 12);
    assert.equal(a.get('g').capsPercent, 95);
    assert.equal(a.get('g').capsMinLetters, 50);
    assert.equal(a.get('g').enabled, false);
    assert.equal(a.get('legacy').mentionLimit, 5);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AutoMod text dry-run evaluates configured static rules without incident,spam state or content echo', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(),
      replies = [];
    x.member.permissions.has = () => true;
    x.c.guildConfig.setLanguage('g', locale);
    x.automod.patch('g', { rules: { words: true, spam: true, mentions: true }, words: ['bad'] });
    const before = x.automod.get('g');
    let text = 'bad PRIVATE SAMPLE';
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'u' },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
      options: { getSubcommand: () => 'testtext', getString: () => text },
    };
    try {
      await command.execute(i, x.c);
      assert(replies[0].embeds[0].data.description.includes('words'));
      assert(!JSON.stringify(replies).includes('PRIVATE SAMPLE'));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      text = '@everyone repeated';
      for (let n = 0; n < 6; n++) await command.execute(i, x.c);
      assert.equal(x.automod.recent.size, 0);
      assert.equal(x.automod.incidents('g').length, 0);
      assert.deepEqual(x.automod.get('g'), before);
      assert.equal(x.deleted.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod testtext rejects invalid input/current authority without output', async () => {
  const x = setup();
  x.member.permissions.has = () => true;
  let text = '';
  let n = 0;
  const i = {
    guild: x.guild,
    guildId: 'g',
    user: { id: 'u' },
    deferReply: async () => {},
    editReply: async () => n++,
    options: { getSubcommand: () => 'testtext', getString: () => text },
  };
  try {
    for (const value of ['', null, 'x'.repeat(1801)]) {
      text = value;
      await assert.rejects(() => command.execute(i, x.c));
    }
    text = 'good';
    x.member.id = 'other';
    await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    assert.equal(n, 0);
  } finally {
    x.db.close();
  }
});

test('automod enable rejects foreign bot and postfetch permission/runtime loss without consent write', async () => {
  for (const kind of ['bot', 'memberGuild', 'permissionRace', 'runtimeRace']) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async () => {},
        options: { getSubcommand: () => 'enable', getString: () => 'delete' },
      };
      x.guild.members.fetchMe = async () => {
        if (kind === 'permissionRace') x.member.permissions.has = () => false;
        if (kind === 'runtimeRace') x.c.config.messageEventsEnabled = false;
        return {
          ...x.bot,
          id: kind === 'bot' ? 'other' : 'bot',
          guild: { id: kind === 'memberGuild' ? 'other' : 'g' },
        };
      };
      await assert.rejects(() => command.execute(i, x.c));
      assert.equal(x.automod.get('g').enabled, false);
    } finally {
      x.db.close();
    }
  }
});
test('automod exempt forces exact role and refreshes admin after role lookup', async () => {
  for (const kind of ['role', 'permissionRace']) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      const id = '100000000000000001',
        i = {
          guild: x.guild,
          guildId: 'g',
          user: { id: 'u' },
          deferReply: async () => {},
          options: {
            getSubcommand: () => 'exempt',
            getRole: () => ({ id }),
            getBoolean: () => true,
          },
        };
      x.guild.roles.fetch = async (selected, o) => {
        assert.equal(selected, id);
        assert.deepEqual(o, { force: true });
        if (kind === 'permissionRace') x.member.permissions.has = () => false;
        return { id: kind === 'role' ? 'other' : id, guild: { id: 'g' } };
      };
      await assert.rejects(() => command.execute(i, x.c));
      assert.deepEqual(x.automod.get('g').exemptRoles, []);
    } finally {
      x.db.close();
    }
  }
});

test('removepolicy removes only one stored channel/role with no native target lookup', async () => {
  for (const kind of ['channel', 'role'])
    for (const locale of ['en', 'hi', 'hinglish']) {
      const x = setup();
      try {
        x.member.permissions.has = () => true;
        x.c.guildConfig.setLanguage('g', locale);
        const id = '100000000000000001',
          other = '100000000000000002';
        x.automod.patch('g', { ignoredChannels: [id, other], exemptRoles: [id, other] });
        const before = x.automod.get('g');
        x.guild.roles.fetch = async () => {
          throw Error('no target read');
        };
        x.guild.channels = {
          fetch: async () => {
            throw Error('no target read');
          },
        };
        const replies = [];
        await command.execute(
          {
            guild: x.guild,
            guildId: 'g',
            user: { id: 'u' },
            deferReply: async () => {},
            editReply: async (p) => replies.push(p),
            options: {
              getSubcommand: () => 'removepolicy',
              getString: (n) => (n === 'kind' ? kind : id),
              getBoolean: () => true,
            },
          },
          x.c,
        );
        const after = x.automod.get('g');
        assert.deepEqual(after, {
          ...before,
          [kind === 'channel' ? 'ignoredChannels' : 'exemptRoles']: [other],
        });
        assert.deepEqual(replies[0].allowedMentions.parse, []);
      } finally {
        x.db.close();
      }
    }
});
test('removepolicy validates confirmation/kind/ID before mutation', async () => {
  const x = setup();
  try {
    x.member.permissions.has = () => true;
    const id = '100000000000000001';
    x.automod.ignoreChannel('g', id, true);
    for (const [confirm, kind, subject] of [
      [false, 'channel', id],
      [true, 'wrong', id],
      [true, 'channel', 'bad'],
    ]) {
      await assert.rejects(() =>
        command.execute(
          {
            guild: x.guild,
            guildId: 'g',
            user: { id: 'u' },
            deferReply: async () => {},
            options: {
              getSubcommand: () => 'removepolicy',
              getString: (n) => (n === 'kind' ? kind : subject),
              getBoolean: () => confirm,
            },
          },
          x.c,
        ),
      );
      assert.deepEqual(x.automod.get('g').ignoredChannels, [id]);
    }
  } finally {
    x.db.close();
  }
});

test('AutoMod phrase listing is bounded private localized and preserves exact stored settings', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      x.c.guildConfig.setLanguage('g', locale);
      x.automod.patch('g', {
        words: Array.from({ length: 45 }, (_, n) =>
          n === 20 ? '@everyone **danger**' : 'phrase' + n,
        ),
      });
      const before = x.automod.get('g'),
        replies = [];
      let page = 2;
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async (p) => assert(p.flags),
        editReply: async (p) => replies.push(p),
        options: { getSubcommand: () => 'wordlist', getInteger: () => page },
      };
      await command.execute(i, x.c);
      const text = replies[0].embeds[0].data.description;
      assert(text.includes(translate(locale, 'automodWordList', { page: 2, total: 45 })));
      assert(text.includes('21. @everyone'));
      assert(!text.includes('phrase19'));
      assert(text.includes('40. phrase39'));
      assert(!text.includes('phrase40'));
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      page = 250;
      await command.execute(i, x.c);
      assert(
        replies[1].embeds[0].data.description.includes(translate(locale, 'automodWordListEmpty')),
      );
      assert.deepEqual(x.automod.get('g'), before);
      assert.equal(x.deleted.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod phrase listing validates pages and manager identity before private storage read', async () => {
  for (const kind of ['zero', 'fraction', 'large', 'permission', 'actor', 'guild']) {
    const x = setup();
    try {
      x.member.permissions.has = () => kind !== 'permission';
      if (kind === 'actor') x.member.id = 'other';
      if (kind === 'guild') x.member.guild.id = 'other';
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async () => {},
        editReply: async () => assert.fail('no output'),
        options: {
          getSubcommand: () => 'wordlist',
          getInteger: () =>
            kind === 'zero' ? 0 : kind === 'fraction' ? 1.5 : kind === 'large' ? 251 : 1,
        },
      };
      await assert.rejects(
        () => command.execute(i, x.c),
        kind === 'permission' || kind === 'actor' || kind === 'guild'
          ? /userPermission/
          : /automodWordPageInvalid/,
      );
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod phrase listing default page reads only exact guild and does not require message events', async () => {
  const x = setup();
  try {
    x.member.permissions.has = () => true;
    x.c.config.messageEventsEnabled = false;
    x.automod.word('foreign', 'secret', true);
    const replies = [];
    await command.execute(
      {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: { getSubcommand: () => 'wordlist', getInteger: () => null },
      },
      x.c,
    );
    assert(!JSON.stringify(replies).includes('secret'));
    assert(replies[0].embeds[0].data.description.includes('total 0'));
    assert.equal(
      x.db.prepare('SELECT count(*) n FROM automod_settings WHERE guild_id=?').get('g').n,
      0,
    );
  } finally {
    x.db.close();
  }
});

test('spam thresholds default compatibly and bounded config validates without enabling rules', () => {
  const x = setup();
  try {
    const s = x.automod.get('g');
    assert.equal(s.spamMessages, 6);
    assert.equal(s.spamRepeats, 3);
    assert.equal(s.spamWindowSeconds, 10);
    x.automod.patch('g', { spamMessages: 10, spamRepeats: 2, spamWindowSeconds: 30 });
    assert.equal(x.automod.get('g').enabled, false);
    assert.equal(x.automod.get('other').spamMessages, 6);
    for (const changes of [
      { spamMessages: 2 },
      { spamMessages: 11 },
      { spamRepeats: 1 },
      { spamRepeats: 11 },
      { spamWindowSeconds: 4 },
      { spamWindowSeconds: 31 },
      { spamMessages: 3.5 },
    ])
      assert.throws(() => x.automod.patch('g', changes));
  } finally {
    x.db.close();
  }
});
test('spam rolling window boundary/replay counts reflect configured thresholds and per-user guild scope', () => {
  const x = setup();
  try {
    let now = 100000;
    x.automod.now = () => now;
    const s = x.automod.patch('g', {
      rules: { spam: true },
      spamMessages: 3,
      spamRepeats: 2,
      spamWindowSeconds: 5,
    });
    assert.equal(x.automod.detect({ ...x.m, id: '1', content: 'a' }, s), null);
    assert.equal(x.automod.detect({ ...x.m, id: '1', content: 'a' }, s), null);
    assert.equal(x.automod.detect({ ...x.m, id: '2', content: 'b' }, s), null);
    assert.equal(x.automod.detect({ ...x.m, id: '3', content: 'c' }, s), 'spam');
    assert.equal(
      x.automod.detect({ ...x.m, id: '4', guild: { id: 'other' }, content: 'a' }, s),
      null,
    );
    now += 5000;
    assert.equal(x.automod.detect({ ...x.m, id: '5', content: 'a' }, s), null);
    assert.equal(x.automod.detect({ ...x.m, id: '6', content: ' A ' }, s), 'spam');
  } finally {
    x.db.close();
  }
});
test('spam history cleanup retains longest allowed window then expires and remains bounded', () => {
  const x = setup();
  try {
    let now = 100000;
    x.automod.now = () => now;
    const s = x.automod.patch('g', {
      rules: { spam: true },
      spamMessages: 10,
      spamRepeats: 10,
      spamWindowSeconds: 30,
    });
    x.automod.detect({ ...x.m, id: 'a', content: 'one' }, s);
    now += 15000;
    x.automod.cleanup();
    assert.equal(x.automod.recent.size, 1);
    now += 15000;
    x.automod.cleanup();
    assert.equal(x.automod.recent.size, 0);
    for (let n = 0; n < 50; n++) x.automod.detect({ ...x.m, id: String(n), content: String(n) }, s);
    assert.equal(x.automod.recent.get('g:u').length, 10);
  } finally {
    x.db.close();
  }
});
test('AutoMod finish transitions one reserved receipt only and logging failure cannot rewrite completed', async () => {
  const x = setup();
  try {
    x.automod.reserve(x.m, 'words', 'warn');
    x.automod.finish(x.m.id, 'completed');
    for (const status of ['completed', 'uncertain', 'failed'])
      assert.throws(() => x.automod.finish(x.m.id, status));
    assert.throws(() => x.automod.finish('missing', 'completed'));
    x.db.prepare('DELETE FROM automod_incidents').run();
    x.automod.patch('g', { enabled: true, rules: { words: true }, words: ['bad'] });
    x.c.serverLogs = {
      emit: async () => {
        throw Error('log failed');
      },
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(x.automod.incidents('g')[0].status, 'completed');
  } finally {
    x.db.close();
  }
});
test('spamthreshold slash updates chosen bounds privately in all locales with manager gate and no enabling', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      x.guild.members.fetch = async () => ({
        id: 'actor',
        guild: { id: 'g' },
        permissions: { has: () => true },
      });
      let p;
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'actor' },
        deferReply: async (r) => assert.equal(r.flags, 64),
        editReply: async (r) => {
          p = r;
        },
        options: {
          getSubcommand: () => 'spamthresholds',
          getInteger: (n) => (n === 'messages' ? 4 : n === 'repeats' ? 2 : 15),
        },
      };
      await command.execute(i, x.c);
      assert.equal(x.automod.get('g').enabled, false);
      assert.deepEqual(p.allowedMentions.parse, []);
      assert.equal(
        p.embeds[0].data.description,
        translate(locale, 'automodSpamConfig', { messages: 4, repeats: 2, seconds: 15 }),
      );
      const before = x.automod.get('g');
      i.options.getInteger = () => null;
      await assert.rejects(() => command.execute(i, x.c), /automodThresholdRequired/);
      assert.deepEqual(x.automod.get('g'), before);
      x.guild.members.fetch = async () => ({
        id: 'wrong',
        guild: { id: 'g' },
        permissions: { has: () => true },
      });
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});

test('unresolved AutoMod metadata oldest-first bounded pages exclude terminal/foreign records without changing them', () => {
  const x = setup();
  try {
    for (let n = 0; n < 16; n++)
      x.db
        .prepare('INSERT INTO automod_incidents VALUES(?,?,?,?,?,?,?)')
        .run(
          String(n).padStart(3, '0'),
          'g',
          'u',
          'words',
          'delete',
          n < 14 ? (n % 2 ? 'uncertain' : 'reserved') : 'completed',
          100000 + n,
        );
    x.db
      .prepare('INSERT INTO automod_incidents VALUES(?,?,?,?,?,?,?)')
      .run('foreign', 'other', 'u', 'links', 'timeout', 'uncertain', 99999);
    x.db
      .prepare('INSERT INTO automod_incidents VALUES(?,?,?,?,?,?,?)')
      .run('failed', 'g', 'u', 'words', 'warn', 'failed', 99999);
    const before = x.automod.incidents('g'),
      a = x.automod.unresolved('g'),
      b = x.automod.unresolved('g', 2);
    assert.equal(a.length, 10);
    assert.equal(b.length, 4);
    assert.equal(a[0].message_id, '000');
    assert.equal(b[0].message_id, '010');
    assert.equal(x.automod.unresolved('g', 10).length, 0);
    assert.equal(x.automod.unresolved('other').length, 1);
    assert.deepEqual(Object.keys(a[0]), [
      'message_id',
      'user_id',
      'rule',
      'action',
      'status',
      'created_at',
    ]);
    assert.deepEqual(x.automod.incidents('g'), before);
    for (const page of [0, 11, 1.5, '1'])
      assert.throws(() => x.automod.unresolved('g', page), /automodIncidentPageInvalid/);
  } finally {
    x.db.close();
  }
});
test('AutoMod unresolved slash privately localizes states and enforces exact current manager before metadata access', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.automod.reserve(x.m, 'words', 'delete');
      x.c.guildConfig.setLanguage('g', locale);
      let reply;
      x.guild.members.fetch = async () => ({
        id: 'actor',
        guild: { id: 'g' },
        permissions: { has: () => true },
      });
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'actor' },
        deferReply: async (r) => assert.equal(r.flags, 64),
        editReply: async (r) => {
          reply = r;
        },
        options: { getSubcommand: () => 'unresolved', getInteger: () => null },
      };
      await command.execute(i, x.c);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.includes(translate(locale, 'automodState_reserved')));
      assert(reply.embeds[0].data.description.includes('msg | u | words | delete'));
      assert.equal(x.deleted.length, 0);
      assert.equal(x.automod.incidents('g')[0].status, 'reserved');
      let reads = 0;
      const original = x.automod.unresolved.bind(x.automod);
      x.automod.unresolved = (...args) => {
        reads++;
        return original(...args);
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
    } finally {
      x.db.close();
    }
  }
});
test('unresolved AutoMod slash rejects invalid pages and handles empty guild without native mutation', async () => {
  const x = setup();
  try {
    x.guild.members.fetch = async () => ({
      id: 'actor',
      guild: { id: 'g' },
      permissions: { has: () => true },
    });
    let reply;
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'actor' },
      deferReply: async () => {},
      editReply: async (r) => {
        reply = r;
      },
      options: { getSubcommand: () => 'unresolved', getInteger: () => 11 },
    };
    await assert.rejects(() => command.execute(i, x.c), /automodIncidentPageInvalid/);
    assert.equal(reply, undefined);
    i.options.getInteger = () => 10;
    await command.execute(i, x.c);
    assert(reply.embeds[0].data.description.includes('10'));
    assert.equal(x.automod.incidents('g').length, 0);
    assert.equal(x.deleted.length, 0);
  } finally {
    x.db.close();
  }
});
test('spam threshold config and unresolved recovery survive actual SQLite reopen without replaying effects', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-spam-recovery-'));
  let db = openDatabase(join(dir, 'db'));
  try {
    let a = new AutoMod(db);
    a.patch('g', { spamMessages: 9, spamRepeats: 7, spamWindowSeconds: 25 });
    a.reserve({ id: 'pending', guild: { id: 'g' }, author: { id: 'u' } }, 'spam', 'timeout');
    db.close();
    db = openDatabase(join(dir, 'db'));
    a = new AutoMod(db);
    assert.equal(a.get('g').spamMessages, 9);
    assert.equal(a.get('g').spamRepeats, 7);
    assert.equal(a.get('g').spamWindowSeconds, 25);
    assert.equal(a.get('g').enabled, false);
    a.recover();
    assert.equal(a.unresolved('g')[0].status, 'uncertain');
    assert.throws(() => a.finish('pending', 'completed'));
    assert.equal(a.recent.size, 0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('automod word mode and exemptions require exact booleans without widening exemptions on truthy inputs', () => {
  const x = setup();
  try {
    const before = x.c.automod.get('g');
    for (const mode of [undefined, null, 0, 1, 'false', {}]) {
      assert.throws(() => x.c.automod.word('g', 'bad', mode), /mode/);
      assert.throws(() => x.c.automod.exempt('g', '100000000000000001', mode), /mode/);
      assert.deepEqual(x.c.automod.get('g'), before);
    }
  } finally {
    x.db.close();
  }
});
test('automod literal words validate raw and normalized bounds/control characters before write', () => {
  const x = setup();
  try {
    const r = x.c.automod;
    for (const bad of [
      undefined,
      123,
      {},
      'a'.repeat(51),
      'ﬃ'.repeat(17),
      'a\u0000b',
      'a\u001bb',
      'a\u007fb',
    ])
      assert.throws(() => r.word('g', bad, true), /automodWordInvalid/);
    assert.deepEqual(r.get('g').words, []);
    r.word('g', 'ＦＯＯ', true);
    r.word('g', 'foo', true);
    assert.deepEqual(r.get('g').words, ['foo']);
    r.word('g', ' hello\tworld ', true);
    assert.deepEqual(r.get('g').words, ['foo', 'hello world']);
  } finally {
    x.db.close();
  }
});

test('AutoMod malformed truthy runtime flag cannot authorize warning or delete effect', async () => {
  for (const value of ['true', 'false', 1, {}, null]) {
    const x = setup();
    try {
      x.c.automod.patch('g', { enabled: true, action: 'delete', rules: { words: true } });
      x.c.automod.word('g', 'bad', true);
      x.c.config.messageEventsEnabled = value;
      await createAutoModHandler(x.c)(x.m);
      assert.equal(x.deleted.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod runtime disabled during member lookup cannot reserve incident or warning', async () => {
  const x = setup();
  try {
    x.automod.patch('g', { enabled: true, rules: { words: true } });
    x.automod.word('g', 'bad', true);
    x.guild.members.fetch = async () => {
      x.c.config.messageEventsEnabled = false;
      return x.member;
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 0);
    assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
  } finally {
    x.db.close();
  }
});
test('AutoMod runtime revoked during delete bot lookup fails reserved incident without deleting message', async () => {
  const x = setup();
  try {
    x.automod.patch('g', { enabled: true, action: 'delete', rules: { words: true } });
    x.automod.word('g', 'bad', true);
    x.guild.members.fetchMe = async () => {
      x.c.config.messageEventsEnabled = false;
      return x.bot;
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(x.deleted.length, 0);
    assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
  } finally {
    x.db.close();
  }
});

test('AutoMod message aging out or becoming future-dated during member lookup creates no warning/incident', async () => {
  for (const offset of [-600000, 600000]) {
    const x = setup();
    try {
      x.automod.patch('g', { enabled: true, rules: { words: true }, words: ['bad'] });
      x.guild.members.fetch = async () => {
        x.m.createdTimestamp = Date.now() + offset;
        return x.member;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod message aging out during delete authority lookup fails reservation without native delete', async () => {
  const x = setup();
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      rules: { words: true },
      words: ['bad'],
    });
    x.guild.members.fetchMe = async () => {
      x.m.createdTimestamp = Date.now() - 300001;
      return x.bot;
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(x.deleted.length, 0);
    assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
  } finally {
    x.db.close();
  }
});
test('AutoMod message aging out during timeout authority lookup fails reservation without native timeout', async () => {
  const x = setup();
  let timeouts = 0;
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'timeout',
      rules: { words: true },
      words: ['bad'],
    });
    x.member.user = { bot: false };
    x.member.moderatable = true;
    x.member.roles.highest = {};
    x.member.disableCommunicationUntil = async () => {
      timeouts++;
    };
    x.bot.roles = { highest: { comparePositionTo: () => 1 } };
    x.guild.members.fetchMe = async () => {
      x.m.createdTimestamp = Date.now() - 300001;
      return x.bot;
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(timeouts, 0);
    assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
  } finally {
    x.db.close();
  }
});

test('AutoMod requires positively human author before member lookup or moderation reservation', async () => {
  for (const flag of [undefined, null, 0, '', 'false', {}, true]) {
    const x = setup();
    let fetches = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'delete',
        rules: { words: true },
        words: ['bad'],
      });
      x.m.author.bot = flag;
      x.guild.members.fetch = async () => {
        fetches++;
        return x.member;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(fetches, 0);
      assert.equal(x.deleted.length, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod timeout requires positively human fresh target before native moderation', async () => {
  for (const flag of [undefined, null, 0, '', 'false', {}, true]) {
    const x = setup();
    let calls = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      x.member.disableCommunicationUntil = async () => {
        calls++;
      };
      let fetches = 0;
      x.guild.members.fetch = async () => {
        if (++fetches === 2) x.member.user = { bot: flag };
        return x.member;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(calls, 0);
      assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod timeout requires exact native moderatable true;truthy unknown cannot authorize action', async () => {
  for (const flag of [undefined, null, 0, 1, 'true', 'false', {}, false]) {
    const x = setup();
    let calls = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = flag;
      x.member.roles.highest = {};
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      x.member.disableCommunicationUntil = async () => {
        calls++;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(calls, 0);
      assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod stats aggregate stored outcomes/actions with exact guild scope and no identities/content', () => {
  const x = setup();
  try {
    for (const [id, guild, action, status] of [
      ['SECRET1', 'g', 'warn', 'completed'],
      ['SECRET2', 'g', 'delete', 'failed'],
      ['SECRET3', 'g', 'timeout', 'uncertain'],
      ['SECRET4', 'g', 'warn', 'reserved'],
      ['FOREIGN', 'other', 'delete', 'reserved'],
    ]) {
      x.automod.reserve(
        { id, guild: { id: guild }, author: { id: 'PRIVATE_USER' } },
        'words',
        action,
      );
      if (status !== 'reserved') x.automod.finish(id, status);
    }
    const before = x.db.prepare('SELECT * FROM automod_incidents').all();
    assert.deepEqual(x.automod.stats('g'), [
      { status: 'completed', action: 'warn', rule: 'words', count: 1 },
      { status: 'failed', action: 'delete', rule: 'words', count: 1 },
      { status: 'reserved', action: 'warn', rule: 'words', count: 1 },
      { status: 'uncertain', action: 'timeout', rule: 'words', count: 1 },
    ]);
    assert.deepEqual(x.automod.stats('none'), []);
    assert(!JSON.stringify(x.automod.stats('g')).includes('SECRET'));
    assert(!JSON.stringify(x.automod.stats('g')).includes('PRIVATE_USER'));
    assert.deepEqual(x.db.prepare('SELECT * FROM automod_incidents').all(), before);
  } finally {
    x.db.close();
  }
});
test('AutoMod stats command uses current manager/private localized no-ping read-only aggregates', async () => {
  const { translate } = await import('../src/services/localization.js');
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      x.member.permissions.has = () => true;
      x.automod.reserve(x.m, 'words', 'warn');
      x.automod.finish(x.m.id, 'completed');
      const before = x.db.prepare('SELECT * FROM automod_incidents').all();
      let reply;
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        options: { getSubcommand: () => 'stats' },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
      };
      await command.execute(i, x.c);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.embeds[0].data.description,
        translate(locale, 'automodStats', {
          total: 1,
          reserved: 0,
          completed: 1,
          uncertain: 0,
          failed: 0,
          warn: 1,
          delete: 0,
          timeout: 0,
        }),
      );
      assert.deepEqual(x.db.prepare('SELECT * FROM automod_incidents').all(), before);
      assert.equal(x.deleted.length, 0);
      x.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod stats distinguish recovered unresolved reservations without retries or cleanup mutation', () => {
  const x = setup();
  try {
    x.automod.reserve(x.m, 'words', 'delete');
    assert.equal(x.automod.stats('g')[0].status, 'reserved');
    x.automod.recover();
    assert.deepEqual(x.automod.stats('g'), [
      { status: 'uncertain', action: 'delete', rule: 'words', count: 1 },
    ]);
    x.db.prepare('UPDATE automod_incidents SET created_at=0').run();
    assert.equal(x.automod.stats('g')[0].count, 1);
    assert.equal(x.automod.incidents('g').length, 1);
    assert.equal(x.deleted.length, 0);
  } finally {
    x.db.close();
  }
});

test('AutoMod enable cannot persist operator consent from truthy malformed runtime flags', async () => {
  for (const flag of [undefined, null, 1, 'true', 'false', {}]) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      x.c.config.messageEventsEnabled = flag;
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        options: { getSubcommand: () => 'enable', getString: () => 'warn' },
        deferReply: async () => {},
        editReply: async () => {
          throw new Error('unexpected reply');
        },
      };
      await assert.rejects(() => command.execute(i, x.c), /responderRuntimeDisabled/);
      assert.equal(x.automod.get('g').enabled, false);
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod enable rechecks exact runtime after authority refresh and before settings write', async () => {
  for (const action of ['warn', 'delete', 'timeout']) {
    const x = setup();
    try {
      x.member.permissions.has = () => true;
      let checks = 0;
      x.guild.members.fetch = async () => {
        if (++checks === 2) x.c.config.messageEventsEnabled = 'true';
        return x.member;
      };
      const i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        options: { getSubcommand: () => 'enable', getString: () => action, getBoolean: () => true },
        deferReply: async () => {},
        editReply: async () => {
          throw new Error('unexpected reply');
        },
      };
      await assert.rejects(() => command.execute(i, x.c), /responderRuntimeDisabled/);
      assert.equal(checks, 2);
      assert.equal(x.automod.get('g').enabled, false);
      assert.equal(x.automod.get('g').action, 'warn');
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod invalid spam clock cannot alter history or count repeated messages', () => {
  const x = setup();
  try {
    const settings = x.automod.patch('g', { rules: { spam: true }, spamRepeats: 2 });
    let clock = 100000;
    x.automod.now = () => clock;
    assert.equal(x.automod.detect({ ...x.m, id: 'first', content: 'repeat' }, settings), null);
    const before = structuredClone([...x.automod.recent]);
    for (const bad of [undefined, null, NaN, Infinity, -1, 1.5, '100001']) {
      clock = bad;
      assert.equal(x.automod.detect({ ...x.m, id: 'second', content: 'repeat' }, settings), null);
      assert.deepEqual([...x.automod.recent], before);
    }
    clock = 100001;
    assert.equal(x.automod.detect({ ...x.m, id: 'second', content: 'repeat' }, settings), 'spam');
  } finally {
    x.db.close();
  }
});
test('AutoMod spam clock rollback cannot treat future history as current violations', () => {
  const x = setup();
  try {
    const settings = x.automod.patch('g', { rules: { spam: true }, spamRepeats: 2 });
    let clock = 100000;
    x.automod.now = () => clock;
    assert.equal(x.automod.detect({ ...x.m, id: 'first', content: 'repeat' }, settings), null);
    clock = 99999;
    assert.equal(x.automod.detect({ ...x.m, id: 'second', content: 'repeat' }, settings), null);
    assert.deepEqual(
      x.automod.recent.get('g:u').map((r) => r.id),
      ['second'],
    );
    clock = 100000;
    assert.equal(x.automod.detect({ ...x.m, id: 'third', content: 'repeat' }, settings), 'spam');
  } finally {
    x.db.close();
  }
});

test('AutoMod cannot shorten unknown native timeout deadline;malformed state fails reserved incident', async () => {
  for (const deadline of [undefined, NaN, Infinity, -1, '9999999999999', {}, 1.5]) {
    const x = setup();
    let effects = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.member.communicationDisabledUntilTimestamp = deadline;
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      x.member.disableCommunicationUntil = async () => {
        effects++;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(effects, 0);
      assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod accepts explicit absent/expired native deadlines and preserves longer verified timeout', async () => {
  for (const deadline of [null, 0, Date.now() - 1000, Date.now() + 3600000]) {
    const x = setup();
    let effects = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.member.communicationDisabledUntilTimestamp = deadline;
      x.bot.roles = { highest: { comparePositionTo: () => 1 } };
      x.member.disableCommunicationUntil = async () => {
        effects++;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(effects, deadline > Date.now() ? 0 : 1);
      assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'completed');
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod malformed native hierarchy comparison cannot authorize timeout', async () => {
  for (const comparison of [undefined, null, NaN, Infinity, -Infinity, '1', {}, 1.5, 0, -1]) {
    const x = setup();
    let effects = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.bot.roles = { highest: { comparePositionTo: () => comparison } };
      x.member.disableCommunicationUntil = async () => {
        effects++;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(effects, 0);
      assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
    } finally {
      x.db.close();
    }
  }
});
test('AutoMod valid positive native hierarchy permits timeout;missing highest role is contained', async () => {
  for (const comparison of [1, 10, Number.MAX_SAFE_INTEGER, 'missing']) {
    const x = setup();
    let effects = 0;
    try {
      x.automod.patch('g', {
        enabled: true,
        action: 'timeout',
        rules: { words: true },
        words: ['bad'],
      });
      x.member.user = { bot: false };
      x.member.moderatable = true;
      x.member.roles.highest = {};
      x.bot.roles =
        comparison === 'missing' ? {} : { highest: { comparePositionTo: () => comparison } };
      x.member.disableCommunicationUntil = async () => {
        effects++;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(effects, comparison === 'missing' ? 0 : 1);
      assert.equal(
        x.db.prepare('SELECT status FROM automod_incidents').get().status,
        comparison === 'missing' ? 'failed' : 'completed',
      );
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod post-lookup author/system/webhook changes cannot reserve warning', async () => {
  for (const change of [
    { author: { id: 'u', bot: true } },
    { author: { id: 'u' } },
    { system: true },
    { webhookId: 'hook' },
  ]) {
    const x = setup();
    try {
      x.automod.patch('g', { enabled: true, rules: { words: true }, words: ['bad'] });
      x.guild.members.fetch = async () => {
        Object.assign(x.m, change);
        return x.member;
      };
      await createAutoModHandler(x.c)(x.m);
      assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 0);
      assert.equal(x.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      x.db.close();
    }
  }
});

test('AutoMod incident status filter applies before newest20 limit and remains guild scoped', () => {
  const x = setup();
  try {
    let clock = 100000;
    x.automod.now = () => clock;
    for (let n = 0; n < 25; n++) {
      x.automod.reserve({ ...x.m, id: 'old' + n }, 'words', 'delete');
      x.automod.finish('old' + n, 'uncertain');
      clock++;
    }
    for (let n = 0; n < 25; n++) {
      x.automod.reserve({ ...x.m, id: 'new' + n }, 'words', 'warn');
      x.automod.finish('new' + n, 'completed');
      clock++;
    }
    x.automod.reserve({ ...x.m, id: 'foreign', guild: { id: 'other' } }, 'words', 'delete');
    x.automod.finish('foreign', 'uncertain');
    assert.equal(x.automod.incidents('g').length, 20);
    assert(x.automod.incidents('g').every((r) => r.status === 'completed'));
    const rows = x.automod.incidents('g', 'uncertain');
    assert.equal(rows.length, 20);
    assert.equal(rows[0].message_id, 'old24');
    assert.equal(rows[19].message_id, 'old5');
    assert.deepEqual(x.automod.incidents('none', 'uncertain'), []);
  } finally {
    x.db.close();
  }
});
test('AutoMod incident invalid status filters fail without mutating retained records', () => {
  const x = setup();
  try {
    x.automod.reserve(x.m, 'words', 'warn');
    const before = x.automod.incidents('g');
    for (const status of ['', 'all', 'COMPLETED', 'completed ', 1, true, {}, []])
      assert.throws(() => x.automod.incidents('g', status), /automodIncidentStatusInvalid/);
    assert.deepEqual(x.automod.incidents('g'), before);
    assert.equal(x.automod.incidents('g', 'reserved').length, 1);
  } finally {
    x.db.close();
  }
});
test('AutoMod incidents slash advertises bounded status choices and privately returns filtered stored metadata', async () => {
  const x = setup();
  try {
    const option = command.data.toJSON().options.find((s) => s.name === 'incidents').options[0];
    assert.equal(option.name, 'status');
    assert.deepEqual(
      option.choices.map((v) => v.value),
      ['reserved', 'completed', 'uncertain', 'failed'],
    );
    x.member.permissions.has = () => true;
    x.automod.reserve(x.m, 'words', 'delete');
    x.automod.finish(x.m.id, 'uncertain');
    x.automod.reserve({ ...x.m, id: 'completed-other' }, 'words', 'warn');
    x.automod.finish('completed-other', 'completed');
    let reply;
    const i = {
      guild: x.guild,
      guildId: 'g',
      user: { id: 'u' },
      options: { getSubcommand: () => 'incidents', getString: () => 'uncertain' },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => {
        reply = p;
      },
    };
    await command.execute(i, x.c);
    assert.deepEqual(reply.allowedMentions.parse, []);
    assert(reply.embeds[0].data.description.includes('uncertain'));
    assert(!reply.embeds[0].data.description.includes('completed-other'));
    assert.equal(x.deleted.length, 0);
    x.member.permissions.has = () => false;
    await assert.rejects(() => command.execute(i, x.c), /userPermission/);
  } finally {
    x.db.close();
  }
});

test('AutoMod reservation validates action/rule and clock before recording metadata', () => {
  const x = setup();
  try {
    for (const rule of [null, '', 'WORDS', 'unknown', {}])
      assert.throws(() => x.automod.reserve(x.m, rule, 'warn'), /reservation/);
    for (const action of [null, '', 'WARN', 'ban', {}])
      assert.throws(() => x.automod.reserve(x.m, 'words', action), /reservation/);
    for (const clock of [undefined, null, NaN, Infinity, -1, 1.5, '1000']) {
      x.automod.now = () => clock;
      assert.throws(() => x.automod.reserve(x.m, 'words', 'warn'), /clock/);
    }
    assert.equal(x.automod.incidents('g').length, 0);
    x.automod.now = () => 0;
    assert.equal(x.automod.reserve(x.m, 'words', 'warn'), true);
    assert.equal(x.automod.incidents('g')[0].created_at, 0);
  } finally {
    x.db.close();
  }
});
test('AutoMod invalid cleanup clock preserves retained incidents/history and rollback excludes future history', () => {
  const x = setup();
  try {
    let clock = 100000;
    x.automod.now = () => clock;
    x.automod.reserve(x.m, 'words', 'warn');
    const settings = x.automod.patch('g', { rules: { spam: true } });
    x.automod.detect(x.m, settings);
    const before = structuredClone([...x.automod.recent]);
    for (const value of [undefined, null, NaN, Infinity, -1, 1.5, '1000']) {
      clock = value;
      assert.throws(() => x.automod.cleanup(), /clock/);
      assert.deepEqual([...x.automod.recent], before);
      assert.equal(x.automod.incidents('g').length, 1);
    }
    clock = 99999;
    x.automod.cleanup();
    assert.equal(x.automod.recent.size, 0);
    assert.equal(x.automod.incidents('g').length, 1);
  } finally {
    x.db.close();
  }
});

test('AutoMod wordclear keeps otherpolicy;fullreset stops defaults/erases exemptions/spammemory not incidents/cases/foreign', () => {
  const x = setup();
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      words: ['bad', 'worse'],
      rules: { words: true, spam: true },
      ignoredChannels: ['100000000000000001'],
      exemptRoles: ['100000000000000002'],
    });
    x.automod.patch('other', { words: ['FOREIGN'] });
    x.automod.recent.set('g:u', [{ text: 'PRIVATE' }]);
    x.automod.recent.set('other:u', [{ text: 'KEEP' }]);
    x.automod.reserve(x.m, 'words', 'delete');
    const before = x.automod.get('g');
    assert.equal(x.automod.clearWords('g'), 2);
    assert.deepEqual(x.automod.get('g'), { ...before, words: [] });
    const reset = x.automod.resetPolicy('g');
    assert.equal(reset.enabled, false);
    assert.equal(reset.action, 'warn');
    assert(Object.values(reset.rules).every((v) => v === false));
    assert.deepEqual(reset.exemptRoles, []);
    assert.deepEqual(reset.ignoredChannels, []);
    assert(!x.automod.recent.has('g:u'));
    assert(x.automod.recent.has('other:u'));
    assert.deepEqual(x.automod.get('other').words, ['FOREIGN']);
    assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 1);
  } finally {
    x.db.close();
  }
});
test('AutoMod policyreset during pendingnativecheck suppresses destructiveaction and retains failed reservation', async () => {
  const x = setup();
  try {
    x.automod.patch('g', {
      enabled: true,
      action: 'delete',
      words: ['bad'],
      rules: { words: true },
    });
    x.guild.members.fetchMe = async () => {
      x.automod.resetPolicy('g');
      return x.bot;
    };
    await createAutoModHandler(x.c)(x.m);
    assert.equal(x.deleted.length, 0);
    assert.equal(x.db.prepare('SELECT count(*) n FROM automod_incidents').get().n, 1);
    assert.equal(x.db.prepare('SELECT status FROM automod_incidents').get().status, 'failed');
  } finally {
    x.db.close();
  }
});
test('AutoMod exportpolicy/clearwords/resetpolicy private3locale bytes/confirmation/currentauthority/nativeunchanged', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup();
    try {
      x.c.guildConfig.setLanguage('g', locale);
      x.member.permissions.has = () => true;
      x.automod.word('g', 'bad', true);
      let sub = 'exportpolicy',
        confirm = false,
        reply;
      const i = {
        guildId: 'g',
        guild: x.guild,
        user: { id: 'u' },
        deferReply: async (p) => assert.equal(p.flags, 64),
        editReply: async (p) => {
          reply = p;
        },
        options: { getSubcommand: () => sub, getBoolean: () => confirm },
      };
      await command.execute(i, x.c);
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), x.automod.get('g'));
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'clearwords';
      await assert.rejects(() => command.execute(i, x.c), /automodResetConfirm/);
      assert.equal(x.automod.get('g').words.length, 1);
      confirm = true;
      await command.execute(i, x.c);
      sub = 'resetpolicy';
      await command.execute(i, x.c);
      x.member.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, x.c), /userPermission/);
      assert.equal(x.deleted.length, 0);
    } finally {
      x.db.close();
    }
  }
});
test('per-rule actions override the global action only for that rule and survive export/import', async () => {
  const x = setup();
  try {
    const effects = [];
    x.member.user = { bot: false };
    x.member.moderatable = true;
    x.member.roles.highest = {};
    x.member.disableCommunicationUntil = async (...a) => effects.push(a);
    x.bot.roles = { highest: { comparePositionTo: () => 1 } };
    x.automod.patch('g', {
      enabled: true,
      action: 'warn',
      rules: { words: true, caps: true },
      words: ['bad'],
      ruleActions: { words: 'timeout' },
    });
    assert.deepEqual(x.automod.get('g').ruleActions, { words: 'timeout' });
    const h = createAutoModHandler(x.c);
    await h(x.m);
    assert.equal(effects.length, 1);
    assert.equal(x.automod.incidents('g').find((r) => r.message_id === 'msg').action, 'timeout');
    assert.equal(x.deleted.length, 1);
    await h({ ...x.m, id: 'caps', content: 'THIS IS ALL CAPITAL LETTERS HERE NOW' });
    assert.equal(effects.length, 1);
    assert.equal(x.automod.incidents('g').find((r) => r.message_id === 'caps').action, 'warn');
    x.automod.patch('g', { ruleActions: { words: 'delete' } });
    await h({ ...x.m, id: 'del' });
    assert.equal(x.deleted.length, 2);
    const exported = JSON.stringify(x.automod.get('g'));
    x.automod.resetPolicy('g');
    assert.deepEqual(x.automod.get('g').ruleActions, {});
    x.automod.importPolicy('g', exported);
    assert.deepEqual(x.automod.get('g').ruleActions, { words: 'delete' });
    assert.throws(() => x.automod.patch('g', { ruleActions: { words: 'ban' } }));
    assert.throws(() => x.automod.patch('g', { ruleActions: { nope: 'warn' } }));
  } finally {
    x.db.close();
  }
});
test('/automod rule action: confirm for timeout, permission check, set and reset to default', async () => {
  const x = setup();
  try {
    x.member.permissions.has = () => true;
    let args = {};
    const replies = [],
      i = {
        guild: x.guild,
        guildId: 'g',
        user: { id: 'u' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => 'rule',
          getString: (n) => args[n] ?? null,
          getBoolean: (n) => (n === 'enabled' ? true : (args[n] ?? null)),
        },
      };
    args = { name: 'spam', action: 'timeout' };
    await assert.rejects(() => command.execute(i, x.c), /automodTimeoutConfirm/);
    args = { name: 'spam', action: 'delete' };
    await command.execute(i, x.c);
    assert.deepEqual(x.automod.get('g').ruleActions, { spam: 'delete' });
    args = { name: 'words', action: 'timeout', 'confirm-timeout': true };
    await command.execute(i, x.c);
    assert.deepEqual(x.automod.get('g').ruleActions, { spam: 'delete', words: 'timeout' });
    x.bot.permissions.has = () => false;
    args = { name: 'links', action: 'delete' };
    await assert.rejects(() => command.execute(i, x.c), /automodDeletePermission/);
    x.bot.permissions.has = () => true;
    args = { name: 'spam', action: 'default' };
    await command.execute(i, x.c);
    assert.deepEqual(x.automod.get('g').ruleActions, { words: 'timeout' });
    args = { name: 'caps' };
    await command.execute(i, x.c);
    assert.equal(x.automod.get('g').rules.caps, true);
    assert.deepEqual(x.automod.get('g').ruleActions, { words: 'timeout' });
  } finally {
    x.db.close();
  }
});
test('5000 words: bulk comma add dedupes, enforces the limit atomically, and matching stays whole-word and fast', async () => {
  const { matchesAnyWord, MAX_WORDS } = await import('../src/services/automod.js');
  const x = setup();
  try {
    assert.equal(MAX_WORDS, 5000);
    const chunk = (a, b) => Array.from({ length: b - a }, (_, n) => 'word' + (a + n)).join(', ');
    x.automod.word('g', chunk(0, 300) + ', Word5, ,  ' + 'x'.repeat(51), true);
    assert.deepEqual(x.automod.lastWordChange, { added: 300, skipped: 1, total: 300 });
    x.automod.word('g', chunk(0, 300), true);
    assert.equal(x.automod.lastWordChange.added, 0);
    for (let a = 300; a < 5000; a += 300)
      x.automod.word('g', chunk(a, Math.min(a + 300, 5000)), true);
    assert.equal(x.automod.get('g').words.length, 5000);
    assert.throws(() => x.automod.word('g', 'one more, another', true), /automodWordLimit/);
    assert.equal(x.automod.get('g').words.length, 5000);
    const words = x.automod.get('g').words;
    assert(matchesAnyWord('hello WORD4999 there', words));
    assert(!matchesAnyWord('hello word50000 there', words));
    assert(!matchesAnyWord('swordfish', words));
    const t0 = Date.now();
    for (let n = 0; n < 2000; n++)
      matchesAnyWord('just a normal chat message about nothing', words);
    assert(Date.now() - t0 < 1000);
    x.automod.word('g', 'word0, word1', false);
    x.automod.word('g', 'two words, bad-ish!', true);
    assert(matchesAnyWord('say two  words now', x.automod.get('g').words));
    assert(matchesAnyWord('so bad-ish! indeed', x.automod.get('g').words));
  } finally {
    x.db.close();
  }
});
