import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { editTextChannel } from '../src/services/channelEdits.js';
import command from '../src/commands/utility/channel.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const actor = { id: 'u', guild: { id: 'g' } },
    bot = { id: 'b', guild: { id: 'g' } };
  const ch = {
    id: '100000000000000001',
    guildId: 'g',
    type: 0,
    name: 'old',
    topic: 'Original',
    permissionsFor: () => ({ has: () => true }),
    setName: async (v) => {
      calls.push(['name', v]);
      ch.name = v;
    },
    setTopic: async (v) => {
      calls.push(['topic', v]);
      ch.topic = v;
    },
  };
  const i = {
    id: 'i',
    guildId: 'g',
    client: { user: { id: 'b' } },
    user: { id: 'u' },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      channels: { fetch: async () => ch },
      members: { fetch: async () => actor, fetchMe: async () => bot },
    },
  };
  return { db, c: { cases: new ModerationCases(db) }, i, actor, bot, ch, calls };
}
test('confirmed text channel name/topic/reset exact observed state/case no content retention and no-op', async () => {
  const s = setup();
  try {
    for (const [action, value] of [
      ['rename', 'new-name'],
      ['topic', 'New public topic'],
      ['cleartopic', undefined],
    ]) {
      s.i.id = action;
      assert.equal(
        (await editTextChannel(s.i, s.c, { channelId: s.ch.id, action, value, confirm: true }))
          .changed,
        true,
      );
    }
    assert.equal(s.ch.name, 'new-name');
    assert.equal(s.ch.topic, null);
    assert.equal(s.calls.length, 3);
    assert.equal(
      (await editTextChannel(s.i, s.c, { channelId: s.ch.id, action: 'cleartopic', confirm: true }))
        .changed,
      false,
    );
    const rows = s.db.prepare('SELECT reason,status FROM moderation_cases').all();
    assert(rows.every((r) => r.status === 'completed'));
    assert(!JSON.stringify(rows).includes('New public topic'));
  } finally {
    s.db.close();
  }
});
test('text channel metadata identity/type/permissions/input/confirmation and uncertain guards prevent effects/retry', async () => {
  for (const kind of [
    'confirm',
    'input',
    'channel',
    'guild',
    'type',
    'actor',
    'bot',
    'permission',
    'app',
    'network',
    'observe',
    'storage',
  ]) {
    const s = setup();
    try {
      if (kind === 'channel') s.ch.id = '100000000000000002';
      if (kind === 'guild') s.ch.guildId = 'foreign';
      if (kind === 'type') s.ch.type = 5;
      if (kind === 'actor') s.actor.id = 'wrong';
      if (kind === 'bot') s.bot.id = 'wrong';
      if (kind === 'permission') s.ch.permissionsFor = () => ({ has: () => false });
      if (kind === 'app') s.i.appPermissions.has = () => false;
      if (kind === 'network')
        s.ch.setName = async (v) => {
          s.calls.push(v);
          throw Error('unknown');
        };
      if (kind === 'observe')
        s.ch.setName = async (v) => {
          s.calls.push(v);
        };
      if (kind === 'storage')
        s.c.cases.finish = () => {
          throw Error('db');
        };
      const args = {
        channelId: '100000000000000001',
        action: 'rename',
        value: kind === 'input' ? '@everyone' : 'new',
        confirm: kind !== 'confirm',
      };
      await assert.rejects(() => editTextChannel(s.i, s.c, args));
      const effect = ['network', 'observe', 'storage'].includes(kind);
      assert.equal(s.calls.length, effect ? 1 : 0);
      if (effect) {
        s.i.id = 'retry';
        await assert.rejects(
          () => editTextChannel(s.i, s.c, { ...args, action: 'cleartopic' }),
          /channelEditUncertain/,
        );
        assert.equal(s.calls.length, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('channel rename/topic/cleartopic private3locale shared embeds exact current permissions no ping', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'rename',
        reply;
      s.i.options = {
        getSubcommand: () => sub,
        getInteger: () => null,
        getChannel: () => s.ch,
        getString: () => (sub === 'rename' ? 'new-name' : 'Topic'),
        getBoolean: () => true,
      };
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      for (sub of ['rename', 'topic', 'cleartopic']) {
        s.i.id = sub;
        await command.execute(s.i, s.c);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.equal(s.calls.length, 3);
      assert.equal(s.ch.topic, null);
    } finally {
      s.db.close();
    }
  }
});
test('new thread default/age restriction edits one allowed property case observed no-op private3locale', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.ch.defaultAutoArchiveDuration = 60;
      s.ch.defaultThreadRateLimitPerUser = 0;
      s.ch.nsfw = false;
      s.ch.edit = async (opts) => {
        const { reason, ...values } = opts;
        assert(reason.includes('confirmed'));
        s.calls.push(values);
        Object.assign(s.ch, values);
      };
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        assert.deepEqual(p.allowedMentions.parse, []);
      };
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let action = 'threadarchive',
        value = 1440;
      s.i.options = {
        getSubcommand: () => action,
        getInteger: (k) => (k === 'page' ? null : value),
        getChannel: () => s.ch,
        getBoolean: () => true,
      };
      for (const [a, v] of [
        ['threadarchive', 1440],
        ['threadslowmode', 30],
        ['agerestrict', undefined],
      ]) {
        action = a;
        value = v;
        s.i.id = a;
        await command.execute(s.i, s.c);
        assert.equal(
          (
            await editTextChannel(s.i, s.c, {
              channelId: s.ch.id,
              action: a,
              value: v,
              confirm: true,
            })
          ).changed,
          false,
        );
      }
      assert.deepEqual(s.calls, [
        { defaultAutoArchiveDuration: 1440 },
        { defaultThreadRateLimitPerUser: 30 },
        { nsfw: true },
      ]);
      assert.equal(
        s.db.prepare("SELECT count(*) n FROM moderation_cases WHERE status='completed'").get().n,
        3,
      );
    } finally {
      s.db.close();
    }
  }
});
test('threaddefaults/agerestriction input/auth/type/confirm invalid no effect and shared unknown freezes metadata', async () => {
  for (const action of ['threadarchive', 'threadslowmode', 'agerestrict']) {
    const s = setup();
    try {
      s.ch.defaultAutoArchiveDuration = 60;
      s.ch.defaultThreadRateLimitPerUser = 0;
      s.ch.nsfw = false;
      s.ch.edit = async () => {
        s.calls.push('unknown');
        throw Error('network');
      };
      const v = action === 'threadarchive' ? 1440 : action === 'threadslowmode' ? 30 : undefined;
      await assert.rejects(() =>
        editTextChannel(s.i, s.c, { channelId: s.ch.id, action, value: v, confirm: false }),
      );
      if (action !== 'agerestrict')
        for (const value of [-1, 1.5, '1440', NaN, 21601])
          await assert.rejects(() =>
            editTextChannel(s.i, s.c, { channelId: s.ch.id, action, value, confirm: true }),
          );
      assert.equal(s.calls.length, 0);
      await assert.rejects(
        () => editTextChannel(s.i, s.c, { channelId: s.ch.id, action, value: v, confirm: true }),
        /channelEditUncertain/,
      );
      s.i.id = 'retry';
      await assert.rejects(
        () =>
          editTextChannel(s.i, s.c, {
            channelId: s.ch.id,
            action: 'rename',
            value: 'new',
            confirm: true,
          }),
        /channelEditUncertain/,
      );
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
test('threaddefaults invalid native property and post-observation mismatch never completed', async () => {
  for (const kind of ['native', 'post', 'storage']) {
    const s = setup();
    try {
      s.ch.defaultAutoArchiveDuration = kind === 'native' ? 'bad' : 60;
      s.ch.edit = async () => s.calls.push('edit');
      if (kind === 'storage')
        s.c.cases.begin = () => {
          throw Error('storage');
        };
      await assert.rejects(() =>
        editTextChannel(s.i, s.c, {
          channelId: s.ch.id,
          action: 'threadarchive',
          value: 1440,
          confirm: true,
        }),
      );
      assert.equal(s.calls.length, kind === 'post' ? 1 : 0);
      assert.equal(
        s.db.prepare("SELECT count(*) n FROM moderation_cases WHERE status='completed'").get().n,
        0,
      );
    } finally {
      s.db.close();
    }
  }
});
