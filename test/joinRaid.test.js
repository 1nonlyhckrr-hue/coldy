import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { JoinRaid, createJoinRaidHandler } from '../src/services/joinRaid.js';
const DAY = 86400000;
test('disabled by default: joins are ignored', () => {
  const db = openDatabase(':memory:'),
    r = new JoinRaid(db);
  try {
    assert.equal(r.get('g').enabled, false);
    for (let n = 0; n < 20; n++)
      assert.deepEqual(
        r.record('g', { id: String(n), bot: false, createdAt: Date.now() }).targets,
        [],
      );
  } finally {
    db.close();
  }
});
test('burst over the limit acts on young accounts only, once each; old accounts and bots are spared', () => {
  const db = openDatabase(':memory:'),
    r = new JoinRaid(db);
  try {
    r.patch('g', { enabled: true, joins: 3, seconds: 10, minAgeDays: 3 });
    const now = 1_000_000_000_000,
      young = now - DAY,
      old = now - 30 * DAY;
    assert.equal(r.record('g', { id: 'a', bot: false, createdAt: young }, now).raid, false);
    r.record('g', { id: 'bot', bot: true, createdAt: young }, now + 100);
    assert.equal(r.record('g', { id: 'b', bot: false, createdAt: old }, now + 200).raid, false);
    const third = r.record('g', { id: 'c', bot: false, createdAt: young }, now + 300);
    assert.equal(third.raid, true);
    assert.deepEqual(
      third.targets.map((t) => t.id),
      ['a', 'c'],
    );
    const fourth = r.record('g', { id: 'd', bot: false, createdAt: young }, now + 400);
    assert.deepEqual(
      fourth.targets.map((t) => t.id),
      ['d'],
    );
    // Joins outside the window do not count.
    const later = r.record('g', { id: 'e', bot: false, createdAt: young }, now + 60_000);
    assert.equal(later.raid, false);
    assert.throws(() => r.patch('g', { joins: 1 }));
  } finally {
    db.close();
  }
});
function member(id, { createdAt, admin = false, pos = 1, log }) {
  return {
    id,
    user: { bot: false, createdTimestamp: createdAt },
    permissions: { has: (f) => admin && f === P.Administrator },
    roles: { highest: { position: pos } },
    timeout: async (ms) => log.push(['timeout', id, ms]),
    kick: async () => log.push(['kick', id]),
  };
}
async function run(action) {
  const db = openDatabase(':memory:'),
    log = [],
    sent = [];
  const joinRaid = new JoinRaid(db);
  joinRaid.patch('g', {
    enabled: true,
    joins: 2,
    seconds: 30,
    action,
    alertChannelId: '100000000000000009',
  });
  const young = Date.now() - DAY;
  const members = new Map([
    ['1', member('1', { createdAt: young, log })],
    ['2', member('2', { createdAt: young, log })],
    ['3', member('3', { createdAt: young, admin: true, log })],
  ]);
  const guild = {
    id: 'g',
    ownerId: 'o',
    members: {
      me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } },
      fetch: async (id) => members.get(id),
    },
    channels: { fetch: async () => ({ send: async (p) => sent.push(p) }) },
  };
  for (const m of members.values()) m.guild = guild;
  const h = createJoinRaidHandler({
    joinRaid,
    localization: { locale: () => 'en', t: (_g, k) => k },
    logger: { warn() {} },
  });
  await h(members.get('1'));
  await h(members.get('2'));
  await h(members.get('3'));
  db.close();
  return { log, sent };
}
test('handler times out new accounts, skips Administrators, and posts one alert', async () => {
  const { log, sent } = await run('timeout');
  assert.deepEqual(
    log.map((l) => l.slice(0, 2)),
    [
      ['timeout', '1'],
      ['timeout', '2'],
    ],
  );
  assert.equal(log[0][2], 3600000);
  assert.ok(sent.length >= 1);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});
test('kick action kicks instead', async () => {
  const { log } = await run('kick');
  assert.deepEqual(log, [
    ['kick', '1'],
    ['kick', '2'],
  ]);
});
