import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import {
  denyEveryone,
  restoreEveryone,
  nukeChannel,
  cloneChannel,
} from '../src/services/channelTools.js';
import command from '../src/commands/moderation/channeltools.js';
const G = '111111111111111111',
  CH = '555555555555555555',
  U = '222222222222222222';
function chan(over = {}) {
  const ch = {
    id: CH,
    name: 'general',
    type: ChannelType.GuildText,
    position: 3,
    edits: [],
    cache: new Map(),
    permissionOverwrites: {
      cache: new Map(),
      edit: async (id, v) => ch.edits.push(v),
    },
    clone: async () => ({
      id: '999999999999999999',
      setPosition: async () => {},
      send: async () => {},
    }),
    delete: async () => {
      ch.gone = true;
    },
    ...over,
  };
  return ch;
}
const guild = { id: G };
test('lock saves the exact previous state and unlock restores it', async () => {
  const db = openDatabase(':memory:'),
    s = new FeatureStore(db),
    ch = chan();
  ch.permissionOverwrites.cache.set(G, {
    allow: { has: (f) => f === P.SendMessages },
    deny: { has: () => false },
  });
  await denyEveryone(guild, ch, s, 'lock', U);
  assert.equal(ch.edits[0].SendMessages, false);
  await assert.rejects(() => denyEveryone(guild, ch, s, 'lock', U), { key: 'ctAlready' });
  await assert.rejects(() => denyEveryone(guild, ch, s, 'archive', U), { key: 'ctBusy' });
  await restoreEveryone(guild, ch, s, 'lock', U);
  assert.equal(ch.edits[1].SendMessages, true);
  assert.equal(ch.edits[1].SendMessagesInThreads, null);
  await assert.rejects(() => restoreEveryone(guild, ch, s, 'lock', U), { key: 'ctNotActive' });
  db.close();
});
test('hide denies ViewChannel and a refused edit leaves no saved state', async () => {
  const db = openDatabase(':memory:'),
    s = new FeatureStore(db),
    ch = chan();
  await denyEveryone(guild, ch, s, 'hide', U);
  assert.deepEqual(ch.edits[0], { ViewChannel: false });
  const bad = chan({ id: '777777777777777777' });
  bad.permissionOverwrites.edit = async () => {
    throw new Error('x');
  };
  await assert.rejects(() => denyEveryone(guild, bad, s, 'hide', U), { key: 'ctFailed' });
  assert.equal(s.count(G, 'chan'), 1);
  db.close();
});
test('archive makes read-only and hidden; clone and nuke', async () => {
  const db = openDatabase(':memory:'),
    s = new FeatureStore(db),
    ch = chan();
  await denyEveryone(guild, ch, s, 'archive', U);
  assert.deepEqual(Object.keys(ch.edits[0]), [
    'ViewChannel',
    'SendMessages',
    'SendMessagesInThreads',
    'AddReactions',
  ]);
  const copy = await cloneChannel(ch, 'x', U);
  assert.equal(copy.id, '999999999999999999');
  const r = await nukeChannel(guild, ch, s, U);
  assert.equal(r.deleted, true);
  assert.equal(ch.gone, true);
  assert.equal(s.count(G, 'chan'), 0);
  await assert.rejects(() => nukeChannel({ ...guild, rulesChannelId: CH }, ch, s, U), {
    key: 'ctProtected',
  });
  await assert.rejects(() => nukeChannel(guild, chan({ type: ChannelType.GuildVoice }), s, U), {
    key: 'ctUnsupported',
  });
  db.close();
});
test('nuke is owner/delegate only and needs the exact name', async () => {
  const db = openDatabase(':memory:'),
    ch = chan(),
    replies = [];
  const c = {
    config: { ownerIds: [] },
    features: new FeatureStore(db),
    securityAccess: { delegated: () => false },
    localization: { locale: () => 'en', t: (g, k) => k },
  };
  const i = (name, ownerLike) => ({
    guildId: G,
    user: { id: U },
    guild: { id: G, channels: { fetch: async () => ch } },
    memberPermissions: { has: () => true },
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
    options: {
      getSubcommand: () => 'nuke',
      getChannel: () => ({ id: CH }),
      getString: () => name,
    },
  });
  await assert.rejects(() => command.execute(i('general'), c), { key: 'securityDenied' });
  c.securityAccess.delegated = () => true;
  await assert.rejects(() => command.execute(i('wrong'), c), { key: 'ctConfirmName' });
  assert.notEqual(ch.gone, true);
  await command.execute(i('general'), c);
  assert.equal(ch.gone, true);
  db.close();
});
test('feature store lists by literal prefix and keeps config defaults', () => {
  const db = openDatabase(':memory:'),
    s = new FeatureStore(db);
  s.set(G, 'f', 'a:1', 1);
  s.set(G, 'f', 'a%:2', 2);
  assert.equal(s.list(G, 'f', 'a%').length, 1);
  assert.deepEqual(s.config(G, 'f', { x: 1 }), { x: 1 });
  assert.equal(s.setConfig(G, 'f', { x: 1 }, { y: 2 }).y, 2);
  db.close();
});
