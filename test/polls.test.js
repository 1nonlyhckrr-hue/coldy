import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Polls, pollInput, publishPoll } from '../src/services/polls.js';
import command from '../src/commands/utility/poll.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const db = openDatabase(':memory:'),
    sent = [],
    replies = [],
    actor = { id: 'a', guild: { id: 'g' }, permissions: { has: () => true } },
    channel = {
      id: 'c',
      guildId: 'g',
      type: 0,
      permissionsFor: () => ({ has: () => true }),
      send: async (p) => {
        sent.push(p);
        return { id: 'm' };
      },
    },
    i = {
      id: 'i',
      guildId: 'g',
      user: { id: 'a' },
      guild: {
        id: 'g',
        client: { user: { id: 'b' } },
        members: {
          fetch: async () => actor,
          fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }),
        },
        channels: {
          fetch: async (id, o) => {
            assert.equal(o.force, true);
            return channel;
          },
        },
      },
      deferReply: async (p) => assert.equal(p.flags, 64),
      editReply: async (p) => replies.push(p),
    },
    c = {
      polls: new Polls(db),
      localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
    },
    input = {
      channelId: 'c',
      question: 'Pick one',
      answers: ['A', 'B'],
      duration: 24,
      multiple: false,
    };
  return { db, sent, replies, actor, channel, i, c, input };
}
test('native poll payload exactly maps validated question,answers,hours and multiple state', async () => {
  const s = setup();
  try {
    await publishPoll(s.i, s.c, { ...s.input, multiple: true });
    assert.deepEqual(s.sent[0].poll, {
      question: { text: 'Pick one' },
      answers: [{ text: 'A' }, { text: 'B' }],
      duration: 24,
      allowMultiselect: true,
    });
    assert.deepEqual(s.sent[0].allowedMentions.parse, []);
    assert.equal(s.db.prepare('SELECT status,message_id FROM native_polls').get().status, 'sent');
    await assert.rejects(() => publishPoll(s.i, s.c, s.input));
    assert.equal(s.sent.length, 1);
  } finally {
    s.db.close();
  }
});
test('poll content bounds and duplicate answers reject before publication', () => {
  for (const input of [
    { question: '' },
    { question: 'a'.repeat(301) },
    { question: 'a\nb' },
    { answers: ['A'] },
    { answers: [' A ', 'a'] },
    { answers: ['A', 'b'.repeat(56)] },
    { answers: Array.from({ length: 11 }, (_, n) => String(n)) },
    { duration: 0 },
    { duration: 769 },
    { duration: 1.5 },
    { multiple: 1 },
  ])
    assert.throws(() => pollInput({ question: 'Q', answers: ['a', 'b'], ...input }));
  assert.equal(pollInput({ question: 'Q', answers: ['a', 'b'], duration: 768 }).duration, 768);
});
test('current staff/channel identity/native poll permission prevent any reservation', async () => {
  for (const change of [
    (s) => (s.actor.permissions.has = () => false),
    (s) => (s.channel.permissionsFor = () => ({ has: () => false })),
    (s) => (s.channel.guildId = 'other'),
    (s) => (s.channel.id = 'other'),
    (s) => (s.channel.type = 2),
  ]) {
    const s = setup();
    try {
      change(s);
      await assert.rejects(() => publishPoll(s.i, s.c, s.input));
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM native_polls').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('uncertain publish/restart/storage failure never replays source interaction', async () => {
  const s = setup();
  try {
    s.channel.send = async () => {
      s.sent.push({});
      throw new Error('SECRET');
    };
    await assert.rejects(() => publishPoll(s.i, s.c, s.input), /pollUncertain/);
    assert.equal(s.db.prepare('SELECT status FROM native_polls').get().status, 'uncertain');
    await assert.rejects(() => publishPoll(s.i, s.c, s.input));
    assert.equal(s.sent.length, 1);
    s.c.polls.reserve({ ...s.i, id: 'pending' }, 'c');
    s.c.polls.recover();
    assert.equal(
      s.db.prepare('SELECT status FROM native_polls WHERE interaction_id=?').get('pending').status,
      'uncertain',
    );
  } finally {
    s.db.close();
  }
  const x = setup();
  try {
    x.c.polls.reserve = () => {
      throw new Error('db');
    };
    await assert.rejects(() => publishPoll(x.i, x.c, x.input));
    assert.equal(x.sent.length, 0);
  } finally {
    x.db.close();
  }
});
test('poll rate limit bounds attempts per guild and retention removes old metadata only', () => {
  const s = setup();
  try {
    for (let n = 0; n < 10; n++) s.c.polls.reserve({ ...s.i, id: `i${n}` }, 'c');
    assert.throws(() => s.c.polls.reserve({ ...s.i, id: 'overflow' }, 'c'), /pollLimit/);
    s.db.prepare('UPDATE native_polls SET created_at=? WHERE id=1').run(Date.now() - 31 * 86400000);
    assert(s.c.polls.reserve({ ...s.i, id: 'replacement' }, 'c'));
    assert.equal(s.db.prepare('SELECT count(*) n FROM native_polls').get().n, 10);
    assert(s.c.polls.reserve({ ...s.i, guildId: 'other', id: 'other' }, 'c'));
  } finally {
    s.db.close();
  }
});
test('poll slash command privately confirms localized native publication', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(locale);
    try {
      s.i.options = {
        getChannel: () => ({ id: 'c' }),
        getString: (n) =>
          n === 'question' ? 'Q' : n === 'answer-1' ? 'A' : n === 'answer-2' ? 'B' : null,
        getInteger: () => null,
        getBoolean: () => null,
      };
      await command.execute(s.i, s.c);
      assert.equal(
        s.replies[0].embeds[0].data.description,
        translate(locale, 'pollCreated', { id: 1, message: 'm', channel: 'c' }),
      );
      assert.deepEqual(s.replies[0].allowedMentions.parse, []);
    } finally {
      s.db.close();
    }
  }
});

