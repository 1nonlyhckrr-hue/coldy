import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlEncode, htmlDecode, numberLines } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('HTML fiveentity literal encoding exact UTF8 roundtrip no parser sanitation safetyclaim doubleencoding explicit', () => {
  const value = '<x title="\'">& 😀 हिंदी\n@everyone';
  assert.equal(htmlEncode(value), '&lt;x title=&quot;&#39;&quot;&gt;&amp; 😀 हिंदी\n@everyone');
  assert.equal(htmlDecode(htmlEncode(value)), value);
  assert.equal(htmlEncode('&lt;'), '&amp;lt;');
  assert.equal(htmlEncode('  x  '), '  x  ');
  for (const value of ['', null, 1, 'x'.repeat(1201), '\ud800', '\0'])
    assert.throws(() => htmlEncode(value), /textInputInvalid/);
  assert.equal(htmlEncode('&'.repeat(1200)).length, 6000);
});
test('HTML decode singlepass knownentities only literalunsafe output no execution and exact1-100 numberedlines blankvalues', () => {
  assert.equal(
    htmlDecode('&amp;lt; &lt; &gt; &quot; &#39; &apos; &#60; &#x3c; &LT;'),
    '&lt; < > " \' &apos; &#60; &#x3c; &LT;',
  );
  assert.equal(htmlDecode('&lt;script&gt;alert(1)&lt;/script&gt;'), '<script>alert(1)</script>');
  assert.equal(numberLines(' x \r\n\r y\n'), '1:  x \n2: \n3:  y\n4: ');
  assert.equal(numberLines('\n'.repeat(99)).split('\n').length, 100);
  assert.throws(() => numberLines('\n'.repeat(100)), /textLinesInvalid/);
  for (const fn of [htmlDecode, numberLines])
    for (const v of ['', null, 'x'.repeat(1201), '\udfff', '\0'])
      assert.throws(() => fn(v), /textInputInvalid/);
});
test('3 text paths private literalTXT all3locales embedbranding mentionsblocked exactUTF8 no storage/native effects', async () => {
  assert.equal(command.data.toJSON().options.length, 15);
  for (const language of ['en', 'hi', 'hinglish'])
    for (const sub of ['htmlencode', 'htmldecode', 'numberlines']) {
      let result;
      const value = ' <a>&amp;\n@everyone 😀';
      await command.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (name, required) => {
              assert.equal(name, 'text');
              assert.equal(required, true);
              return value;
            },
          },
          reply: async (p) => (result = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(result.flags, 64);
      assert.equal(result.embeds.length, 1);
      assert.equal(result.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(result.allowedMentions.parse, []);
      assert.equal(
        result.files[0].attachment.toString(),
        { htmlencode: htmlEncode, htmldecode: htmlDecode, numberlines: numberLines }[sub](value),
      );
      assert.equal(result.files[0].name, 'luna-' + sub + '.txt');
    }
  await assert.rejects(
    () => command.execute({ options: { getSubcommand: () => 'missing' } }, {}),
    /unknownCommand/,
  );
});
