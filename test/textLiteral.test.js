import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceLiteral,
  findLiteralLines,
  sliceCodepoints,
} from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('literalreplace exactcase nonoverlap regexmeta dollar literal deletion Unicode outputcount no safetyclaim', () => {
  assert.deepEqual(replaceLiteral('aaaaA', 'aa', '$&'), { count: 2, text: '$&$&A' });
  assert.deepEqual(replaceLiteral('a.*a.*', '.*', ''), { count: 2, text: 'aa' });
  assert.deepEqual(replaceLiteral('😀x😀', '😀', 'हिंदी'), { count: 2, text: 'हिंदीxहिंदी' });
  assert.deepEqual(replaceLiteral(' x ', 'absent', 'z'), { count: 0, text: ' x ' });
  assert.equal(replaceLiteral('a'.repeat(1200), 'a', 'x'.repeat(200)).text.length, 240000);
  for (const [f, r] of [
    ['', 'x'],
    ['x'.repeat(201), 'x'],
    ['x', 'x'.repeat(201)],
    ['\0', 'x'],
    ['x', '\ud800'],
    [null, 'x'],
  ])
    assert.throws(() => replaceLiteral('valid', f, r), /textReplaceInvalid/);
});
test('literalfindlines normalizedCRLFblankmatching no regex;codepoint exactslice notgraphemes strictfullywithinbounds', () => {
  assert.deepEqual(findLiteralLines('x.*\r\nX.*\rx.*\n', 'x.*'), [
    { line: 1, text: 'x.*' },
    { line: 3, text: 'x.*' },
  ]);
  assert.deepEqual(findLiteralLines(' x \nx', ' '), [{ line: 1, text: ' x ' }]);
  assert.deepEqual(findLiteralLines('one', 'absent'), []);
  assert.throws(() => findLiteralLines('\n'.repeat(100), 'x'), /textLinesInvalid/);
  for (const f of ['', null, '\n', '\r', '\0', '\ud800', 'x'.repeat(201)])
    assert.throws(() => findLiteralLines('x', f), /textReplaceInvalid/);
  assert.equal(sliceCodepoints('A😀e\u0301Z', 2, 2), '😀e');
  assert.equal(sliceCodepoints('A😀e\u0301Z', 4, 1), '\u0301');
  for (const [start, count] of [
    [0, 1],
    [1, 0],
    [2, 3],
    [4, 1],
    [1.5, 1],
    [1, 1.5],
    ['1', 1],
  ])
    assert.throws(() => sliceCodepoints('abc', start, count), /textSliceInvalid/);
  for (const fn of [
    (v) => replaceLiteral(v, 'x', 'y'),
    (v) => findLiteralLines(v, 'x'),
    (v) => sliceCodepoints(v, 1, 1),
  ])
    for (const v of ['', null, '\0', '\ud800', 'x'.repeat(1201)])
      assert.throws(() => fn(v), /textInputInvalid/);
});
test('replace/findlines/slice private3locale exactUTF8 literalJSONorTXT branding mentionsblocked no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['replace', 'findlines', 'slice']) {
      let reply;
      const value = '@everyone😀\nx';
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (n) => (n === 'text' ? value : n === 'find' ? 'x' : null),
            getInteger: (n) => (n === 'start' ? 1 : 2),
          },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.equal(reply.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(reply.allowedMentions.parse, []);
      const actual = reply.files[0].attachment.toString();
      if (sub === 'replace')
        assert.deepEqual(JSON.parse(actual), { count: 1, text: '@everyone😀\n' });
      else if (sub === 'findlines') assert.deepEqual(JSON.parse(actual), [{ line: 2, text: 'x' }]);
      else assert.equal(actual, '@e');
      assert.equal(reply.files[0].name, 'luna-' + sub + '.txt');
    }
});
