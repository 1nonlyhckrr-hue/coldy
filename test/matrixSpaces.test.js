import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrixRowspace, matrixColumnspace, solveGeneralMatrix } from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
const f = (n, d = 1) => ({ numerator: String(n), denominator: String(d) });
test('matrix row and original column spaces preserve exact independent pivots rational rowbasis zero empty', () => {
  assert.deepEqual(matrixRowspace('[[0,2,1],[0,4,2]]'), {
    rows: 2,
    columns: 3,
    rank: 1,
    basis: [[f(0), f(1), f(1, 2)]],
  });
  assert.deepEqual(matrixColumnspace('[[0,2,1],[0,4,2]]'), {
    rows: 2,
    columns: 3,
    rank: 1,
    pivotColumns: [1],
    basis: [['2', '4']],
  });
  assert.deepEqual(matrixRowspace('[[0,0]]').basis, []);
  assert.deepEqual(matrixColumnspace('[[0],[0]]').basis, []);
  assert.deepEqual(matrixColumnspace('[[0,1],[1,0]]').basis, [
    ['0', '1'],
    ['1', '0'],
  ]);
});
test('matrix general system distinguishes inconsistent unique infinite overdetermined and zero systems', () => {
  assert.deepEqual(solveGeneralMatrix('[[1,2],[2,4]]', '[[1],[3]]'), {
    rows: 2,
    columns: 2,
    rank: 1,
    status: 'inconsistent',
  });
  assert.deepEqual(solveGeneralMatrix('[[2,0],[0,3],[2,3]]', '[[1],[1],[2]]'), {
    rows: 3,
    columns: 2,
    rank: 2,
    status: 'unique',
    particular: [f(1, 2), f(1, 3)],
    freeColumns: [],
    basis: [],
  });
  assert.deepEqual(solveGeneralMatrix('[[0,0]]', '[[1]]').status, 'inconsistent');
  assert.deepEqual(solveGeneralMatrix('[[0,0]]', '[[0]]'), {
    rows: 1,
    columns: 2,
    rank: 0,
    status: 'infinite',
    particular: [f(0), f(0)],
    freeColumns: [0, 1],
    basis: [
      [f(1), f(0)],
      [f(0), f(1)],
    ],
  });
});
test('matrix general affine particular plus free basis satisfies rectangular exact system and strict bounds', () => {
  const result = solveGeneralMatrix('[[2,1,3],[4,2,6]]', '[[1],[2]]');
  assert.deepEqual(result.particular, [f(1, 2), f(0), f(0)]);
  assert.deepEqual(result.freeColumns, [1, 2]);
  assert.deepEqual(result.basis, [
    [f(-1, 2), f(1), f(0)],
    [f(-3, 2), f(0), f(1)],
  ]);
  assert.equal(result.status, 'infinite');
  for (const fn of [matrixRowspace, matrixColumnspace, (v) => solveGeneralMatrix(v, '[[1]]')])
    for (const v of ['[[null]]', '[[1000001]]', '[[1.5]]', '[]', '[[1+1]]', 'x'.repeat(1201)])
      assert.throws(() => fn(v), /matrixInputInvalid/);
  for (const b of ['[[1,2]]', '[[1],[2]]'])
    assert.throws(() => solveGeneralMatrix('[[1,2]]', b), /matrixVectorInvalid/);
});
test('3matrixspacepaths private3locale exactJSON precisionnotice noping no stored/native effects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, fn] of [
      ['rowspace', matrixRowspace],
      ['columnspace', matrixColumnspace],
      ['solvegeneral', (v) => solveGeneralMatrix(v, v)],
    ]) {
      let reply;
      const text = '[[2],[4]]';
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: () => text },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.embeds[0].data.description,
        translate(language, sub === 'columnspace' ? 'matrixResult' : 'matrixRationalResult'),
      );
      assert.equal(reply.files[0].name, 'luna-matrix-' + sub + '.json');
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), fn(text));
    }
});
