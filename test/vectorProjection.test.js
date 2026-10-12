import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squaredDistance, projectVector, rejectVector } from '../src/services/vectors.js';
import command from '../src/commands/utility/vector.js';
import { translate } from '../src/services/localization.js';
const f = (n, d = 1) => ({ numerator: String(n), denominator: String(d) });
test('vector exact squared distance1through4 signed extremes symmetric zero nonroot', () => {
  assert.deepEqual(squaredDistance('[3,4]', '[0,0]'), { dimensions: 2, squaredDistance: '25' });
  assert.equal(
    squaredDistance('[1000000,-1000000,1000000,-1000000]', '[-1000000,1000000,-1000000,1000000]')
      .squaredDistance,
    '16000000000000',
  );
  assert.equal(squaredDistance('[7]', '[7]').squaredDistance, '0');
  assert.equal(
    squaredDistance('[-7]', '[3]').squaredDistance,
    squaredDistance('[3]', '[-7]').squaredDistance,
  );
});
test('vector projection/rejection reduced signed fractions orthogonal decomposition and zero left allowed', () => {
  assert.deepEqual(projectVector('[1,0]', '[1,2]').values, [f(1, 5), f(2, 5)]);
  assert.deepEqual(rejectVector('[1,0]', '[1,2]').values, [f(4, 5), f(-2, 5)]);
  assert.deepEqual(projectVector('[1,0]', '[-1,-2]').values, [f(1, 5), f(2, 5)]);
  for (const fn of [projectVector, rejectVector])
    assert.deepEqual(fn('[0,0]', '[2,3]').values, [f(0), f(0)]);
  const a = [4, -2, 7],
    b = [2, -3, 1],
    p = projectVector(JSON.stringify(a), JSON.stringify(b)).values,
    r = rejectVector(JSON.stringify(a), JSON.stringify(b)).values;
  let n = 0n,
    d = 1n;
  for (let k = 0; k < 3; k++) {
    assert.equal(
      BigInt(p[k].numerator) * BigInt(r[k].denominator) +
        BigInt(r[k].numerator) * BigInt(p[k].denominator),
      BigInt(a[k]) * BigInt(p[k].denominator) * BigInt(r[k].denominator),
    );
    n = n * BigInt(r[k].denominator) + BigInt(b[k]) * BigInt(r[k].numerator) * d;
    d *= BigInt(r[k].denominator);
  }
  assert.equal(n, 0n);
});
test('vector rational geometry rejects zero onto strict integerbounds and mismatched dimensions', () => {
  for (const fn of [projectVector, rejectVector])
    assert.throws(() => fn('[1,2]', '[0,0]'), /vectorZeroInvalid/);
  for (const fn of [squaredDistance, projectVector, rejectVector]) {
    assert.throws(() => fn('[1]', '[1,2]'), /vectorDimensionsInvalid/);
    for (const v of ['[]', '[1000001]', '[null]', '[1.5]', '[1+1]', 'x'.repeat(201)])
      assert.throws(() => fn(v, '[1]'), /vectorInputInvalid/);
  }
});
test('3vectorgeometrypaths private3locale exactJSON precisionnotice noping no stored/native effects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, fn] of [
      ['distancesquared', squaredDistance],
      ['project', projectVector],
      ['reject', rejectVector],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (key) => (key === 'left' ? '[1,0]' : '[1,2]'),
          },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.embeds[0].data.description,
        translate(language, sub === 'distancesquared' ? 'vectorResult' : 'vectorRationalResult'),
      );
      assert.equal(reply.files[0].name, 'emika-vector-' + sub + '.json');
      assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), fn('[1,0]', '[1,2]'));
    }
});
