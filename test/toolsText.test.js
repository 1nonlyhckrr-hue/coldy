import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, textStatistics, escapeText } from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('duration strict explicit elapsed units ordering duplicates and365day cap no calendar state', () => {
  assert.deepEqual(parseDuration('1d2h30m4s'), {
    seconds: 95404,
    days: 1,
    hours: 2,
    minutes: 30,
    remainder: 4,
  });
  assert.equal(parseDuration('365d').seconds, 31536000);
  assert.equal(parseDuration('31536000s').days, 365);
  assert.equal(parseDuration('60m').hours, 1);
  for (const v of [
    '0s',
    '01s',
    '1m1h',
    '1s1s',
    '1h 1m',
    '-1s',
    '1.5h',
    '366d',
    '365d1s',
    '1w',
    '1H',
    '',
    null,
    '999999999999999999999999999s',
  ])
    assert.throws(() => parseDuration(v), /toolsDurationInvalid/);
});
test('textstats unicode exact UTF16/codepoints/graphemes UTF8lines and escape bounded no mutation', () => {
  assert.deepEqual(textStatistics('a\r\n😀e\u0301'), {
    units: 7,
    points: 6,
    graphemes: 4,
    bytes: 10,
    lines: 2,
  });
  assert.equal(textStatistics('👨‍👩‍👧‍👦').graphemes, 1);
  assert.equal(textStatistics('a\rb\nc\r\nd').lines, 4);
  assert.equal(textStatistics('x'.repeat(1200)).units, 1200);
  for (const v of ['', null, 'x'.repeat(1201), 'a\0b', {}])
    assert.throws(() => textStatistics(v), /toolsTextInvalid/);
  assert.equal(
    escapeText('**hi** @everyone <@123>'),
    '\\*\\*hi\\*\\* @\u200beveryone <@\u200b123\\>',
  );
  assert.equal(escapeText('\\`_|~#[]()'), '\\\\\\`\\_\\|\\~\\#\\[\\]\\(\\)');
  assert.equal(escapeText('*'.repeat(1200)).length, 2400);
});
test('duration textstats escapetext private branded3locale exactattachmentbytes no persistence/nativeeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['duration', 'textstats', 'escapetext']) {
      let reply;
      const text = '**x** @everyone';
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: () => (sub === 'duration' ? '1h2m' : text),
        },
        reply: async (p) => {
          reply = p;
        },
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert(reply.embeds[0].data.footer.text);
      if (sub === 'escapetext') {
        assert.equal(reply.files[0].name, 'escaped-text.txt');
        assert.equal(reply.files[0].attachment.toString(), escapeText(text));
      } else assert.equal(reply.files, undefined);
    }
});
