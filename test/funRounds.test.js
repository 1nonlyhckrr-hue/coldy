import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRobin, dealHands, rollHistogram } from '../src/services/fun.js';
import command from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('roundrobin everypair once rounds no repeatedlabel and oddsizeexactbyes 2-10bounds', () => {
  for (let size = 2; size <= 10; size++) {
    const labels = Array.from({ length: size }, (_, n) => 'label' + n),
      rounds = roundRobin(labels.join('|')),
      pairs = rounds.flatMap((r) => r.pairs.map((p) => p.sort().join('|')));
    assert.equal(pairs.length, (size * (size - 1)) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const r of rounds) {
      const v = r.pairs.flat().concat(r.bye ?? []);
      assert.equal(v.length, size);
      assert.equal(new Set(v).size, size);
    }
    if (size % 2) assert.deepEqual(rounds.map((r) => r.bye).sort(), labels.sort());
    else assert(rounds.every((r) => r.bye === null));
  }
  assert.throws(() => roundRobin(Array.from({ length: 11 }, (_, n) => '' + n).join('|')));
});
test('numberedcardhands one deck unique all bounds and histogram frequency/count/total RNGfailclosed', () => {
  const hands = dealHands(5, 5, () => 0);
  assert.equal(hands.length, 5);
  assert(hands.every((h) => h.length === 5));
  assert.equal(new Set(hands.flat().map((c) => c.rank + c.suit)).size, 25);
  const h = rollHistogram(20, 100, () => 19);
  assert.equal(h.total, 2000);
  assert.equal(
    h.frequencies.reduce((a, b) => a + b),
    100,
  );
  assert.equal(h.frequencies[19], 100);
  for (const args of [
    [1, 5],
    [6, 1],
    [2, 0],
    [2, 6],
  ])
    assert.throws(() => dealHands(...args));
  for (const args of [
    [1, 1],
    [21, 1],
    [6, 0],
    [6, 101],
  ])
    assert.throws(() => rollHistogram(...args));
  for (const rng of [() => -1, () => Infinity, () => 0.5]) {
    assert.throws(() => dealHands(2, 1, rng));
    assert.throws(() => rollHistogram(6, 2, rng));
  }
});
test('fun3paths private3locale professionalembeds boundedinput/output no effects or mentionping', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['roundrobin', 'dealhands', 'dicehistogram']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: () => 'a|b|c',
          getInteger: (k) => ({ players: 5, cards: 5, sides: 20, count: 100 })[k],
        },
        reply: async (p) => (reply = p),
      };
      const c = {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      await command.execute(i, c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert(reply.embeds[0].data.description.length < 2000);
      if (sub === 'roundrobin') {
        i.options.getString = () => 'a'.repeat(31) + '|b';
        await assert.rejects(() => command.execute(i, c), /funChoicesInvalid/);
      }
    }
});
