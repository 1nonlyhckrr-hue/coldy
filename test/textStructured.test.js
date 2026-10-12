import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvEncode, csvDecode, jsonQuote } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('CSV strictsingle record roundtrip exactquoted literals blanksquotescommasUnicodeCRLF formula notneutralized', () => {
  const fields = [' x ', '', 'a,b', 'a"b', 'a\r\nb', '=1+2', 'हिंदी 😀'];
  const encoded = csvEncode(JSON.stringify(fields));
  assert.equal(encoded, '" x ","","a,b","a""b","a\r\nb","=1+2","हिंदी 😀"');
  assert.deepEqual(JSON.parse(csvDecode(encoded)), fields);
  assert.deepEqual(JSON.parse(csvDecode('a,, b,')), ['a', '', ' b', '']);
  assert.deepEqual(JSON.parse(csvDecode('""')), ['']);
  assert.deepEqual(JSON.parse(csvDecode('"a\n b"')), ['a\n b']);
  assert.equal(JSON.parse(csvDecode(csvEncode(JSON.stringify(Array(50).fill(''))))).length, 50);
});
test('CSV invalidaritytypesunfinishedquotesmultirecordbounds failclosed JSONquote literalcontrolUnicodeexact no HTML safety', () => {
  for (const v of [
    '[]',
    '{}',
    '[1]',
    '[null]',
    '["\\u0000"]',
    '["\\ud800"]',
    JSON.stringify(Array(51).fill('')),
    'invalid',
  ])
    assert.throws(() => csvEncode(v), /textCsvInvalid/);
  for (const v of ['"x', '"x"x', 'a"b', 'a\nb', 'a\r\nb', '"a"\n', Array(51).fill('a').join(',')])
    assert.throws(() => csvDecode(v), /textCsvInvalid/);
  for (const fn of [csvDecode, jsonQuote])
    for (const v of ['', null, '\0', '\udfff', 'x'.repeat(1201)])
      assert.throws(() => fn(v), /textInputInvalid/);
  const v = '\n\t"\\<script>@everyone 😀 हिंदी';
  assert.equal(jsonQuote(v), JSON.stringify(v));
  assert.equal(JSON.parse(jsonQuote(v)), v);
  assert(jsonQuote('<script>').includes('<script>'));
});
test('CSVencode/decode/JSONquote paths private3locale exactliteralTXT branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, value, fn] of [
      ['csvencode', '["=1+2","@everyone"]', csvEncode],
      ['csvdecode', '"=1+2","@everyone"', csvDecode],
      ['jsonquote', '@everyone\n😀', jsonQuote],
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
      assert.equal(reply.files[0].name, 'emika-' + sub + '.txt');
    }
});
