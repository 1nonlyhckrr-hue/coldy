import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawCards, scrambleWord, rollTarget } from '../src/services/fun.js';
import command from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('freshdeck distinct52card shape/bounds and badRNG no gambling/persistentstate', () => {
  const first = drawCards(10, () => 0);
  assert.equal(first.length, 10);
  assert.equal(new Set(first.map((v) => v.rank + v.suit)).size, 10);
  assert.deepEqual(first[0], { rank: 'A', suit: 'clubs' });
  assert.deepEqual(drawCards(1, (n) => n - 1)[0], { rank: 'K', suit: 'spades' });
  assert.deepEqual(drawCards(1, () => 0)[0], first[0]);
  for (const v of [0, 11, 1.5, '1', NaN]) assert.throws(() => drawCards(v), /funCardsInvalid/);
  for (const v of [-1, 52, 1.5]) assert.throws(() => drawCards(1, () => v));
});
test('word scramble exactlettermultiset guaranteedchanged valid ASCII;target inclusivecount/bounds', () => {
  for (const word of ['banana', 'abc', 'Aaab']) {
    const r = scrambleWord(word, (n) => n - 1);
    assert.notEqual(r.scrambled, r.answer);
    assert.equal([...r.scrambled].sort().join(''), [...r.answer].sort().join(''));
  }
  for (const v of ['aa', 'aaa', 'word space', 'hello!', 'école', 'a'.repeat(21), null])
    assert.throws(() => scrambleWord(v), /funWordInvalid/);
  assert.throws(() => scrambleWord('abc', () => -1));
  assert.equal(rollTarget(6, 10, 6, (n) => n - 1).successes, 10);
  assert.equal(rollTarget(6, 10, 2, () => 0).successes, 0);
  for (const v of [1, 7, 2.5, '2', NaN])
    assert.throws(() => rollTarget(6, 1, v), /funTargetInvalid/);
});
test('cards wordscramble dicetarget private3locale boundedpayload no nativecalls/storage', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['cards', 'wordscramble', 'dicetarget']) {
      let reply;
      const i = {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: () => 'banana',
            getInteger: (k) => (k === 'target' ? 4 : k === 'sides' ? 6 : 3),
          },
          reply: async (p) => {
            reply = p;
          },
        },
        c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
      await command.execute(i, c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.description.length < 1000);
      if (sub === 'wordscramble') assert(reply.embeds[0].data.description.includes('||banana||'));
    }
});
