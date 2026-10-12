import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64, decodeBase64, urlComponent } from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('Base64 exactUTF8 knownvectors unicode preserves leadingtrailing whitespace newlines', () => {
  assert.equal(encodeBase64('hello'), 'aGVsbG8=');
  assert.equal(decodeBase64('aGVsbG8='), 'hello');
  for (const text of [' नमस्ते🙂\n ', 'é', 'a\r\nb'])
    assert.equal(decodeBase64(encodeBase64(text)), text);
  for (const text of ['aGVsbG8', 'aGVsbG8= ', '/w==', 'Zh==', 'AA==', '', '____'])
    assert.throws(() => decodeBase64(text));
  assert.throws(() => encodeBase64('\ud800'));
  assert.throws(() => encodeBase64('a'.repeat(1201)));
});
test('URIcomponent explicitencoding/decoding validUTF8 nofetch +notspace strictmalformed directions limits', () => {
  assert.equal(urlComponent('a+b /🙂', 'encode'), 'a%2Bb%20%2F%F0%9F%99%82');
  assert.equal(urlComponent('a+b%20%2F%F0%9F%99%82', 'decode'), 'a+b /🙂');
  for (const text of ['%', '%GG', '%FF', '%00'])
    assert.throws(() => urlComponent(text, 'decode'), /toolsEncodingInvalid/);
  assert.throws(() => urlComponent('\ud800', 'encode'), /toolsEncodingInvalid/);
  assert.throws(() => urlComponent('a', 'fetch'), /toolsEncodingInvalid/);
});
test('encoding3paths private3locale exactTXTbytes professionalembeds no evaluation/network/state', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['base64encode', 'base64decode', 'urlcomponent']) {
      let reply;
      const text = sub === 'base64decode' ? 'aGVsbG8=' : ' नमस्ते🙂 ',
        i = {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (k) => (k === 'direction' ? 'encode' : text),
          },
          reply: async (p) => (reply = p),
        };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      assert.equal(
        reply.files[0].attachment.toString('utf8'),
        sub === 'base64encode'
          ? encodeBase64(text)
          : sub === 'base64decode'
            ? 'hello'
            : urlComponent(text, 'encode'),
      );
    }
});
