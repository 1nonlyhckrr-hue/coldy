import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrixTrace, matrixRref, matrixNullspace } from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
const f = (n, d = '1') => ({ numerator: String(n), denominator: String(d) });
test('matrix trace square1through4 signed zero exact bounded diagonal rectangular rejected', () => {
  assert.deepEqual(matrixTrace('[[-7]]'), { size: 1, trace: '-7' });
  assert.deepEqual(matrixTrace('[[1000000,0],[0,-1000000]]'), { size: 2, trace: '0' });
  assert.equal(matrixTrace('[[1,2,3],[4,5,6],[7,8,9]]').trace, '15');
  assert.equal(matrixTrace('[[1,0,0,0],[0,2,0,0],[0,0,3,0],[0,0,0,4]]').trace, '10');
  assert.throws(() => matrixTrace('[[1,2]]'), /matrixSquareInvalid/);
});
test('matrix rref exact canonical reduced fractions pivot swaps rectangular dependent zero rows', () => {
  assert.deepEqual(matrixRref('[[0,2,1],[0,4,2],[0,0,0]]'), {
    rows: 3,
    columns: 3,
    rank: 1,
    pivotColumns: [1],
    values: [
      [f(0), f(1), f(1, 2)],
      [f(0), f(0), f(0)],
      [f(0), f(0), f(0)],
    ],
  });
  assert.deepEqual(matrixRref('[[0,1],[1,0],[2,3]]').values, [
    [f(1), f(0)],
    [f(0), f(1)],
    [f(0), f(0)],
  ]);
  assert.deepEqual(matrixRref('[[0,0]]').pivotColumns, []);
  assert.deepEqual(matrixRref('[[-2,1]]').values, [[f(1), f(-1, 2)]]);
});
test('matrix nullspace deterministic freecolumn basis satisfies homogeneous system fullrank empty zero identity', () => {
  const a = [
      [0, 2, 1, 3],
      [0, 4, 2, 6],
    ],
    result = matrixNullspace(JSON.stringify(a));
  assert.deepEqual(result, {
    rows: 2,
    columns: 4,
    rank: 1,
    nullity: 3,
    freeColumns: [0, 2, 3],
    basis: [
      [f(1), f(0), f(0), f(0)],
      [f(0), f(-1, 2), f(1), f(0)],
      [f(0), f(-3, 2), f(0), f(1)],
    ],
  });
  for (const vector of result.basis)
    for (const row of a) {
      let n = 0n,
        d = 1n;
      for (let c = 0; c < row.length; c++) {
        n = n * BigInt(vector[c].denominator) + BigInt(row[c]) * BigInt(vector[c].numerator) * d;
        d *= BigInt(vector[c].denominator);
      }
      assert.equal(n, 0n);
    }
  assert.deepEqual(matrixNullspace('[[1,0],[0,1]]').basis, []);
  assert.deepEqual(matrixNullspace('[[0,0]]').basis, [
    [f(1), f(0)],
    [f(0), f(1)],
  ]);
  for (const fn of [matrixTrace, matrixRref, matrixNullspace])
    for (const v of [
      '[[1.5]]',
      '[[1000001]]',
      '[[1],[2,3]]',
      '[]',
      '[[null]]',
      '[[1+1]]',
      'x'.repeat(1201),
    ])
      assert.throws(() => fn(v), /matrixInputInvalid/);
});
test('3matrixreductionpaths private3locale exactJSON localized rational notice branding noping no state', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, fn] of [
      ['trace', matrixTrace],
      ['rref', matrixRref],
      ['nullspace', matrixNullspace],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: () => '[[2,1],[4,2]]' },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.embeds[0].data.description,
        translate(language, sub === 'trace' ? 'matrixResult' : 'matrixRationalResult'),
      );
      assert.equal(reply.files[0].name, 'luna-matrix-' + sub + '.json');
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), fn('[[2,1],[4,2]]'));
    }
});
