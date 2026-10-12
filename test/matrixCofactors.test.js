import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subtractMatrices,
  cofactorMatrix,
  adjugateMatrix,
  matrixDeterminant,
} from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
test('matrix subtraction equalshape rectangular signed exact boundary zero strict mismatch', () => {
  assert.deepEqual(
    subtractMatrices('[[1000000,-1000000],[0,2]]', '[[-1000000,1000000],[0,3]]').values,
    [
      ['2000000', '-2000000'],
      ['0', '-1'],
    ],
  );
  assert.deepEqual(subtractMatrices('[[1,2,3]]', '[[1,2,3]]').values, [['0', '0', '0']]);
  assert.throws(() => subtractMatrices('[[1,2]]', '[[1],[2]]'), /matrixEqualShapeInvalid/);
});
test('matrix cofactors signed minors singularaccepted and1by1emptyminor convention', () => {
  assert.deepEqual(cofactorMatrix('[[1,2],[3,4]]').values, [
    ['4', '-3'],
    ['-2', '1'],
  ]);
  assert.deepEqual(cofactorMatrix('[[-7]]').values, [['1']]);
  assert.deepEqual(cofactorMatrix('[[0,0],[0,0]]').values, [
    ['0', '0'],
    ['0', '0'],
  ]);
  assert.deepEqual(adjugateMatrix('[[1,2],[3,4]]').values, [
    ['4', '-2'],
    ['-3', '1'],
  ]);
  for (const fn of [cofactorMatrix, adjugateMatrix])
    assert.throws(() => fn('[[1,2]]'), /matrixSquareInvalid/);
});
test('matrix adjugate satisfies exact AadjA determinant identity1through4 including singular highprecision', () => {
  for (const a of [
    [[7]],
    [
      [1, 2],
      [2, 4],
    ],
    [
      [6, 1, 1],
      [4, -2, 5],
      [2, 8, 7],
    ],
    [
      [1000000, 2, 0, 3],
      [0, -1000000, 1, 0],
      [1, 0, 999999, 1],
      [3, 4, 5, 6],
    ],
  ]) {
    const text = JSON.stringify(a),
      adj = adjugateMatrix(text).values.map((row) => row.map(BigInt)),
      det = BigInt(matrixDeterminant(text).determinant);
    for (let r = 0; r < a.length; r++)
      for (let c = 0; c < a.length; c++) {
        assert.equal(
          a[r].reduce((sum, v, k) => sum + BigInt(v) * adj[k][c], 0n),
          r === c ? det : 0n,
        );
        assert.equal(
          adj[r].reduce((sum, v, k) => sum + v * BigInt(a[k][c]), 0n),
          r === c ? det : 0n,
        );
      }
  }
  for (const fn of [cofactorMatrix, adjugateMatrix, (v) => subtractMatrices(v, '[[1]]')])
    for (const v of [
      '[[1.5]]',
      '[[1000001]]',
      '[[null]]',
      '[[1],[2,3]]',
      '[]',
      '[[1+1]]',
      'x'.repeat(1201),
    ])
      assert.throws(() => fn(v), /matrixInputInvalid/);
});
test('3matrixcofactorpaths private3locale exact JSONbytes branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, fn] of [
      ['subtract', (v) => subtractMatrices(v, v)],
      ['cofactor', cofactorMatrix],
      ['adjugate', adjugateMatrix],
    ]) {
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
      assert.equal(reply.files[0].name, 'luna-matrix-' + sub + '.json');
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), fn('[[1,2],[3,4]]'));
    }
});
