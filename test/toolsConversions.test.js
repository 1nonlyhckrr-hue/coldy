import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { decodePermissions, rgbColor, isoTimestamp } from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('raw permission decoder BigInt exact known/unknown/admin unsigned bounds RGB exact components', () => {
  const bits = P.Administrator | P.ViewChannel | (1n << 63n),
    r = decodePermissions(String(bits));
  assert.deepEqual(r.flags, ['Administrator', 'ViewChannel']);
  assert.equal(r.unknown, String(1n << 63n));
  assert.equal(r.administrator, true);
  assert.deepEqual(decodePermissions('0').flags, []);
  for (const v of ['01', '-1', '1.5', '1e3', '18446744073709551616', null, {}, ' 1'])
    assert.throws(() => decodePermissions(v), /toolsPermissionsInvalid/);
  assert.equal(rgbColor(0, 0, 0).hex, '#000000');
  assert.equal(rgbColor(255, 255, 255).decimal, 16777215);
  assert.equal(rgbColor(155, 135, 245).hex, '#9B87F5');
  for (const v of [-1, 256, 1.5, '1', null, NaN])
    assert.throws(() => rgbColor(v, 0, 0), /toolsColorInvalid/);
});
test('explicit ISO timestamp validates exact calendar/time/offset supportedepoch no relative inference', () => {
  assert.equal(isoTimestamp('2026-10-12T00:00:00+05:30').iso, '2026-10-11T18:30:00.000Z');
  assert.equal(isoTimestamp('1970-01-01T00:00:00Z', 'R').markup, '<t:0:R>');
  assert.equal(isoTimestamp('9999-12-31T23:59:59Z').seconds, 253402300799);
  for (const v of [
    '2026-02-30T12:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T12:00:00+14:01',
    '2026-01-01T12:00:00+15:00',
    '2026-01-01T12:00:00+01:60',
    '1969-12-31T23:59:59Z',
    '2026-01-01T12:00:00',
    '2026-01-01T12:00:00.000Z',
    null,
  ])
    assert.throws(() => isoTimestamp(v), /toolsIsoInvalid/);
  assert.throws(() => isoTimestamp('2026-01-01T12:00:00Z', 'bad'));
});
test('newtools paths private3locale exact conversion/no native calls and authoredinputs not stored', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['permissions', 'rgb', 'isotimestamp']) {
      let reply;
      const i = {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (k) => (k === 'style' ? null : k === 'bits' ? '8' : '2026-10-12T00:00:00Z'),
            getInteger: () => 0,
          },
          reply: async (p) => {
            reply = p;
          },
        },
        c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
      await command.execute(i, c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(!reply.embeds[0].data.description.includes('toolsPermissions'));
      assert(sub === 'rgb' ? reply.embeds[0].data.description.includes('#000000') : true);
    }
});
