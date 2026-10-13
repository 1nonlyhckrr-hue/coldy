import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { buildModal, createWelcomeEditHandler, currentText } from '../src/services/welcomeEdit.js';
const settings = { message: 'Hi {user}\nline two', goodbyeMessage: 'Bye {username}' };
test('modal is pre-filled with the current text, multi-line, 1800 max', () => {
  const m = buildModal('welcome', '9', settings, 'en').toJSON();
  const input = m.components[0].components[0];
  assert.equal(m.custom_id, 'welcomeEdit:welcome:9');
  assert.equal(input.value, 'Hi {user}\nline two');
  assert.equal(input.style, 2);
  assert.equal(input.max_length, 1800);
  assert.equal(
    buildModal('goodbye', '9', settings, 'en').toJSON().components[0].components[0].value,
    'Bye {username}',
  );
  assert.equal(currentText(settings, 'goodbye'), 'Bye {username}');
  assert.throws(() => buildModal('x', '9', settings, 'en'));
});
function env(perm = true) {
  const patched = [],
    replies = [];
  const c = {
    guildConfig: { patch: (g, s, v) => patched.push(v), get: () => ({ language: 'en' }) },
    localization: { t: (g, k) => k, locale: () => 'en' },
    logger: { warn() {}, error() {} },
  };
  const i = (cid, text, uid = '9') => ({
    isModalSubmit: () => true,
    customId: cid,
    user: { id: uid },
    guildId: 'G',
    guild: {
      members: {
        fetch: async () => ({ permissions: { has: (f) => perm && f === P.ManageGuild } }),
      },
    },
    fields: { getTextInputValue: () => text },
    reply: async (p) => replies.push(p),
    replied: false,
    deferred: false,
  });
  return { c, i, patched, replies };
}
test('submit saves welcome and goodbye text as custom, with the Manage Server gate', async () => {
  const { c, i, patched, replies } = env();
  const h = createWelcomeEditHandler(c);
  await h(i('welcomeEdit:welcome:9', '  New {user}\nsecond line  '));
  await h(i('welcomeEdit:goodbye:9', 'Bye'));
  assert.deepEqual(patched, [
    { message: 'New {user}\nsecond line', messageCustom: true },
    { goodbyeMessage: 'Bye', goodbyeCustom: true },
  ]);
  assert.equal(replies.length, 2);
});
test('submit is refused without Manage Server, for another user, or with bad length', async () => {
  const a = env(false);
  await createWelcomeEditHandler(a.c)(a.i('welcomeEdit:welcome:9', 'x'));
  assert.equal(a.patched.length, 0);
  const b = env();
  await createWelcomeEditHandler(b.c)(b.i('welcomeEdit:welcome:5', 'x'));
  await createWelcomeEditHandler(b.c)(b.i('welcomeEdit:welcome:9', 'x'.repeat(1801)));
  await createWelcomeEditHandler(b.c)(b.i('other:thing', 'x'));
  assert.equal(b.patched.length, 0);
});
