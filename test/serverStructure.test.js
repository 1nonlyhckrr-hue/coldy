import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import command from '../src/commands/general/setupstructure.js';
import { createStructure, STRUCTURE, STRUCTURE_COUNTS } from '../src/services/serverStructure.js';

function fakeGuild(existing = [], failAt = Infinity) {
  const cache = new Map(existing.map((c, i) => [String(i), c]));
  cache.find = (fn) => [...cache.values()].find(fn);
  const created = [];
  let n = 100;
  return {
    id: 'g1',
    created,
    channels: {
      cache,
      fetch: async () => {},
      create: async (o) => {
        if (created.length >= failAt) throw new Error('api down');
        const c = { id: `c${n++}`, parentId: o.parent, ...o };
        created.push(o);
        cache.set(c.id, c);
        return c;
      },
    },
  };
}

test('structure has 6 categories and 15 channels with exact Gothic names', () => {
  assert.deepEqual(STRUCTURE_COUNTS, { categories: 6, channels: 15 });
  assert.equal(STRUCTURE[0].channels[0].name, '⚔・𝖜𝖊𝖑𝖈𝖔𝖒𝖊');
  assert.equal(STRUCTURE[5].name, '𝕾𝖙𝖆𝖋𝖋');
  assert.equal(
    STRUCTURE[3].channels.every((c) => c.type === 'voice'),
    true,
  );
});

test('creates everything once, is idempotent, sets read-only and private overwrites', async () => {
  const g = fakeGuild();
  const r1 = await createStructure(g, 'bot');
  assert.equal(r1.createdCategories.length, 6);
  assert.equal(r1.createdChannels.length, 15);
  const r2 = await createStructure(g, 'bot');
  assert.equal(r2.createdCategories.length + r2.createdChannels.length, 0);
  assert.equal(r2.skippedCategories.length + r2.skippedChannels.length, 21);
  assert.equal(g.created.length, 21);
  const welcome = g.created.find((c) => c.name === '⚔・𝖜𝖊𝖑𝖈𝖔𝖒𝖊');
  const everyone = welcome.permissionOverwrites.find((o) => o.id === 'g1');
  assert.deepEqual(everyone.deny, [P.SendMessages]);
  assert.ok(
    welcome.permissionOverwrites.find((o) => o.id === 'bot').allow.includes(P.SendMessages),
  );
  const staff = g.created.find((c) => c.type === ChannelType.GuildCategory && c.name === '𝕾𝖙𝖆𝖋𝖋');
  assert.deepEqual(staff.permissionOverwrites[0], { id: 'g1', deny: [P.ViewChannel] });
  const general = g.created.find((c) => c.name === '⚔・𝖌𝖊𝖓𝖊𝖗𝖆𝖑');
  assert.equal(general.permissionOverwrites, undefined);
});

test('skips only existing items and reports partial results on failure', async () => {
  const g = fakeGuild([{ id: 'x', type: ChannelType.GuildCategory, name: '𝕴𝖓𝖋𝖔' }], 2);
  await assert.rejects(createStructure(g, 'bot'), (e) => {
    assert.equal(e.partial.skippedCategories.length, 1);
    assert.equal(e.partial.createdChannels.length + e.partial.createdCategories.length, 2);
    return true;
  });
});

function interaction(g, { manage = true } = {}) {
  const replies = [];
  return {
    replies,
    guildId: 'g1',
    guild: {
      ...g,
      id: 'g1',
      members: {
        me: { id: 'bot', permissions: { has: () => true } },
        fetch: async () => ({ id: 'u1', permissions: { has: () => manage } }),
      },
    },
    user: { id: 'u1' },
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}

test('command requires Manage Server, defaults ephemeral and replies with a summary', async () => {
  assert.deepEqual(command.userPermissions, [P.ManageGuild]);
  assert.equal(command.data.toJSON().default_member_permissions, String(P.ManageGuild));
  const g = fakeGuild();
  const i = interaction(g);
  const c = {
    localization: { locale: () => 'en', t: (_g, k, p) => `${k}${JSON.stringify(p ?? {})}` },
  };
  await command.execute(i, c);
  const embed = i.replies[0].embeds[0].toJSON();
  assert.match(embed.description, /structureDone/);
  assert.equal(embed.fields.length, 2);
  assert.match(embed.fields[1].value, /"created":15/);
  await assert.rejects(command.execute(interaction(fakeGuild(), { manage: false }), c), {
    key: 'userPermission',
  });
});
