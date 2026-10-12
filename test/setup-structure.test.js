import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { STRUCTURE, buildStructure, parseSetupEnv, runSetup } from '../scripts/setup-structure.js';

function fakeGuild(existing = []) {
  const cache = new Map(existing.map((c, i) => [String(i), c]));
  cache.find = (fn) => [...cache.values()].find(fn);
  let n = 100;
  const created = [];
  return {
    id: 'g1',
    created,
    channels: {
      cache,
      fetch: async () => {},
      create: async (o) => {
        const c = { id: `c${n++}`, parentId: o.parent, ...o };
        created.push(o);
        cache.set(c.id, c);
        return c;
      },
    },
  };
}

test('creates all 6 categories and 16 channels, then is idempotent', async () => {
  const g = fakeGuild();
  const logs = [];
  const r1 = await buildStructure(g, 'bot', (m) => logs.push(m));
  assert.equal(r1.created, 6 + 3 + 3 + 2 + 3 + 2 + 2);
  assert.equal(r1.skipped, 0);
  const r2 = await buildStructure(g, 'bot', () => {});
  assert.equal(r2.created, 0);
  assert.equal(g.created.length, 21);
});

test('permissions: read-only info, private staff', async () => {
  const g = fakeGuild();
  await buildStructure(g, 'bot', () => {});
  const welcome = g.created.find((c) => c.name === '⚔・𝖜𝖊𝖑𝖈𝖔𝖒𝖊');
  assert.ok(welcome.permissionOverwrites.find((o) => o.id === 'g1').deny.length === 1);
  const staff = g.created.find((c) => c.name === '𝕾𝖙𝖆𝖋𝖋' && c.type === ChannelType.GuildCategory);
  assert.equal(staff.permissionOverwrites[0].id, 'g1');
  assert.equal(staff.permissionOverwrites[0].deny.length, 1);
  assert.equal(STRUCTURE.length, 6);
});

test('env validation and list-only mode never mutates or prints token', async () => {
  assert.throws(() => parseSetupEnv({ TARGET_GUILD_ID: 'abc' }));
  assert.throws(() => parseSetupEnv({ TARGET_GUILD_ID: '123456789012345678' }));
  const logs = [];
  let destroyed = false;
  const guilds = new Map([['1551646147100024925', { id: '1551646147100024925', name: 'Test' }]]);
  const client = {
    login: async () => {},
    destroy: async () => {
      destroyed = true;
    },
    guilds: { fetch: async () => guilds },
  };
  const r = await runSetup({
    env: { DISCORD_TOKEN: 'SECRET-TOKEN' },
    client,
    log: (m) => logs.push(m),
  });
  assert.equal(r.created, 0);
  assert.ok(destroyed);
  assert.ok(!logs.join('\n').includes('SECRET-TOKEN'));
});
