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
    member = { id: 'u', permissions: { has: () => false }, roles: { cache: new Map() } },
    bot = { permissions: { has: () => true } },
    deleted = [];
  const guild = {
    id: 'g',
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
        user: { id: 'manager' },
        deferReply: async () => {},
        editReply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => sub,
          getString: (name) => (name === 'action' ? 'warn' : name === 'name' ? 'words' : 'bad'),
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
          user: { id: 'manager' },
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
