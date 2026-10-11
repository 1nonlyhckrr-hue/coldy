import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pick,
  rollDice,
  parseChoices,
  playRps,
  shuffleChoices,
  BALL_ANSWERS,
  TRUTH_PROMPTS,
  DARE_PROMPTS,
} from '../src/services/fun.js';
import fun from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('random selection includes first/last and rejects invalid RNG outputs', () => {
  assert.equal(
    pick(['a', 'b'], () => 0),
    'a',
  );
  assert.equal(
    pick(['a', 'b'], () => 1),
    'b',
  );
  assert.throws(() => pick([]));
  for (const value of [-1, 2, 0.5, NaN]) assert.throws(() => pick(['a', 'b'], () => value));
});
test('dice enforces bounds and deterministic sums without off-by-one', () => {
  assert.deepEqual(
    rollDice(2, 1, () => 0),
    { rolls: [1], total: 1 },
  );
  assert.deepEqual(
    rollDice(1000, 10, () => 999),
    { rolls: Array(10).fill(1000), total: 10000 },
  );
  for (const args of [
    [1, 1],
    [1001, 1],
    [6, 0],
    [6, 11],
    [6, 1.5],
    [NaN, 1],
  ])
    assert.throws(() => rollDice(...args));
  assert.throws(() => rollDice(6, 1, () => 6));
});
test('choices require distinct bounded entries and reject empty/control input', () => {
  assert.deepEqual(parseChoices(' tea | coffee '), ['tea', 'coffee']);
  assert.equal(parseChoices(Array.from({ length: 20 }, (_, i) => `c${i}`).join('|')).length, 20);
  for (const text of [
    'one',
    'a||b',
    'a|A',
    'a|b\n',
    'a|' + 'b'.repeat(101),
    Array.from({ length: 21 }, (_, i) => String(i)).join('|'),
    'a|b\u0000',
    null,
  ])
    assert.throws(() => parseChoices(text));
});
test('RPS computes all nine outcomes', () => {
  const moves = ['rock', 'paper', 'scissors'],
    wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  for (const player of moves)
    for (let n = 0; n < 3; n++) {
      const { bot, result } = playRps(player, () => n);
      assert.equal(bot, moves[n]);
      assert.equal(result, player === bot ? 'draw' : wins[player] === bot ? 'win' : 'lose');
    }
  assert.throws(() => playRps('gun'));
});
test('fun serializes eight real paths and bounded input options', () => {
  const d = fun.data.toJSON();
  assert.equal(d.options.length, 8);
  assert.equal(d.contexts[0], 0);
  assert.equal(fun.cooldownMs, 5000);
  assert(d.options.every((o) => o.type === 1));
});
test('all fun commands reply in all locales with ephemeral branded embeds and no pings', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['8ball', 'coin', 'dice', 'choose', 'shuffle', 'truth', 'dare', 'rps']) {
      const replies = [],
        c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (name) =>
            ({
              question: 'safe question',
              choices: '@everyone **first** | @everyone **second**',
              move: 'rock',
            })[name],
          getInteger: () => null,
        },
        reply: async (p) => replies.push(p),
      };
      await fun.execute(i, c);
      assert.equal(replies.length, 1);
      const r = replies[0];
      assert.equal(r.flags, 64);
      assert.deepEqual(r.allowedMentions.parse, []);
      assert.equal(r.embeds.length, 1);
      assert(r.embeds[0].data.footer.text.includes('Luna'));
      assert(r.embeds[0].data.description.length < 1900);
      if (sub === 'choose') assert(r.embeds[0].data.description.includes('\\*\\*'));
    }
});
test('fun rejects malformed runtime values without replying', async () => {
  const c = { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } };
  for (const sub of ['8ball', 'choose', 'shuffle', 'rps', 'unknown']) {
    let replied = false;
    const i = {
      guildId: 'g',
      options: { getSubcommand: () => sub, getString: () => '', getInteger: () => null },
      reply: async () => {
        replied = true;
      },
    };
    await assert.rejects(() => fun.execute(i, c));
    assert.equal(replied, false);
  }
});
test('all fixed answers and prompts exist with no placeholders in each locale', () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const [prefix, values] of [
      ['funBall_', BALL_ANSWERS],
      ['funTruth_', TRUTH_PROMPTS],
      ['funDare_', DARE_PROMPTS],
    ])
      for (const value of values) assert(translate(locale, prefix + value).length > 0);
});

test('shuffle uses shrinking random bounds and returns every choice once without duplicates', () => {
  const bounds = [];
  assert.deepEqual(
    shuffleChoices('a|b|c|d', (n) => {
      bounds.push(n);
      return 0;
    }),
    ['b', 'c', 'd', 'a'],
  );
  assert.deepEqual(bounds, [4, 3, 2]);
  assert.deepEqual(
    shuffleChoices('a|b', (n) => n - 1),
    ['a', 'b'],
  );
  for (const value of [-1, 2, 0.5, NaN]) assert.throws(() => shuffleChoices('a|b', () => value));
  for (const input of ['one', 'a|A', 'a||b', 'a|b\n']) assert.throws(() => shuffleChoices(input));
});
test('shuffle privately escapes all choices in all locales without external effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const replies = [],
      c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
    await fun.execute(
      {
        guildId: 'g',
        options: { getSubcommand: () => 'shuffle', getString: () => '**one** | @everyone two' },
        reply: async (p) => replies.push(p),
      },
      c,
    );
    assert.equal(replies.length, 1);
    assert.equal(replies[0].flags, 64);
    assert.deepEqual(replies[0].allowedMentions.parse, []);
    const body = replies[0].embeds[0].data.description;
    assert(body.includes('\\*\\*one\\*\\*'));
    assert(body.includes('@everyone two'));
    assert(body.includes('1. '));
    assert(body.includes('2. '));
  }
});

test('shuffle refuses expanded output that would truncate any choices', async () => {
  let replied = false;
  const text = Array.from({ length: 18 }, (_, n) => '*'.repeat(94) + n).join('|');
  await assert.rejects(
    () =>
      fun.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => 'shuffle', getString: () => text },
          reply: async () => {
            replied = true;
          },
        },
        { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } },
      ),
    /funShuffleTooLong/,
  );
  assert.equal(replied, false);
});
