import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  integerStatistics,
  integerFactors,
  convertIntegerBase,
} from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('integerstats exactsum/sortedmedian bounded2-20 and factors exactlargeLCMnofloatloss', () => {
  assert.deepEqual(integerStatistics('3|-1|2|0'), {
    count: 4,
    total: 4,
    minimum: -1,
    maximum: 3,
    mean: 1,
    median: 1,
  });
  assert.equal(integerStatistics('1|9|2').median, 2);
  assert.deepEqual(integerFactors(12, 18), { gcd: 6, lcm: '36' });
  assert.deepEqual(integerFactors(999999999, 1000000000), { gcd: 1, lcm: '999999999000000000' });
  for (const s of ['1', '1| 2', '1|2.5', '1|1000001', '1||2', '01|2', 'x|2'])
    assert.throws(() => integerStatistics(s));
  for (const a of [0, -1, 1.5, 1000000001]) assert.throws(() => integerFactors(a, 2));
});
test('integerbase conversions allpairs exact64bit digitvalidation no unsafeinteger rounding', () => {
  const value = 18446744073709551615n;
  for (const from of [2, 8, 10, 16])
    for (const to of [2, 8, 10, 16])
      assert.equal(
        convertIntegerBase(value.toString(from), from, to).value,
        value.toString(to).toUpperCase(),
      );
  assert.equal(convertIntegerBase('000FF', 16, 10).value, '255');
  assert.equal(convertIntegerBase('0', 2, 16).value, '0');
  for (const [s, f, t] of [
    ['18446744073709551616', 10, 16],
    ['2', 2, 10],
    ['8', 8, 10],
    ['0xFF', 16, 10],
    ['-1', 10, 2],
    [' 1', 10, 2],
    ['1', 3, 10],
  ])
    assert.throws(() => convertIntegerBase(s, f, t));
});
test('integer3paths private3locale professionalno-ping replies explicitinputs no sideeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['integerstats', 'gcdlcm', 'baseconvert']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (k) => (k === 'values' ? '1|2|3' : 'FFFFFFFFFFFFFFFF'),
          getInteger: (k) => ({ a: 12, b: 18, from: 16, to: 10 })[k],
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert(reply.embeds[0].data.description.length < 2000);
    }
});
