import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { Polls } from '../src/services/polls.js';
import { ModerationCases } from '../src/services/moderation.js';
import { readOwnedPoll, endOwnedPoll } from '../src/services/pollManagement.js';
import command from '../src/commands/utility/pollmanage.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    polls = new Polls(db),
    actor = { id: 'u', guild: { id: 'g' }, permissions: { has: () => true } },
    message = {
      id: 'm',
      channelId: 'c',
      guildId: 'g',
      author: { id: 'b' },
      poll: {
        expiresTimestamp: Date.now() + 60000,
        resultsFinalized: false,
        answers: new Map([
          [1, { id: 1, text: 'A', voteCount: 2 }],
          [2, { id: 2, text: 'B', voteCount: 3 }],
        ]),
      },
    },
    calls = [];
  message.poll.end = async () => {
    calls.push('end');
    message.poll.expiresTimestamp = Date.now() - 1;
  };
  const channel = {
    id: 'c',
    guildId: 'g',
    type: 0,
    permissionsFor: () => ({ has: () => true }),
    messages: {
      fetch: async (o) => {
        assert.equal(o.force, true);
        return message;
      },
    },
  };
  const i = {
    id: 'i',
    guildId: 'g',
    user: { id: 'u' },
    guild: {
      id: 'g',
      client: { user: { id: 'b' } },
      channels: { fetch: async () => channel },
      members: { fetch: async () => actor, fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }) },
    },
  };
  const id = polls.reserve(i, 'c');
  polls.finish(id, 'sent', 'm');
  return {
    db,
    c: { polls, cases: new ModerationCases(db) },
    i,
    id,
    message,
    channel,
    actor,
    calls,
  };
}
test('ownstoredpoll earlyend confirmedexactnativeexpiry/case no message deletion', async () => {
  const s = setup();
  try {
    await assert.rejects(() => endOwnedPoll(s.i, s.c, s.id, false), /pollEndConfirm/);
    assert.equal(s.calls.length, 0);
    await endOwnedPoll(s.i, s.c, s.id, true);
    assert.deepEqual(s.calls, ['end']);
    assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'completed');
    assert.equal(s.c.polls.db.prepare('SELECT status FROM native_polls').get().status, 'sent');
  } finally {
    s.db.close();
  }
});
test('poll management identity/currentpermission/nativeexpiry/unknownend guards no retry', async () => {
  for (const kind of [
    'author',
    'message',
    'channel',
    'actor',
    'permission',
    'expired',
    'network',
    'observe',
  ]) {
    const s = setup();
    try {
      if (kind === 'author') s.message.author.id = 'other';
      if (kind === 'message') s.message.id = 'other';
      if (kind === 'channel') s.channel.guildId = 'foreign';
      if (kind === 'actor') s.actor.id = 'other';
      if (kind === 'permission') s.actor.permissions.has = () => false;
      if (kind === 'expired') s.message.poll.expiresTimestamp = 0;
      if (kind === 'network')
        s.message.poll.end = async () => {
          s.calls.push('end');
          throw Error('unknown');
        };
      if (kind === 'observe') s.message.poll.end = async () => s.calls.push('end');
      await assert.rejects(() => endOwnedPoll(s.i, s.c, s.id, true));
      const effect = ['network', 'observe'].includes(kind);
      assert.equal(s.calls.length, effect ? 1 : 0);
      if (effect) {
        s.i.id = 'retry';
        await assert.rejects(() => endOwnedPoll(s.i, s.c, s.id, true), /pollEndUncertain/);
        assert.equal(s.calls.length, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('poll results/end/list private3locale currentaggregate no voterread and ownstoredscope', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'results',
        reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = { getSubcommand: () => sub, getInteger: () => s.id, getBoolean: () => true };
      await command.execute(s.i, s.c);
      assert(reply.embeds[0].data.description.includes('A | 2'));
      assert.deepEqual(reply.allowedMentions.parse, []);
      sub = 'list';
      await command.execute(s.i, s.c);
      sub = 'end';
      await command.execute(s.i, s.c);
      assert.equal(s.calls.length, 1);
    } finally {
      s.db.close();
    }
  }
});
