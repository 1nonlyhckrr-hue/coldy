import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
test('activityclosure38exact unique sources/syntax dispositions paths/docs no fabricatedequivalence', async () => {
  const ref = (await load('data/commands.json')).filter(
      (r) => r.source.endsWith('/leaderboard') || r.source.endsWith('/voicemaster'),
    ),
    rows = await load('data/activity-closure.json'),
    paths = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 38);
  assert.equal(new Set(rows.map((r) => r.source + ':' + r.referenceName)).size, 38);
  for (const r of ref) {
    const x = rows.find((x) => x.source === r.source && x.referenceName === r.name);
    assert(x);
    assert.equal(x.referenceSyntax, r.syntax);
    assert(x.reason.length > 40);
    assert(x.verification.includes('unverified'));
    await readFile(x.evidenceDoc, 'utf8');
    if (x.disposition === 'adapted') {
      assert(x.lunaPaths.length);
      for (const p of x.lunaPaths) assert(paths.has(p));
    } else {
      assert.equal(x.disposition, 'omitted');
      assert.deepEqual(x.lunaPaths, []);
      assert(['safety', 'native-limit'].includes(x.limitKind));
    }
  }
});
test('activityclosure finiteprivacy/calendar/sampling/explicitgrant and fixedbutton/delete omissions', async () => {
  const rows = await load('data/activity-closure.json'),
    r = (n) => rows.find((x) => x.referenceName === n);
  assert.match(r('leaderboard messages').reason, /90/);
  assert.match(r('leaderboard dailymessages').reason, /not trailing24/);
  assert.match(r('voicelb on').reason, /sampling/);
  assert.match(r('setmessagerole').reason, /explicitmember/);
  assert.equal(r('clearvoice').disposition, 'omitted');
  assert.equal(r('addvctime').disposition, 'omitted');
  assert.match(r('voicemaster buttons').reason, /transfer omitted/);
  assert.match(r('voicemaster reset').reason, /destruction omitted/);
});
test('activityclosure described extra behavior realtime/cleanup/transfer/rewards limits allnamed', async () => {
  const doc = await readFile('docs/ACTIVITY_CLOSURE.md', 'utf8');
  for (const term of [
    'Real-time statistics',
    'automaticemptycleanup',
    'Ownershiptransfer',
    'dropdowncustomization',
    'Fullsysteminstantdelete',
    'All-time/last24hours/currentweek',
    'member-confirmed claims',
  ])
    assert(doc.includes(term));
});
