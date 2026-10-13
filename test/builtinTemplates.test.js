import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { FeatureStore } from '../src/services/featureStore.js';
import { Templates, startApply } from '../src/services/templates.js';
import {
  DISCORD_INDIA_CHANNELS,
  REAL_ROLES,
  builtinKey,
  discordIndiaTemplate,
} from '../src/services/builtinTemplates.js';
function env() {
  const c = { features: new FeatureStore(openDatabase(':memory:')) };
  c.templates = new Templates(c);
  return c;
}
test('Discord India lookup accepts spaced, cased and dashed names only for the built-in', () => {
  for (const n of ['Discord India', 'discord-india', 'DISCORD_INDIA', ' discord india '])
    assert.equal(builtinKey(n), 'discord-india');
  for (const n of ['discord', 'india', '', 'discord indiaa']) assert.equal(builtinKey(n), null);
});
test('structure has the 15 requested categories with exact child counts', () => {
  const d = discordIndiaTemplate(),
    cats = d.channels.filter((c) => c.type === ChannelType.GuildCategory);
  assert.equal(cats.length, 15);
  const counts = DISCORD_INDIA_CHANNELS.map(([n, ch]) => [n, ch.length]);
  assert.deepEqual(counts, [
    ['INDIA', 6],
    ['ACCESS', 5],
    ['EXCLUSIVE EVENT', 6],
    ['GENERAL', 5],
    ['EVENT', 6],
    ['THE MUSIC CHAMBER', 5],
    ['CHILLING ZONE', 19],
    ['PVT VCZ', 2],
    ['INDIA STREETS', 16],
    ['DUO', 9],
    ['GAMING ARENA', 20],
    ['FUNZONE', 5],
    ['MUSIC ZONE', 5],
    ['PFP AND BANNERS', 4],
    ['PERKS', 4],
  ]);
  assert.equal(d.channels.length, 15 + counts.reduce((a, [, n]) => a + n, 0));
  const voices = (cat) =>
    d.channels.filter((c) => c.type === ChannelType.GuildVoice && c.parentId === cat.id);
  const named = (n) => cats.find((c) => c.name === `✦ ${n} ✦`);
  assert.equal(voices(named('CHILLING ZONE')).length, 16);
  assert.equal(voices(named('DUO')).length, 9);
  assert.equal(voices(named('GAMING ARENA')).length, 15);
  assert.equal(voices(named('INDIA STREETS')).length, 13);
  assert.ok(voices(named('CHILLING ZONE')).some((v) => v.name === 'Lounge 15'));
});
test('every channel is a valid unique-in-category name, nested under a real category', () => {
  const d = discordIndiaTemplate(),
    ids = new Map(d.channels.map((c) => [c.id, c])),
    seen = new Set();
  for (const c of d.channels) {
    assert.ok(c.name.length >= 1 && c.name.length <= 100);
    if (c.type === ChannelType.GuildCategory) assert.equal(c.parentId, null);
    else assert.equal(ids.get(c.parentId)?.type, ChannelType.GuildCategory);
    if (c.type === ChannelType.GuildText) assert.match(c.name, /^┃[a-z0-9-]+$/);
    const key = `${c.parentId}:${c.type}:${c.name}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
    assert.deepEqual(c.overwrites, []);
  }
});
test('roles are cosmetic: 120 unique names, zero permissions, valid colors, ids unique', () => {
  const roles = discordIndiaTemplate().roles.filter((r) => !r.everyone);
  assert.equal(roles.length, 120);
  assert.equal(new Set(roles.map((r) => r.name)).size, 120);
  assert.equal(new Set(roles.map((r) => r.id)).size, 120);
  for (const r of roles) {
    assert.equal(r.permissions, '0', r.name);
    assert.ok(r.color >= 0 && r.color <= 0xffffff, r.name);
    assert.ok(r.name.length <= 100);
  }
  assert.equal(roles.at(-1).name, 'India Officials™');
});
test('built-in is usable by anyone with command access, listed, and cannot be saved over or deleted', () => {
  const c = env();
  assert.equal(c.templates.use('Discord India', 'anyone', false).data.channels.length, 132);
  const list = c.templates.list('anyone', false);
  assert.deepEqual(
    list.map((r) => [r.name, r.roles, r.channels, r.from]),
    [['discord-india', 120, 132, 'built-in']],
  );
  assert.throws(() => c.templates.save('discord-india', {}, 'u', 'x'), { key: 'tpBuiltin' });
  assert.throws(() => c.templates.remove('discord india', 'u', true), { key: 'tpBuiltin' });
  assert.throws(() => c.templates.use('nope', 'u', false), { key: 'tpNotFound' });
});
test('built-in survives a fresh Templates object (restart) and saved templates still work beside it', () => {
  const db = openDatabase(':memory:'),
    a = { features: new FeatureStore(db) };
  a.templates = new Templates(a);
  const data = { version: 1, guildId: 'A', guildName: 'S', roles: [], channels: [] };
  a.templates.save('mine', data, 'u1', 'S');
  const b = { features: a.features };
  b.templates = new Templates(b);
  assert.deepEqual(
    b.templates.list('u1', false).map((r) => r.name),
    ['mine', 'discord-india'],
  );
  assert.deepEqual(
    b.templates.list('u2', false).map((r) => r.name),
    ['discord-india'],
  );
});
test('apply nests every voice and text channel in its category and creates staff roles last (top)', async () => {
  const roleLog = [],
    chans = [];
  const target = {
    id: 'B',
    roles: {
      fetch: async () => {},
      cache: new Map(),
      create: async (o) => (roleLog.push(o), { id: `R${roleLog.length}` }),
    },
    channels: {
      fetch: async () => {},
      cache: new Map(),
      create: async (o) => {
        const made = { id: `C${chans.length + 1}` };
        chans.push({ ...o, id: made.id });
        return made;
      },
    },
  };
  const t = env().templates.use('discord india', 'u', false),
    out = await new Promise((r) =>
      startApply(target, t.data, { sleep: async () => {}, pace: 1, finish: async (o) => r(o) }),
    );
  assert.equal(out.rolesCreated, 120);
  assert.equal(out.channelsCreated, 132);
  assert.equal(out.failed, 0);
  assert.equal(roleLog.at(-1).name, 'India Officials™');
  // The 46 real roles end up on top in the user's exact member-list order (created bottom first).
  assert.deepEqual(
    roleLog.slice(-46).map((r) => r.name),
    REAL_ROLES.map(([n]) => n).reverse(),
  );
  assert.ok(roleLog.slice(-46).every((r) => r.hoist === true && r.mentionable === false));
  assert.equal(roleLog[0].permissions, 0n);
  const cats = chans.filter((c) => c.type === ChannelType.GuildCategory);
  assert.equal(cats.length, 15);
  assert.ok(chans.indexOf(cats.at(-1)) < 15, 'all categories are created first');
  const catIds = new Set(cats.map((c) => c.id));
  for (const c of chans.filter((x) => x.type !== ChannelType.GuildCategory))
    assert.ok(catIds.has(c.parent), c.name);
  const lounge = chans.filter((c) => /^Lounge \d+$/.test(c.name));
  assert.equal(lounge.length, 15);
  assert.ok(lounge.every((c) => c.type === ChannelType.GuildVoice));
  // Order inside a category follows the template order.
  const chill = cats.find((c) => c.name.includes('CHILLING ZONE')),
    inChill = chans.filter((c) => c.parent === chill.id).map((c) => c.name);
  assert.deepEqual(inChill.slice(0, 5), [
    '┃vc-rules',
    '┃vc-help',
    '┃vc-request',
    'Movie Night',
    'Lounge 1',
  ]);
});
test('real role names are kept verbatim, including punctuation and emoji', () => {
  const names = REAL_ROLES.map(([n]) => n);
  assert.equal(names.length, 46);
  assert.equal(names[0], 'India Officials™');
  for (const n of [
    'Happy Birthday 💖',
    'Top Performer 🕊',
    '. The Authority !?',
    '. Main Character ?',
    'Warriors.?!',
    "Og'z",
    'Melodist.!',
    'Spotify !',
    '〃💫 ⁚ Starlight Acolyte 20',
  ])
    assert.ok(names.includes(n), n);
  assert.equal(names.at(-1), '〃💫 ⁚ Dawn Initiate 10');
  assert.ok(names.includes('Realm’s Chosen'));
});
