import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
test('rolesclosure33exactsources syntax unique paths evidence correctdispositions', async () => {
  const rows = await load('data/roles-closure.json'),
    ref = (await load('data/commands.json')).filter((r) =>
      r.source.includes('/configuration/roles/'),
    ),
    paths = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 33);
  assert.equal(ref.length, 33);
  assert.equal(new Set(rows.map((r) => r.source + ':' + r.referenceName)).size, 33);
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
      assert.equal(x.limitKind, 'safety');
      assert.deepEqual(x.lunaPaths, []);
    }
  }
});
test('rolesclosure no automaticprofile/emoji/thirdparty permission laundering', async () => {
  const rows = await load('data/roles-closure.json');
  for (const n of ['staff', 'girl', 'friend', 'guest', 'vip'])
    assert.equal(rows.find((r) => r.referenceName === n).disposition, 'omitted');
  const doc = await readFile('docs/ROLES_CLOSURE.md', 'utf8');
  for (const s of [
    'Manualfreshself',
    'congratulatorychannel',
    'existingmessages',
    'required-role thirdparty',
    'no exhaustiveprofileevents',
    'memberroles unchanged',
  ])
    assert(doc.includes(s));
});
test('rolesclosure adds33disjoint currenttotal171of319 not fullcoverage claim', async () => {
  const rows = (
      await Promise.all(
        ['moderation', 'activity', 'security', 'roles'].map((f) =>
          load('data/' + f + '-closure.json'),
        ),
      )
    ).flat(),
    keys = rows.map((r) => r.source + ':' + r.referenceName);
  assert.equal(keys.length, 171);
  assert.equal(new Set(keys).size, 171);
});
