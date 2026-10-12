import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLiteral, joinStrings, reverseLines } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('literal splitjoin case-sensitive nonoverlap regexmeta exactemptysegments Unicode no trimming', () => {
  assert.deepEqual(JSON.parse(splitLiteral('..a....', '..')), ['', 'a', '', '']);
  assert.deepEqual(JSON.parse(splitLiteral('aaaaa', 'aa')), ['', '', 'a']);
  assert.deepEqual(JSON.parse(splitLiteral('aAa', 'A')), ['a', 'a']);
  const text = ' 😀 |हिंदी|| ';
  assert.equal(joinStrings(splitLiteral(text, '|'), '|'), text);
  assert.equal(joinStrings('[]', 'x'), '');
  assert.equal(joinStrings('["","x",""]', ','), ',x,');
  assert.equal(joinStrings('["a","b"]', ''), 'ab');
  assert.equal(JSON.parse(splitLiteral('x', 'missing'))[0], 'x');
});
test('reverse exactlineorder blankvaluesCRLFCR preserved characters unchanged strictarray/Unicode/separator/linebounds', () => {
  assert.equal(reverseLines(' x \r\n\r😀\n'), '\n😀\n\n x ');
  assert.equal(reverseLines('😀a'), '😀a');
  assert.equal(reverseLines('\n'.repeat(99)).split('\n').length, 100);
  assert.throws(() => reverseLines('\n'.repeat(100)), /textLinesInvalid/);
  for (const value of [
    '{}',
    '[1]',
    '[null]',
    '["\\ud800"]',
    '["\\u0000"]',
    JSON.stringify(Array(101).fill('')),
  ])
    assert.throws(() => joinStrings(value, ','), /textJoinInvalid/);
  assert.equal(joinStrings(JSON.stringify(Array(100).fill('')), ',').length, 99);
  for (const sep of ['', null, 'x'.repeat(201), '\0', '\ud800'])
    assert.throws(() => splitLiteral('x', sep), /textSeparatorInvalid/);
  for (const fn of [(v) => splitLiteral(v, ','), (v) => joinStrings(v, ','), reverseLines])
    for (const v of ['', null, '\0', '\ud800', 'x'.repeat(1201)]) assert.throws(() => fn(v));
});
test('3splitjoinreversepaths private3locale exactUTF8 branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, value, sep, expected] of [
      ['split', '@everyone,x', ',', '[\n  "@everyone",\n  "x"\n]\n'],
      ['join', '["@everyone","😀"]', null, '@everyone😀'],
      ['reverselines', '@everyone\n😀', null, '😀\n@everyone'],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: (n) => (n === 'text' ? value : sep) },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.equal(reply.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.files[0].attachment.toString(), expected);
    }
});
