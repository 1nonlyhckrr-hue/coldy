import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeMatrix, multiplyMatrices, matrixDeterminant } from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
test('matrix rectangular transpose and multiplication exact shape signed zero compatible dimensions no mutation', () => {
  assert.deepEqual(transposeMatrix('[[1,2,3],[4,5,6]]'), {
    rows: 3,
    columns: 2,
    values: [
      ['1', '4'],
      ['2', '5'],
      ['3', '6'],
    ],
  });
  assert.deepEqual(multiplyMatrices('[[1,2,3],[4,5,6]]', '[[7,8],[9,10],[11,12]]'), {
    rows: 2,
    columns: 2,
    values: [
      ['58', '64'],
      ['139', '154'],
    ],
  });
  assert.deepEqual(multiplyMatrices('[[-1000000,1000000]]', '[[1000000],[-1000000]]').values, [
    ['-2000000000000'],
  ]);
  assert.deepEqual(transposeMatrix('[[-0]]').values, [['0']]);
  assert.throws(() => multiplyMatrices('[[1,2]]', '[[1,2]]'), /matrixDimensionsInvalid/);
});
test('matrix determinant exact bigint1through4 singular row swaps and values above number precision', () => {
  assert.equal(matrixDeterminant('[[-7]]').determinant, '-7');
  assert.equal(matrixDeterminant('[[1,2],[3,4]]').determinant, '-2');
  assert.equal(matrixDeterminant('[[3,4],[1,2]]').determinant, '2');
  assert.equal(matrixDeterminant('[[1,2,3],[1,2,3],[4,5,6]]').determinant, '0');
  assert.equal(
    matrixDeterminant('[[1000000,0,0,0],[0,1000000,0,0],[0,0,1000000,0],[0,0,0,1000000]]')
      .determinant,
    '1000000000000000000000000',
  );
  assert.equal(matrixDeterminant('[[6,1,1],[4,-2,5],[2,8,7]]').determinant, '-306');
  assert.throws(() => matrixDeterminant('[[1,2]]'), /matrixSquareInvalid/);
});
test('matrix strict bounded JSON dimensions integers nonarrays ragged no expression evaluation', () => {
  for (const text of [
    null,
    12,
    '',
    '[]',
    '[[]]',
    '[[1],[1,2]]',
    '[[1.5]]',
    '[[null]]',
    '[[true]]',
    '[["1"]]',
    '[[1000001]]',
    '[[-1000001]]',
    '[[1,2,3,4,5]]',
    '[[1],[1],[1],[1],[1]]',
    '[[1+1]]',
    '{}',
    'x'.repeat(1201),
  ])
    for (const fn of [transposeMatrix, matrixDeterminant, (v) => multiplyMatrices(v, '[[1]]')])
      assert.throws(() => fn(text), /matrixInputInvalid/);
});
test('3matrixpaths private3locale exact JSON branded decimalstring outputs noping no native state', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['transpose', 'multiply', 'determinant']) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: () => '[[1,2],[3,4]]' },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds[0].data.description, translate(language, 'matrixResult'));
      assert.equal(reply.files[0].name, 'emika-matrix-' + sub + '.json');
      assert.deepEqual(
        JSON.parse(reply.files[0].attachment.toString()),
        sub === 'transpose'
          ? transposeMatrix('[[1,2],[3,4]]')
          : sub === 'multiply'
            ? multiplyMatrices('[[1,2],[3,4]]', '[[1,2],[3,4]]')
            : matrixDeterminant('[[1,2],[3,4]]'),
      );
    }
});
