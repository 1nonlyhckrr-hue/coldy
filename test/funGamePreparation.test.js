import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eliminationBracket, bingoCard, drawDominoes } from '../src/services/fun.js';
import command from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('bracket first-round power-of-two size byes each label once no selfmatch winners or assignments bounds RNG', () => {
  for (let n = 2; n <= 16; n++) {
    const labels = Array.from({ length: n }, (_, i) => 'L' + i),
      r = eliminationBracket(labels.join('|'), () => 0);
    assert.deepEqual(r.firstRound.flatMap((m) => m.labels).sort(), labels.sort());
    assert.equal(r.firstRound.filter((m) => m.bye).length, r.bracketSize - n);
    assert.equal(r.firstRound.length, r.bracketSize / 2);
    assert.equal(r.rounds, Math.log2(r.bracketSize));
    for (const m of r.firstRound) assert.equal(m.labels.length, m.bye ? 1 : 2);
  }
  assert.throws(() => eliminationBracket('x'.repeat(41) + '|y'), /funBracketInvalid/);
  assert.throws(
    () => eliminationBracket(Array.from({ length: 17 }, (_, i) => 'L' + i).join('|')),
    /funBracketInvalid/,
  );
  assert.throws(() => eliminationBracket('a|A'), /funChoicesDuplicate/);
  assert.throws(() => eliminationBracket('a|b', () => 2), /Invalid random/);
});
test('bingo75ball columns disjoint unique correct ranges 24numbers freecenter bounded RNG', () => {
  for (const rng of [() => 0, (n) => n - 1]) {
    const r = bingoCard(rng);
    assert.deepEqual(r.freeCell, { row: 3, column: 'N' });
    assert.deepEqual(
      r.columns.map((c) => c.label),
      ['B', 'I', 'N', 'G', 'O'],
    );
    const all = [];
    for (const [index, c] of r.columns.entries()) {
      assert.equal(c.values.length, 5);
      for (const [row, v] of c.values.entries()) {
        if (index === 2 && row === 2) assert.equal(v, null);
        else {
          assert(v >= index * 15 + 1 && v <= index * 15 + 15);
          all.push(v);
        }
      }
    }
    assert.equal(all.length, 24);
    assert.equal(new Set(all).size, 24);
  }
  for (const value of [-1, NaN, 1.5, 15])
    assert.throws(() => bingoCard(() => value), /Invalid random/);
});
test('domino double-six unordered distinct tiles fresh set remaining bounds malformed RNG', () => {
  const r = drawDominoes(7, () => 0);
  assert.equal(r.remaining, 21);
  assert.equal(r.tiles.length, 7);
  assert.deepEqual(
    r.tiles,
    Array.from({ length: 7 }, (_, n) => [0, n]),
  );
  const last = drawDominoes(7, (n) => n - 1);
  assert.equal(new Set(last.tiles.map((t) => t.join(','))).size, 7);
  for (const [a, b] of last.tiles) assert(a >= 0 && a <= b && b <= 6);
  for (const n of [0, 8, -1, 1.5, '1', NaN])
    assert.throws(() => drawDominoes(n), /funDominoInvalid/);
  assert.throws(() => drawDominoes(1, () => 28), /Invalid random/);
});
test('3gamepreparationpaths private3locale branded JSON noping no nativecalls storage or targetfetch', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['bracket', 'bingo', 'dominoes']) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: () => '@everyone|😀',
            getInteger: () => 7,
          },
          reply: async (p) => (reply = p),
        },
        { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds[0].data.description, translate(locale, 'funGame_' + sub));
      assert.equal(reply.files[0].name, 'luna-' + sub + '.json');
      const report = JSON.parse(reply.files[0].attachment.toString());
      if (sub === 'bracket') assert.equal(report.participants, 2);
      else if (sub === 'bingo') assert.equal(report.columns[2].values[2], null);
      else assert.equal(report.tiles.length, 7);
    }
});
