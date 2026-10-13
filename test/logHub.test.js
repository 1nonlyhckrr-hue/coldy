import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { LogHub, createLogHandlers } from '../src/services/logHub.js';
import command from '../src/commands/logging/logs.js';
const G = '111111111111111111',
  CH = '555555555555555555',
  U = '222222222222222222';
function env() {
  const db = openDatabase(':memory:'),
    sent = [];
  const channel = {
    id: CH,
    guildId: G,
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    send: async (p) => sent.push(p.content ?? p.embeds?.[0]?.data?.description),
  };
  const guild = {
    id: G,
    client: { user: { id: 'bot' } },
    channels: { fetch: async () => channel },
    members: { fetchMe: async () => ({ id: 'bot', guild: { id: G } }) },
  };
  const c = {
    features: new FeatureStore(db),
    logger: { warn: () => {} },
    localization: { locale: () => 'en', t: (g, k, p) => k + JSON.stringify(p ?? {}) },
  };
  c.logHub = new LogHub(c);
  return { db, c, guild, sent };
}
test('nothing is logged until a channel is set, then only that kind', async () => {
  const x = env();
  const h = createLogHandlers(x.c);
  const msg = { guild: x.guild, author: { id: U }, channelId: CH, content: 'hi @everyone' };
  await h.messageDelete(msg);
  assert.equal(x.sent.length, 0);
  x.c.logHub.set(G, 'msg', CH);
  await h.messageDelete(msg);
  assert.equal(x.sent.length, 1);
  assert(x.sent[0].startsWith('lgMsgDelete'));
  assert(!x.sent[0].includes('@everyone'));
  await h.memberAdd({
    guild: x.guild,
    id: U,
    user: { createdTimestamp: Date.now() - 3 * 86400000 },
  });
  assert.equal(x.sent.length, 1);
  x.c.logHub.set(G, 'msg', null);
  await h.messageDelete(msg);
  assert.equal(x.sent.length, 1);
  x.db.close();
});
test('edits log only real content changes; bots and uncached messages are skipped', async () => {
  const x = env();
  x.c.logHub.set(G, 'msg', CH);
  const h = createLogHandlers(x.c);
  const m = (content, bot = false) => ({
    guild: x.guild,
    author: { id: U, bot },
    channelId: CH,
    content,
  });
  await h.messageUpdate(m('a'), m('a'));
  await h.messageUpdate({ ...m('a'), content: null }, m('b'));
  await h.messageUpdate(m('a', true), m('b', true));
  assert.equal(x.sent.length, 0);
  await h.messageUpdate(m('a'), m('b'));
  assert.equal(x.sent.length, 1);
  x.db.close();
});
test('voice, role and channel logs describe the change', async () => {
  const x = env();
  for (const k of ['vc', 'role', 'channel', 'mod']) x.c.logHub.set(G, k, CH);
  const h = createLogHandlers(x.c);
  const vs = (channelId) => ({ guild: x.guild, id: U, channelId });
  await h.voice(vs(null), vs('1'));
  await h.voice(vs('1'), vs('2'));
  await h.voice(vs('2'), vs(null));
  await h.voice(vs('2'), vs('2'));
  const roles = (ids) => ({
    guild: x.guild,
    id: U,
    roles: { cache: new Map(ids.map((r) => [r, 1])) },
  });
  await h.memberUpdate(roles(['a']), roles(['b']));
  await h.channel('create', { guild: x.guild, id: '9', name: 'new' });
  await h.channel(
    'update',
    { guild: x.guild, id: '9', name: 'same', parentId: 1 },
    { name: 'same', parentId: 1 },
  );
  await x.c.logHub.mod(x.guild, { actor: U, action: 'ban', target: U, reason: 'x', caseId: 4 });
  assert.deepEqual(
    x.sent.map((s) => s.split('{')[0]),
    ['lgVcJoin', 'lgVcMove', 'lgVcLeave', 'lgRoleAdd', 'lgRoleRemove', 'lgChan_create', 'lgMod'],
  );
  x.db.close();
});
test('/logs needs Manage Server and validates the channel', async () => {
  const x = env();
  const i = (perm, sub = 'set') => ({
    guildId: G,
    guild: x.guild,
    memberPermissions: { has: () => perm },
    deferReply: async () => {},
    editReply: async (p) => x.sent.push(p.content ?? p.embeds?.[0]?.data?.description),
    options: { getSubcommand: () => sub, getString: () => 'mod', getChannel: () => ({ id: CH }) },
  });
  await assert.rejects(() => command.execute(i(false), x.c), { key: 'userPermission' });
  await command.execute(i(true), x.c);
  assert.equal(x.c.logHub.channelId(G, 'mod'), CH);
  await command.execute(i(true, 'off'), x.c);
  assert.equal(x.c.logHub.channelId(G, 'mod'), null);
  x.db.close();
});
