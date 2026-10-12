import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrixRank, inverseMatrix, solveMatrix } from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
const f = (numerator, denominator = '1') => ({
  numerator: String(numerator),
  denominator: String(denominator),
});
test('exact rational rank rectangular dependent zero leading empty pivot columns and full rank', () => {
  assert.deepEqual(matrixRank('[[0,0,0],[0,0,0]]'), { rows: 2, columns: 3, rank: 0 });
  assert.equal(matrixRank('[[0,2,4],[0,1,2]]').rank, 1);
  assert.equal(matrixRank('[[0,1],[1,0],[2,3]]').rank, 2);
  assert.equal(matrixRank('[[2,1],[1,2]]').rank, 2);
  assert.equal(matrixRank('[[0]]').rank, 0);
  assert.equal(matrixRank('[[1000000,-1,7]]').rank, 1);
});
test('exact inverse rational normalization rowpivot singularsquare constraints1to4', () => {
  assert.deepEqual(inverseMatrix('[[2,1],[1,2]]').values, [
    [f(2, 3), f(-1, 3)],
    [f(-1, 3), f(2, 3)],
  ]);
  assert.deepEqual(inverseMatrix('[[0,1],[1,0]]').values, [
    [f(0), f(1)],
    [f(1), f(0)],
  ]);
  assert.deepEqual(inverseMatrix('[[-2]]').values, [[f(-1, 2)]]);
  const diagonal = '[[2,0,0,0],[0,3,0,0],[0,0,-4,0],[0,0,0,5]]',
    r = inverseMatrix(diagonal);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      assert.deepEqual(r.values[i][j], i === j ? f(i === 2 ? -1 : 1, [2, 3, 4, 5][i]) : f(0));
  for (const v of ['[[0]]', '[[1,2],[2,4]]'])
    assert.throws(() => inverseMatrix(v), /matrixSingularInvalid/);
  assert.throws(() => inverseMatrix('[[1,2]]'), /matrixSquareInvalid/);
});
test('exact unique linear solutions reduced signed fractions strictvector square nonsingular only', () => {
  assert.deepEqual(solveMatrix('[[2,1],[1,2]]', '[[1],[0]]'), {
    variables: 2,
    values: [f(2, 3), f(-1, 3)],
  });
  assert.deepEqual(solveMatrix('[[0,2],[3,0]]', '[[4],[9]]').values, [f(3), f(2)]);
  assert.deepEqual(solveMatrix('[[-4]]', '[[2]]').values, [f(-1, 2)]);
  for (const b of ['[[1,2]]', '[[1]]'])
    assert.throws(() => solveMatrix('[[1,0],[0,1]]', b), /matrixVectorInvalid/);
  for (const b of ['[[1],[2]]', '[[1],[3]]'])
    assert.throws(() => solveMatrix('[[1,2],[2,4]]', b), /matrixSingularInvalid/);
  assert.throws(() => solveMatrix('[[1,2]]', '[[1]]'), /matrixSquareInvalid/);
  for (const fn of [matrixRank, inverseMatrix, (v) => solveMatrix(v, '[[1]]')])
    assert.throws(() => fn('[[null]]'), /matrixInputInvalid/);
});
test('3rationalmatrixpaths private3locale exactJSON branded localizedprecisionnotice noping', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['rank', 'inverse', 'solve']) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (n) => (n === 'right' ? '[[1],[0]]' : '[[2,1],[1,2]]'),
          },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.embeds[0].data.description,
        translate(language, sub === 'rank' ? 'matrixResult' : 'matrixRationalResult'),
      );
      assert.equal(reply.files[0].name, 'luna-matrix-' + sub + '.json');
      assert.deepEqual(
        JSON.parse(reply.files[0].attachment.toString()),
        sub === 'rank'
          ? matrixRank('[[2,1],[1,2]]')
          : sub === 'inverse'
            ? inverseMatrix('[[2,1],[1,2]]')
            : solveMatrix('[[2,1],[1,2]]', '[[1],[0]]'),
      );
    }
});