test('poll publication requires exact caller,bot and guild identities before reservation', async () => {
  for (const mutate of [
    (s) => (s.actor.id = 'other'),
    (s) => (s.actor.guild.id = 'other'),
    (s) => (s.i.guild.id = 'other'),
    (s) => (s.i.guild.members.fetchMe = async () => ({ id: 'other', guild: { id: 'g' } })),
    (s) => (s.i.guild.members.fetchMe = async () => ({ id: 'b', guild: { id: 'other' } })),
    (s) => delete s.i.guild.client,
  ]) {
    const s = setup();
    try {
      mutate(s);
      await assert.rejects(() => publishPoll(s.i, s.c, s.input));
      assert.equal(s.sent.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM native_polls').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('poll authority is read after destination lookup;permission loss never reserves', async () => {
  const s = setup();
  try {
    let fetched = false;
    s.i.guild.channels.fetch = async () => {
      fetched = true;
      s.actor.permissions.has = () => false;
      return s.channel;
    };
    s.i.guild.members.fetch = async (opts) => {
      assert(fetched);
      assert.deepEqual(opts, { user: 'a', force: true });
      return s.actor;
    };
    await assert.rejects(() => publishPoll(s.i, s.c, s.input), /userPermission/);
    assert.equal(s.sent.length, 0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM native_polls').get().n, 0);
  } finally {
    s.db.close();
  }
});

test('poll completion requires one pending reservation and never rewrites completed/uncertain records', () => {
  const s = setup();
  try {
    const id = s.c.polls.reserve(s.i, 'c');
    s.c.polls.finish(id, 'sent', 'm');
    assert.throws(() => s.c.polls.finish(id, 'uncertain'), /not pending/);
    assert.throws(() => s.c.polls.finish(999, 'sent', 'm'), /not pending/);
    assert.deepEqual(
      s.db.prepare('SELECT status,message_id FROM native_polls WHERE id=?').get(id),
      { status: 'sent', message_id: 'm' },
    );
    const second = s.c.polls.reserve({ ...s.i, id: 'second' }, 'c');
    s.c.polls.finish(second, 'uncertain');
    assert.throws(() => s.c.polls.finish(second, 'sent', 'other'), /not pending/);
  } finally {
    s.db.close();
  }
});
test('poll accepted send without returned message identity becomes uncertain and never repeats', async () => {
  const s = setup();
  try {
    s.channel.send = async (p) => {
      s.sent.push(p);
      return {};
    };
    await assert.rejects(() => publishPoll(s.i, s.c, s.input), /pollUncertain/);
    assert.equal(s.db.prepare('SELECT status FROM native_polls').get().status, 'uncertain');
    await assert.rejects(() => publishPoll(s.i, s.c, s.input));
    assert.equal(s.sent.length, 1);
  } finally {
    s.db.close();
  }
});

test('poll success completion refuses nonstring native identity and accepted malformed identity stays uncertain', async () => {
  for (const identity of [null, 42, {}, '']) {
    const s = setup();
    try {
      const id = s.c.polls.reserve({ ...s.i, id: 'manual' }, 'c');
      assert.throws(() => s.c.polls.finish(id, 'sent', identity), /identity/);
      s.c.polls.finish(id, 'uncertain');
      s.i.id = 'publish';
      s.channel.send = async (p) => {
        s.sent.push(p);
        return { id: identity };
      };
      await assert.rejects(() => publishPoll(s.i, s.c, s.input));
      assert.equal(
        s.db.prepare('SELECT status FROM native_polls WHERE interaction_id=?').get('publish')
          .status,
        'uncertain',
      );
      await assert.rejects(() => publishPoll(s.i, s.c, s.input));
      assert.equal(s.sent.length, 1);
    } finally {
      s.db.close();
    }
  }
});

test('native poll blank accepted identity remains uncertain without sent promotion or duplicate publication', async () => {
  const s = setup();
  let attempts = 0;
  try {
    s.channel.send = async () => {
      attempts++;
      return { id: ' ' };
    };
    await assert.rejects(() => publishPoll(s.i, s.c, s.input), /pollUncertain/);
    assert.equal(
      s.db.prepare('SELECT status,message_id FROM native_polls').get().status,
      'uncertain',
    );
    assert.equal(s.db.prepare('SELECT message_id FROM native_polls').get().message_id, null);
    await assert.rejects(() => publishPoll(s.i, s.c, s.input));
    assert.equal(attempts, 1);
  } finally {
    s.db.close();
  }
});
test('native poll late send failure cannot demote completed receipt or leak finalization failure', async () => {
  const s = setup();
  try {
    s.channel.send = async () => {
      s.c.polls.finish(1, 'sent', 'observed');
      throw Error('SECRET');
    };
    await assert.rejects(() => publishPoll(s.i, s.c, s.input), /pollUncertain/);
    assert.deepEqual(s.db.prepare('SELECT status,message_id FROM native_polls').get(), {
      status: 'sent',
      message_id: 'observed',
    });
    assert.throws(() => s.c.polls.finish(1, 'uncertain'), /not pending/);
  } finally {
    s.db.close();
  }
});
