import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indentLines, lineEndings } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('indentoutdent ASCIIspaces exactblank/tabs/Unicode normalization no syntaxawareformat roundtrip requestedbounds', () => {
  const value = ' x\r\n\t😀\r\n';
  assert.equal(indentLines(value, 2), '   x\n  \t😀\n  ');
  assert.equal(indentLines(indentLines(value, 2), 2, true), ' x\n\t😀\n');
  assert.equal(indentLines(' x\n    y\n\tz\n\u00a0x', 2, true), 'x\n  y\n\tz\n\u00a0x');
  for (const n of [0, 17, -1, 1.5, '1', NaN])
    assert.throws(() => indentLines('x', n), /textIndentInvalid/);
  assert.throws(() => indentLines('\n'.repeat(100), 1), /textLinesInvalid/);
  assert.equal(indentLines('\n'.repeat(99), 1).split('\n').length, 100);
});
test('lineendingconversion exactLFCRLFCR trailingpresence no trim otherUnicode bytes unchanged strictstyle input', () => {
  assert.equal(lineEndings(' x\r\ny\rz\n😀', 'crlf'), ' x\r\ny\r\nz\r\n😀');
  assert.equal(lineEndings('x\r\n', 'lf'), 'x\n');
  assert.equal(lineEndings('x', 'crlf'), 'x');
  assert.equal(lineEndings('\r\n\r\n', 'crlf'), '\r\n\r\n');
  assert.equal(lineEndings('x\ny\n', 'lf'), 'x\ny\n');
  for (const style of ['', null, 'LF', 'cr', 'bad'])
    assert.throws(() => lineEndings('x', style), /textLineEndingInvalid/);
  for (const fn of [(v) => indentLines(v, 1), (v) => lineEndings(v, 'lf')])
    for (const v of ['', null, '\0', '\ud800', 'x'.repeat(1201)])
      assert.throws(() => fn(v), /textInputInvalid/);
});
test('3indentlineendingpaths private3locale exactTXT bytes branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['indent', 'outdent', 'lineendings']) {
      let reply;
      const value = '  @everyone\n😀\n';
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (n) => (n === 'text' ? value : 'crlf'),
            getInteger: () => 2,
          },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.equal(reply.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(
        reply.files[0].attachment.toString(),
        sub === 'lineendings'
          ? lineEndings(value, 'crlf')
          : indentLines(value, 2, sub === 'outdent'),
      );
    }
});
