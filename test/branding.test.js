import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { lunaEmbed } from '../src/utils/embeds.js';
test('Emika embed title and footer are branded in every supported locale', () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    for (const kind of ['info', 'error']) {
      const data = lunaEmbed({ locale, kind, description: 'Brand verification' }).toJSON();
      assert.match(data.title, /Emika/);
      assert.match(data.footer.text, /Emika/);
      assert.doesNotMatch(JSON.stringify(data), /\bLuna\b/);
    }
  }
});
test('locale strings and command descriptions contain no old Luna brand', async () => {
  for (const file of await readdir('src/locales')) {
    const text = await readFile(`src/locales/${file}`, 'utf8');
    assert.doesNotMatch(text, /\bLuna\b/, file);
  }
  const { loadCommands } = await import('../src/services/registry.js');
  const body = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
  assert.equal(body.length, 73);
  assert.doesNotMatch(JSON.stringify(body), /\bLuna\b/);
});
