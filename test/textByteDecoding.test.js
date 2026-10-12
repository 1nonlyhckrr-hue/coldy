import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexEncode, hexDecode, jsonUnquote } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('literalUTF8hex strictupperlower/BOM preservation Unicode exactroundtrip no encryption invalidsyntax/fataldecoding', () => {
  for (const text of ['😀 हिंदी\n@everyone', '\ufeffBOM', ' <script> ', 'x'.repeat(600)])
    assert.equal(hexDecode(hexEncode(text)), text);
  assert.equal(hexEncode('A'), '41');
  assert.equal(hexDecode('C3A9'), 'é');
  for (const v of ['0', '0g', ' 41', '0x41', '41\n', 'ff', 'c0af', 'eda080', '00'])
    assert.throws(() => hexDecode(v), /textHexInvalid/);
  for (const fn of [hexEncode, hexDecode])
    for (const v of ['', null, '\0', '\ud800', 'x'.repeat(1201)])
      assert.throws(() => fn(v), /textInputInvalid/);
});
test('JSONunquote exactlyonestring emptycontrolUnicode BOMliteral preserved no objects/trailingJSON/NUL/surrogates', () => {
  const v = '😀 हिंदी\n\t"\\<script>@everyone';
  assert.equal(jsonUnquote(JSON.stringify(v)), v);
  assert.equal(jsonUnquote('""'), '');
  assert.equal(jsonUnquote(' "literal" '), 'literal');
  assert.equal(jsonUnquote('"\\ufeff"'), '\ufeff');
  for (const v of [
    '{}',
    '[]',
    'null',
    '1',
    'true',
    '"x" "y"',
    '"\\u0000"',
    '"\\ud800"',
    '"\\udfff"',
    '"unfinished',
  ])
    assert.throws(() => jsonUnquote(v), /textJsonStringInvalid/);
});
test('3hexJSONdecodepaths private3locale exactliteralTXT branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, value, fn] of [
      ['hexencode', '@everyone😀', hexEncode],
      ['hexdecode', hexEncode('@everyone😀'), hexDecode],
      ['jsonunquote', '""', jsonUnquote],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: () => value },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.equal(reply.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.files[0].attachment.toString(), fn(value));
      assert.equal(reply.files[0].name, 'luna-' + sub + '.txt');
    }
});
