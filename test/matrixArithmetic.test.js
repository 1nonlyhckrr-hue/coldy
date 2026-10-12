import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMatrices, scaleMatrix, powerMatrix } from '../src/services/matrix.js';
import command from '../src/commands/utility/matrix.js';
import { translate } from '../src/services/localization.js';
test('matrix equalshape addition and signed scalar exact rectangular bounds zero nonmutating', () => {
  assert.deepEqual(addMatrices('[[1,-2,3],[0,4,5]]', '[[-1,2,4],[9,0,-5]]'), {
    rows: 2,
    columns: 3,
    values: [
      ['0', '0', '7'],
      ['9', '4', '0'],
    ],
  });
  assert.deepEqual(scaleMatrix('[[1000000,-1000000]]', -1000000).values, [
    ['-1000000000000', '1000000000000'],
  ]);
  assert.deepEqual(scaleMatrix('[[1,2],[3,4]]', 0).values, [
    ['0', '0'],
    ['0', '0'],
  ]);
  assert.throws(() => addMatrices('[[1,2]]', '[[1],[2]]'), /matrixEqualShapeInvalid/);
  for (const n of [1000001, -1000001, 1.5, '1', NaN, Infinity])
    assert.throws(() => scaleMatrix('[[1]]', n), /matrixScalarInvalid/);
});
test('matrix square powers exact repeated multiplication identity zero signed above numberprecision strict exponent', () => {
  assert.deepEqual(powerMatrix('[[0,0],[0,0]]', 0).values, [
    ['1', '0'],
    ['0', '1'],
  ]);
  assert.deepEqual(powerMatrix('[[1,2],[3,4]]', 2).values, [
    ['7', '10'],
    ['15', '22'],
  ]);
  assert.deepEqual(powerMatrix('[[1,2],[3,4]]', 1).values, [
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.equal(powerMatrix('[[-1000000]]', 9).values[0][0], '-1' + '0'.repeat(54));
  assert.equal(powerMatrix('[[1000000]]', 10).values[0][0], '1' + '0'.repeat(60));
  assert.deepEqual(powerMatrix('[[0,0],[0,0]]', 3).values, [
    ['0', '0'],
    ['0', '0'],
  ]);
  assert.throws(() => powerMatrix('[[1,2]]', 2), /matrixSquareInvalid/);
  for (const n of [-1, 11, 1.5, '1', NaN])
    assert.throws(() => powerMatrix('[[1]]', n), /matrixPowerInvalid/);
  for (const fn of [
    (v) => powerMatrix(v, 1),
    (v) => scaleMatrix(v, 1),
    (v) => addMatrices(v, '[[1]]'),
  ])
    assert.throws(() => fn('[[1.5]]'), /matrixInputInvalid/);
});
test('3matrixarithmeticpaths exact private3locale JSON branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['add', 'scale', 'power']) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: () => '[[1,2],[3,4]]',
            getInteger: () => 2,
          },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds[0].data.description, translate(language, 'matrixResult'));
      assert.equal(reply.files[0].name, 'emika-matrix-' + sub + '.json');
      assert.deepEqual(
        JSON.parse(reply.files[0].attachment.toString()).values,
        sub === 'add' || sub === 'scale'
          ? [
              ['2', '4'],
              ['6', '8'],
            ]
          : [
              ['7', '10'],
              ['15', '22'],
            ],
      );
    }
});
