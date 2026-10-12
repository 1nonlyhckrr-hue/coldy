import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotProduct, crossProduct, squaredNorm } from '../src/services/vectors.js';
import command from '../src/commands/utility/vector.js';
import { translate } from '../src/services/localization.js';
test('vector dot and squarednorm exact signed zero1through4integerbounds', () => {
  assert.deepEqual(
    dotProduct('[1000000,-1000000,1000000,-1000000]', '[-1000000,1000000,-1000000,1000000]'),
    { dimensions: 4, dot: '-4000000000000' },
  );
  assert.deepEqual(squaredNorm('[-1000000,1000000,-1000000,1000000]'), {
    dimensions: 4,
    squaredNorm: '4000000000000',
  });
  assert.equal(squaredNorm('[3,4]').squaredNorm, '25');
  assert.equal(squaredNorm('[-0]').squaredNorm, '0');
  assert.equal(dotProduct('[0]', '[1]').dot, '0');
});
test('vector ordered right-hand cross product antisymmetric orthogonal and parallel zero', () => {
  assert.deepEqual(crossProduct('[1,0,0]', '[0,1,0]').values, ['0', '0', '1']);
  const a = '[2,-3,4]',
    b = '[-1,5,2]',
    out = crossProduct(a, b).values;
  assert.deepEqual(out, ['-26', '-8', '7']);
  assert.deepEqual(
    crossProduct(b, a).values,
    out.map((v) => String(-BigInt(v))),
  );
  for (const row of [JSON.parse(a), JSON.parse(b)])
    assert.equal(
      row.reduce((sum, v, n) => sum + BigInt(v) * BigInt(out[n]), 0n),
      0n,
    );
  assert.deepEqual(
    crossProduct('[1000000,1000000,1000000]', '[-1000000,-1000000,-1000000]').values,
    ['0', '0', '0'],
  );
});
test('vector strict input integers arrays bounds no expressions and dimension mismatches', () => {
  for (const fn of [squaredNorm, (v) => dotProduct(v, '[1]'), (v) => crossProduct(v, '[1,2,3]')])
    for (const v of [
      null,
      '[]',
      '[1,2,3,4,5]',
      '[[1]]',
      '[1.5]',
      '[null]',
      '[true]',
      '["1"]',
      '[1000001]',
      '[-1000001]',
      '[1+1]',
      'x'.repeat(201),
    ])
      assert.throws(() => fn(v), /vectorInputInvalid/);
  assert.throws(() => dotProduct('[1]', '[1,2]'), /vectorDimensionsInvalid/);
  assert.throws(() => crossProduct('[1,2]', '[3,4]'), /vectorCrossInvalid/);
});
test('3vectorpaths private3locale exactJSON branding keyednotice noping no storage/native effects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, fn] of [
      ['dot', (v) => dotProduct(v, v)],
      ['cross', (v) => crossProduct(v, v)],
      ['normsquared', squaredNorm],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: () => '[1,2,3]' },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds[0].data.description, translate(language, 'vectorResult'));
      assert.equal(reply.files[0].name, 'luna-vector-' + sub + '.json');
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), fn('[1,2,3]'));
    }
});
