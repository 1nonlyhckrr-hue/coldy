import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { loadCommands } from '../src/services/registry.js';
import { translate } from '../src/services/localization.js';
import {
  ALIASES,
  StealQueue,
  commandPaths,
  commandNameFromMessage,
  createStealPrefixHandler,
  formatQueue,
  normalizeStealName,
  resolveSteal,
  runSteal,
} from '../src/services/steal.js';
import steal from '../src/commands/utility/steal.js';
import stealqueue from '../src/commands/utility/stealqueue.js';
const commands = await loadCommands();
const t = (k, p) => translate('en', k, p);
function setup() {
  const db = openDatabase(':memory:'),
    features = new FeatureStore(db),
    queue = new StealQueue(features);
  return { db, features, queue, context: { commands, steal: queue } };
}
test('alias targets all exist in the live registry', () => {
  const paths = new Set(commandPaths(commands));
  for (const [alias, target] of Object.entries(ALIASES))
    assert.ok(paths.has(target) || commands.has(target), `${alias} -> ${target}`);
});
test('normalizing strips prefixes and rejects junk', () => {
  assert.equal(normalizeStealName('  /Ban '), 'ban');
  assert.equal(normalizeStealName('&music   play'), 'music play');
  for (const bad of ['', '   ', '/', 'a b c d', 'x'.repeat(61), 'ban@everyone', 42, null])
    assert.throws(() => normalizeStealName(bad), { key: 'stealInvalid' });
});
test('existing commands are wired, never queued', () => {
  assert.deepEqual(resolveSteal(commands, 'ban'), {
    status: 'wired',
    name: 'ban',
    path: 'moderation ban',
    via: 'unique-subcommand',
  });
  assert.equal(resolveSteal(commands, 'music play').path, 'music play');
  const mute = resolveSteal(commands, 'mute');
  assert.equal(mute.status, 'wired');
  assert.equal(mute.via, 'alias');
});
test('unknown features are queued and persist with a count', () => {
  const { db, features, queue, context } = setup();
  assert.equal(resolveSteal(commands, 'tiktokfeed').status, 'queued');
  const a = runSteal(context, t, {
    input: 'tiktokfeed',
    userId: 'u1',
    guildId: 'g1',
    botName: 'Dyno',
  });
  assert.equal(a.status, 'queued');
  assert.match(a.text, /not working yet/);
  const b = runSteal(context, t, { input: '/TikTokFeed', userId: 'u2', guildId: 'g2' });
  assert.match(b.text, /Already queued, not working yet/);
  const [entry] = queue.list();
  assert.equal(entry.count, 2);
  assert.deepEqual(entry.requesters, ['u1', 'u2']);
  assert.deepEqual(entry.bots, ['Dyno']);
  // survives a new queue object over the same store (restart)
  assert.equal(new StealQueue(features).list().length, 1);
  assert.equal(db.prepare('SELECT count(*) n FROM feature_state').get().n, 1);
});
test('wired replies never claim queueing and queued replies never claim working', () => {
  const { context } = setup();
  const w = runSteal(context, t, { input: 'ban', userId: 'u', guildId: 'g' });
  assert.match(w.text, /^Wired/);
  assert.match(w.text, /\/moderation ban/);
  assert.doesNotMatch(w.text, /Queued/);
  const q = runSteal(context, t, { input: 'zzznothing', userId: 'u', guildId: 'g' });
  assert.match(q.text, /^Queued, not working yet/);
  assert.equal(new StealQueue(setup().features).list().length, 0);
});
test('queue is capped and removable, wired names do not enter it', () => {
  const { queue, context } = setup();
  runSteal(context, t, { input: 'ban', userId: 'u', guildId: 'g' });
  assert.equal(queue.list().length, 0);
  for (let i = 0; i < 300; i++) queue.add(`feat${i}`, { userId: 'u', guildId: 'g' });
  assert.throws(() => queue.add('one more', { userId: 'u', guildId: 'g' }), {
    key: 'stealQueueFull',
  });
  assert.equal(queue.remove('feat1'), true);
  assert.equal(queue.remove('feat1'), false);
});
test('formatQueue lists by demand and handles empty', () => {
  const { queue } = setup();
  assert.equal(formatQueue([], t), 'The steal queue is empty.');
  queue.add('aaa', { userId: 'u', guildId: 'g' });
  queue.add('bbb', { userId: 'u', guildId: 'g', botName: 'Wick' });
  queue.add('bbb', { userId: 'v', guildId: 'g' });
  assert.equal(formatQueue(queue.list(), t), '1. bbb (x2, Wick)\n2. aaa (x1)');
});
test('command name is read from a bot reply message', () => {
  assert.equal(commandNameFromMessage({ interactionMetadata: { commandName: 'warn' } }), 'warn');
  assert.equal(commandNameFromMessage({ interaction: { commandName: 'kick' } }), 'kick');
  assert.equal(commandNameFromMessage({}), null);
});
test('slash commands: public steal, owner-only stealqueue, ephemeral replies', async () => {
  assert.equal(steal.ownerOnly, undefined);
  assert.equal(stealqueue.ownerOnly, true);
  const { context } = setup();
  context.localization = { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) };
  const replies = [];
  const i = {
    guildId: 'g',
    user: { id: 'u' },
    options: { getString: () => 'ban', getUser: () => ({ username: 'Dyno' }) },
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
  await steal.execute(i, context);
  assert.match(JSON.stringify(replies[0]), /Wired/);
  i.options.getString = () => 'newthing';
  await steal.execute(i, context);
  assert.match(JSON.stringify(replies[1]), /Queued, not working yet/);
  await stealqueue.execute(i, context);
  assert.match(JSON.stringify(replies[2]), /newthing/);
});
function msgCtx() {
  const s = setup();
  s.context.localization = { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) };
  s.context.config = { ownerIds: ['owner'] };
  s.context.cooldowns = { acquire: () => 0 };
  s.context.logger = { warn: () => {} };
  return s.context;
}
function msg(content, extra = {}) {
  const sent = [];
  return {
    sent,
    m: {
      content,
      guildId: 'g',
      author: { id: 'u', bot: false },
      reply: async (p) => sent.push(p),
      ...extra,
    },
  };
}
test('&steal prefix wires, queues, reads a replied bot message, and ignores other text', async () => {
  const handler = createStealPrefixHandler(msgCtx());
  let r = msg('&steal ban');
  assert.equal(await handler(r.m), true);
  assert.match(r.sent[0].content, /^Wired/);
  assert.deepEqual(r.sent[0].allowedMentions, { parse: [] });
  r = msg('&steal qwertyfeature');
  await handler(r.m);
  assert.match(r.sent[0].content, /^Queued, not working yet/);
  r = msg('&steal', {
    reference: { messageId: '1' },
    fetchReference: async () => ({
      author: { bot: true, username: 'Wick' },
      interactionMetadata: { commandName: 'xyzthing' },
    }),
  });
  await handler(r.m);
  assert.match(r.sent[0].content, /xyzthing/);
  r = msg('&steal');
  await handler(r.m);
  assert.match(r.sent[0].content, /command name/);
  for (const text of ['hello', '&stealth', 'steal ban']) {
    r = msg(text);
    assert.equal(await handler(r.m), false);
    assert.equal(r.sent.length, 0);
  }
  r = msg('&steal ban', { author: { id: 'b', bot: true } });
  assert.equal(await handler(r.m), false);
});
test('&stealqueue is owner-only', async () => {
  const c = msgCtx(),
    handler = createStealPrefixHandler(c);
  c.steal.add('feat', { userId: 'u', guildId: 'g' });
  let r = msg('&stealqueue');
  await handler(r.m);
  assert.match(r.sent[0].content, /owner/);
  r = msg('&stealqueue', { author: { id: 'owner', bot: false } });
  await handler(r.m);
  assert.match(r.sent[0].content, /feat/);
});
