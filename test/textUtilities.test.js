import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textDigest, formatJson, normalizeText } from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('exactUTF8digest knownvector nottrimmed and normalization4forms preservesexplicit intent bounds', () => {
  assert.deepEqual(textDigest('abc'), {
    bytes: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  });
  assert.notEqual(textDigest('abc ').sha256, textDigest('abc').sha256);
  assert.equal(textDigest('😀').bytes, 4);
  assert.equal(normalizeText('e\u0301', 'NFC'), 'é');
  assert.equal(normalizeText('é', 'NFD'), 'e\u0301');
  assert.equal(normalizeText('Ａ①', 'NFKC'), 'A1');
  assert.equal(normalizeText('Ａé', 'NFKD'), 'Ae\u0301');
  assert.throws(() => normalizeText('x', 'bad'));
  assert.throws(() => textDigest(''));
  assert.throws(() => textDigest('x'.repeat(1201)));
});
test('JSONformat preservesnumberspellings keyorder duplicates escapedstrings arrays primitives bounds noeval', () => {
  const input = '{"a":9007199254740993,"a":1e400,"x":"a\\\"b", "v":[true,null,[]]}',
    r = formatJson(input);
  assert(r.includes('9007199254740993'));
  assert(r.includes('1e400'));
  assert.equal((r.match(/"a":/g) ?? []).length, 2);
  assert.deepEqual(JSON.parse(r), JSON.parse(input));
  assert.equal(formatJson('[]'), '[]\n');
  assert.equal(formatJson('0'), '0\n');
  assert.equal(formatJson('"hi"'), '"hi"\n');
  for (const v of ['', null, '{', '{"x":}', 'undefined', '{"__proto__":1,}', ' '.repeat(1801)])
    assert.throws(() => formatJson(v), /toolsJsonInvalid/);
  assert.equal({}.polluted, undefined);
});
test('3textutilitypaths private3locale exactdigest/files no fetch/state or executing JSON', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['sha256', 'jsonformat', 'normalize']) {
      let reply;
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (n) => (n === 'json' ? '[1,2]' : n === 'form' ? 'NFC' : 'e\u0301'),
        },
        reply: async (p) => (reply = p),
      };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      if (sub === 'sha256')
        assert(reply.embeds[0].data.description.includes(textDigest('e\u0301').sha256));
      else
        assert.equal(
          reply.files[0].attachment.toString(),
          sub === 'jsonformat' ? formatJson('[1,2]') : 'é',
        );
    }
});
