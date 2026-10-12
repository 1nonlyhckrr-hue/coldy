import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryEncode, queryDecode, urlParts } from '../src/services/textTransforms.js';
import command from '../src/commands/utility/text.js';
import { translate } from '../src/services/localization.js';
test('formquery exactduplicate/order/spaceplus encodedliteralplus UTF8 keyvalues roundtrip emptypairs', () => {
  const pairs = [
    ['a', ' x+ '],
    ['a', 'हिंदी😀'],
    ['', ''],
    ['&=', '?#'],
  ];
  const out = queryEncode(JSON.stringify(pairs));
  assert(out.startsWith('a=+x%2B+&a='));
  assert.deepEqual(JSON.parse(queryDecode(out)), pairs);
  assert.deepEqual(JSON.parse(queryDecode('a&b=&=x&&')), [
    ['a', ''],
    ['b', ''],
    ['', 'x'],
    ['', ''],
    ['', ''],
  ]);
  assert.deepEqual(JSON.parse(queryDecode('a=%2520&a=+')), [
    ['a', '%20'],
    ['a', ' '],
  ]);
  assert.equal(
    JSON.parse(queryDecode(queryEncode(JSON.stringify(Array(50).fill(['', '']))))).length,
    50,
  );
});
test('querystrictUTF8/errors/bounds andHTTPSparts normalization credentials/schemes/control/whitespace failclosed nofetch', () => {
  for (const v of [
    '[]',
    '{}',
    '[[1,"x"]]',
    '[["a"]]',
    '[["\\ud800","x"]]',
    JSON.stringify(Array(51).fill(['', ''])),
  ])
    assert.throws(() => queryEncode(v), /textQueryInvalid/);
  for (const v of [
    '?a=b',
    'a=b#c',
    'a=%',
    'a=%GG',
    'a=%C0%AF',
    'a=%ED%A0%80',
    'a=%00',
    Array(51).fill('a').join('&'),
  ])
    assert.throws(() => queryDecode(v), /textQueryInvalid/);
  assert.deepEqual(JSON.parse(urlParts('HTTPS://Example.COM:443/a/../b?q=x#z')), {
    protocol: 'https:',
    hostname: 'example.com',
    port: '',
    pathname: '/b',
    search: '?q=x',
    hash: '#z',
    normalized: 'https://example.com/b?q=x#z',
  });
  assert.equal(JSON.parse(urlParts('http://127.0.0.1:8000/x')).port, '8000');
  for (const v of [
    'https://user:pass@example.com',
    'mailto:x@y',
    'file:///a',
    '//example.com',
    ' https://example.com',
    'https://example.com/x y',
    'https://example.com/\n',
    'https://example.com\\x',
    'http:example.com',
  ])
    assert.throws(() => urlParts(v), /textUrlInvalid/);
});
test('3queryURLpaths private3locale exactTXT branding noping no nativeeffects', async () => {
  for (const language of ['en', 'hi', 'hinglish'])
    for (const [sub, value, fn] of [
      ['queryencode', '[["a","@everyone"]]', queryEncode],
      ['querydecode', 'a=%40everyone', queryDecode],
      ['urlparts', 'https://example.com/?x=%40everyone', urlParts],
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
