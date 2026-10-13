import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPlaceholders, convertMessage, LINK } from '../src/services/welcomeCopy.js';
test('maps other bots placeholders and lists unknown ones', () => {
  const r = mapPlaceholders(
    'Hi {user.mention}, welcome to {guild.name}! You are #{membercount}. %username% {rank} @everyone',
  );
  assert.equal(
    r.text,
    'Hi {user}, welcome to {server}! You are #{count}. {username} {rank} @\u200beveryone',
  );
  assert.deepEqual(r.unknown, ['{rank}']);
});
test('converts an embed message to a welcome template', () => {
  const msg = {
    content: '',
    embeds: [
      {
        title: 'Welcome @{user}!',
        description: 'Glad you are here, {user}',
        color: 0xff00aa,
        image: { url: 'https://cdn.example.org/a.png' },
        thumbnail: { url: 'http://insecure.example.org/t.png' },
        fields: [],
      },
    ],
  };
  const r = convertMessage(msg, 'welcome');
  assert.equal(r.set.message, 'Glad you are here, {user}');
  assert.equal(r.set.messageCustom, true);
  assert.equal(r.set.title, 'Welcome {user}!');
  assert.equal(r.set.color, 0xff00aa);
  assert.equal(r.set.image, 'https://cdn.example.org/a.png');
  assert.equal(r.set.thumbnail, undefined);
  assert.deepEqual(r.notes, ['badAsset']);
});
test('goodbye uses the goodbye fields; empty message is rejected', () => {
  const r = convertMessage(
    {
      content: 'Bye {username}',
      embeds: [{ title: 'Bye', image: { url: 'https://cdn.discordapp.com/x.png?ex=1&hm=2' } }],
    },
    'goodbye',
  );
  assert.equal(r.set.goodbyeMessage, 'Bye {username}');
  assert.equal(r.set.goodbyeTitle, 'Bye');
  assert.equal(r.set.goodbyeImage, 'https://cdn.discordapp.com/x.png?ex=1&hm=2');
  assert.deepEqual(r.notes, ['expiring']);
  assert.throws(() => convertMessage({ content: '', embeds: [] }, 'welcome'), { key: 'wcEmpty' });
});
test('link parser accepts message links only', () => {
  assert.ok(
    LINK.test(
      'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',
    ),
  );
  assert.ok(
    !LINK.test(
      'https://evil.example/channels/111111111111111111/222222222222222222/333333333333333333',
    ),
  );
  assert.ok(!LINK.test('https://discord.com/channels/@me/222222222222222222/333333333333333333'));
});
