import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { Lockdown, startLockdown, endLockdown } from '../src/services/lockdown.js';
function ow(allow = [], deny = []) {
  return { allow: { has: (f) => allow.includes(f) }, deny: { has: (f) => deny.includes(f) } };
}
function channel(id, type, overwrites = {}, failEdit = false) {
  const cache = new Map(Object.entries(overwrites));
  const edits = [];
  return {
    id,
    type,
    edits,
    isThread: () => false,
    permissionOverwrites: {
      cache,
      edit: async (target, perms) => {
        if (failEdit) throw new Error('nope');
        edits.push(perms);
        const allow = [],
          deny = [];
        for (const [k, v] of Object.entries(perms)) {
          if (v === true) allow.push(P[k]);
          if (v === false) deny.push(P[k]);
        }
        cache.set(target, ow(allow, deny));
      },
    },
  };
}
function guild(list) {
  return {
    id: 'g',
    channels: { fetch: async () => {}, cache: new Map(list.map((c) => [c.id, c])) },
  };
}
test('lockdown saves exact previous state, denies flags, and unlockdown restores it', async () => {
  const db = openDatabase(':memory:'),
    store = new Lockdown(db);
  try {
    const text = channel('t1', ChannelType.GuildText, {
      g: ow([P.SendMessages], []),
    });
    const text2 = channel('t2', ChannelType.GuildText, { g: ow([], [P.SendMessagesInThreads]) });
    const text3 = channel('t3', ChannelType.GuildText);
    const voice = channel('v1', ChannelType.GuildVoice);
    const category = channel('cat', ChannelType.GuildCategory);
    const gd = guild([text, text2, text3, voice, category]);
    assert.deepEqual(await startLockdown(gd, store), { locked: 4, failed: 0 });
    assert.deepEqual(text.edits[0], { SendMessages: false, SendMessagesInThreads: false });
    assert.deepEqual(voice.edits[0], { Connect: false });
    assert.equal(category.edits.length, 0);
    await assert.rejects(() => startLockdown(gd, store), { message: 'lockdownActive' });
    gd.channels.cache.delete('t3');
    const out = await endLockdown(gd, store);
    assert.deepEqual(out, { restored: 3, failed: 0, gone: 1 });
    assert.deepEqual(text.edits.at(-1), { SendMessages: true, SendMessagesInThreads: null });
    assert.deepEqual(text2.edits.at(-1), { SendMessages: null, SendMessagesInThreads: false });
    assert.deepEqual(voice.edits.at(-1), { Connect: null });
    assert.equal(store.get('g'), null);
    await assert.rejects(() => endLockdown(gd, store), { message: 'lockdownNotActive' });
  } finally {
    db.close();
  }
});
test('failed restores keep the record so unlockdown can be retried', async () => {
  const db = openDatabase(':memory:'),
    store = new Lockdown(db);
  try {
    const ok = channel('t1', ChannelType.GuildText),
      bad = channel('t2', ChannelType.GuildText, {}, true);
    const gd = guild([ok, bad]);
    assert.deepEqual(await startLockdown(gd, store), { locked: 1, failed: 1 });
    assert.deepEqual(await endLockdown(gd, store), { restored: 1, failed: 1, gone: 0 });
    assert.ok(store.get('g'));
  } finally {
    db.close();
  }
});
