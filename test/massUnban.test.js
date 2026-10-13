import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banCsv, startMassUnban, fetchAllBans } from '../src/services/modTools.js';
const ban = (id, reason) => ({ user: { id, username: 'u' + id }, reason });
const guild = (bans, failIds = []) => {
  const done = [];
  return {
    done,
    id: '1',
    bans: { fetch: async () => new Map(bans.map((b) => [b.user.id, b])) },
    members: {
      unban: async (id) => {
        if (failIds.includes(id)) throw new Error('x');
        done.push(id);
      },
    },
  };
};
test('banCsv escapes quotes and newlines', () => {
  const t = banCsv([ban('1', 'said "hi"\nbye')]);
  assert.equal(t, 'id,username,reason\n"1","u1","said ""hi"" bye"\n');
});
test('fetchAllBans pages and caps', async () => {
  const g = guild([ban('1'), ban('2'), ban('3')]);
  assert.equal((await fetchAllBans(g, 2)).length, 2);
});
test('massunban unbans everyone, invites, tallies closed DMs, survives failures', async () => {
  const g = guild([ban('1'), ban('2'), ban('3')], ['2']);
  let result;
  const finished = new Promise((r) => (result = r));
  const total = await startMassUnban(
    { guild: g, user: { id: '9' }, client: {} },
    {},
    {
      invite: true,
      t: (k) => k,
      delayMs: 0,
      sendInvite: async (_g, _c, id) =>
        id === '1' ? { status: 'sent' } : { status: 'dmFailed', url: 'https://d/x' },
      finish: async (r) => result(r),
    },
  );
  assert.equal(total, 3);
  const r = await finished;
  assert.deepEqual(g.done, ['1', '3']);
  assert.equal(r.ok, 2);
  assert.equal(r.failed, 1);
  assert.equal(r.invited, 1);
  assert.deepEqual(r.dmClosed, ['3 https://d/x']);
});
test('massunban refuses a second run while one is active and an empty list', async () => {
  const empty = guild([]);
  await assert.rejects(startMassUnban({ guild: empty, user: { id: '9' }, client: {} }, {}, {}), {
    key: 'mtUnbanNone',
  });
});
