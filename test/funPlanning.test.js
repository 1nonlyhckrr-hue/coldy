import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairLabels, exchangeCycle, weightedChoice } from '../src/services/fun.js';
import command from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('private label pairs permutation oddbye and exchange onecycle unique giverreceiver no self', () => {
  const r = pairLabels('a|b|c|d|e', (n) => n - 1);
  assert.deepEqual(r, {
    pairs: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    bye: 'e',
  });
  assert.equal(pairLabels('a|b', () => 0).bye, null);
  const cycle = exchangeCycle('a|b|c|d', (n) => n - 1);
  assert.deepEqual(cycle, [
    { giver: 'a', receiver: 'b' },
    { giver: 'b', receiver: 'c' },
    { giver: 'c', receiver: 'd' },
    { giver: 'd', receiver: 'a' },
  ]);
  assert.equal(new Set(cycle.map((v) => v.giver)).size, 4);
  assert.equal(new Set(cycle.map((v) => v.receiver)).size, 4);
  assert(cycle.every((v) => v.giver !== v.receiver));
  for (const f of [pairLabels, exchangeCycle]) {
    assert.throws(() => f('a|a'));
    assert.throws(() => f('a'));
    assert.throws(() => f('a|b', () => -1));
  }
});
test('weighted explicit relative intervals endpoints bounds matching count and malformed RNG rejected', () => {
  assert.deepEqual(
    weightedChoice('a|b|c', '1|2|3', () => 0),
    { choice: 'a', weight: 1, total: 6 },
  );
  assert.equal(weightedChoice('a|b|c', '1|2|3', () => 1).choice, 'b');
  assert.equal(weightedChoice('a|b|c', '1|2|3', () => 2).choice, 'b');
  assert.equal(weightedChoice('a|b|c', '1|2|3', () => 3).choice, 'c');
  assert.equal(weightedChoice('a|b|c', '1|2|3', () => 5).choice, 'c');
  assert.equal(weightedChoice('a|b', '1000|1000', (n) => n - 1).total, 2000);
  for (const w of ['0|1', '01|1', '1|1001', '1 |2', '1', '1|2|3', '1.5|2', null])
    assert.throws(() => weightedChoice('a|b', w), /funWeightsInvalid/);
  for (const n of [-1, 2, 0.5, NaN]) assert.throws(() => weightedChoice('a|b', '1|1', () => n));
});
test('fun planning3paths private branded3locale no assignments contacts persistentstate', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['pairs', 'exchange', 'weightedchoice']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (n) => (n === 'weights' ? '1|2|3' : 'a|b|c'),
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert(reply.embeds[0].data.footer.text);
      assert(reply.embeds[0].data.description.length < 1800);
    }
});
