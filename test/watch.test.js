import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { Watch, createWatchHandlers } from '../src/services/watch.js';
import command from '../src/commands/moderation/watchlist.js';
const G = '111111111111111111',
  U = '222222222222222222',
  V = '333333333333333333';
function env(modlog = true) {
  const db = openDatabase(':memory:'),
    sent = [];
  const c = {
    features: new FeatureStore(db),
    logger: { warn: () => {} },
    logHub: {
      channelId: () => (modlog ? '9' : null),
      send: async (g, kind, key, p) => sent.push([kind, key, p]),
    },
  };
  c.watch = new Watch(c);
  return { db, c, sent };
}
test('watch needs a modlog channel, then logs that member only', async () => {
  const x = env(false);
  assert.throws(() => x.c.watch.add(G, U, V), { key: 'wlNoModlog' });
  x.db.close();
  const y = env();
  y.c.watch.add(G, U, V);
  const h = createWatchHandlers(y.c);
  const guild = { id: G };
  await h.message({ guild, author: { id: U }, channelId: '5', content: 'hi' });
  await h.message({ guild, author: { id: V }, channelId: '5', content: 'hi' });
  await h.message({ guild, author: { id: U, bot: true }, channelId: '5', content: 'hi' });
  await h.voice({ guild, id: U, channelId: null }, { guild, id: U, channelId: '7' });
  assert.deepEqual(
    y.sent.map((s) => s[1]),
    ['wlMessage', 'wlVoice'],
  );
  assert.equal(y.c.watch.remove(G, U), true);
  assert.deepEqual(y.c.watch.list(G), []);
  y.db.close();
});
test('nicklock reverts changes and ignores its own change', async () => {
  const x = env();
  x.c.watch.lockNick(G, U, 'Good');
  const h = createWatchHandlers(x.c);
  const calls = [];
  const m = (nickname) => ({
    id: U,
    guild: { id: G },
    nickname,
    setNickname: async (n) => calls.push(n),
  });
  await h.nick(m('Good'), m('Good'));
  await h.nick(m('Good'), m('Bad'));
  await h.nick(m('Good'), m(null));
  await h.nick(m('x'), { ...m('y'), id: V });
  assert.deepEqual(calls, ['Good', 'Good']);
  x.c.watch.unlockNick(G, U);
  await h.nick(m('Good'), m('Bad'));
  assert.equal(calls.length, 2);
  x.db.close();
});
test('/watchlist checks Discord permissions per subcommand', async () => {
  const x = env();
  x.c.localization = { locale: () => 'en', t: (g, k) => k };
  const i = (sub, has) => ({
    guildId: G,
    user: { id: V },
    memberPermissions: { has: (p) => has.includes(p) },
    deferReply: async () => {},
    editReply: async () => {},
    options: { getSubcommand: () => sub, getUser: () => ({ id: U }), getString: () => null },
  });
  await assert.rejects(() => command.execute(i('watch', [P.ManageNicknames]), x.c), {
    key: 'userPermission',
  });
  await assert.rejects(() => command.execute(i('nicklock', [P.ModerateMembers]), x.c), {
    key: 'userPermission',
  });
  await command.execute(i('watch', [P.ModerateMembers]), x.c);
  assert(x.c.watch.watched(G, U));
  await command.execute(i('list', [P.ModerateMembers]), x.c);
  x.db.close();
});
