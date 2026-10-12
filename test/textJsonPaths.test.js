import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonKeys, jsonPointer, jsonArrayTypes } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('JSON ownkeys parserorder duplicatekeylastwins pointerRFC6901 escapes root arrays null/prototype no inheritedvalues', () => {
  const value = '{"b":1,"2":2,"1":1,"b":3,"a/b":{"~x":[null,"😀"]},"__proto__":{"x":2},"":false}';
  assert.deepEqual(JSON.parse(jsonKeys(value)), ['1', '2', 'b', 'a/b', '__proto__', '']);
  assert.equal(JSON.parse(jsonPointer(value, '/b')), 3);
  assert.equal(JSON.parse(jsonPointer(value, '/a~1b/~0x/1')), '😀');
  assert.equal(JSON.parse(jsonPointer(value, '/a~1b/~0x/0')), null);
  assert.equal(JSON.parse(jsonPointer(value, '/')), false);
  assert.equal(JSON.parse(jsonPointer(value, '/__proto__/x')), 2);
  assert.deepEqual(JSON.parse(jsonPointer(value, '')), JSON.parse(value));
  assert.throws(() => jsonPointer('{}', '/toString'), /textJsonPointerMissing/);
  assert.throws(() => jsonPointer('[]', '/length'), /textJsonPointerMissing/);
  assert.throws(() => jsonPointer('[1]', '/00'), /textJsonPointerMissing/);
});
test('JSON top-levelarray typecounts includesnull no nestedcounts pointerbounds/missing/scalarinvalidsyntax failclosed', () => {
  assert.deepEqual(JSON.parse(jsonArrayTypes('[null,true,false,1,2,"x",[],{},[1]]')), {
    length: 9,
    counts: { null: 1, boolean: 2, number: 2, string: 1, array: 2, object: 1 },
  });
  assert.equal(JSON.parse(jsonArrayTypes('[]')).length, 0);
  for (const fn of [jsonKeys, jsonArrayTypes])
    for (const v of ['null', '1', '"x"', 'bad', ''])
      assert.throws(() => fn(v), /textJsonDocumentInvalid/);
  for (const pointer of ['x', '/~', '/~2', null, '/' + 'x'.repeat(200), '\ud800'])
    assert.throws(() => jsonPointer('{}', pointer), /textJsonPointerInvalid/);
  for (const [value, pointer] of [
    ['null', '/x'],
    ['{"x":null}', '/x/y'],
    ['[1]', '/-'],
    ['{}', '/missing'],
  ])
    assert.throws(() => jsonPointer(value, pointer), /textJsonPointerMissing/);
});
test('3JSONpaths private3locale ownliteralJSON branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, value, fn] of [
      ['jsonkeys', '{"@everyone":1}', jsonKeys],
      ['jsonarraytypes', '[null,"@everyone"]', jsonArrayTypes],
      ['jsonpointer', '"@everyone"', (v) => jsonPointer(v, '')],
    ]) {
      let reply;
      await command.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => sub, getString: (n) => (n === 'text' ? value : null) },
          reply: async (p) => (reply = p),
        },
        { guildConfig: { get: () => ({ language }) } },
      );
      assert.equal(reply.flags, 64);
      assert.equal(reply.embeds[0].data.description, translate(language, 'textTransform_' + sub));
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.files[0].attachment.toString(), fn(value));
    }
});
