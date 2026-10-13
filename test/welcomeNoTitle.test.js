import test from 'node:test';
import assert from 'node:assert/strict';
import { lunaPayload } from '../src/utils/embeds.js';
import { welcomeStyle } from '../src/services/welcomeAssets.js';

test('welcome embeds have no default Emika title, custom titles are kept', () => {
  const none = lunaPayload({ content: 'hi' }, welcomeStyle({}, 'welcome'));
  assert.equal(none.embeds[0].data.title, undefined);
  assert.equal(none.embeds[0].data.description, 'hi');
  const bye = lunaPayload({ content: 'bye' }, welcomeStyle({}, 'goodbye'));
  assert.equal(bye.embeds[0].data.title, undefined);
  const custom = lunaPayload({ content: 'hi' }, welcomeStyle({ title: 'Mine' }, 'welcome'));
  assert.equal(custom.embeds[0].data.title, 'Mine');
  assert.equal(lunaPayload({ content: 'x' }, {}).embeds[0].data.title, 'Emika');
  assert.equal(lunaPayload({ content: 'x' }, { title: false }).embeds[0].data.title, undefined);
});
