import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
const families = [
  'moderation',
  'activity',
  'security',
  'roles',
  'configuration',
  'support',
  'utility',
  'entertainment',
];
test('complete319exactregistry rows one disposition no invented parity', async () => {
  const ref = await load('data/commands.json'),
    rows = (await Promise.all(families.map((f) => load('data/' + f + '-closure.json')))).flat();
  assert.equal(ref.length, 319);
  assert.equal(rows.length, 319);
  const key = (r) => r.source + ':' + (r.referenceName ?? r.name),
    keys = rows.map(key);
  assert.equal(new Set(keys).size, 319);
  assert.deepEqual([...keys].sort(), ref.map(key).sort());
  for (const r of rows) {
    assert(['adapted', 'omitted'].includes(r.disposition));
    assert(r.reason.length > 40);
    assert(r.verification.includes('unverified'));
    if (r.disposition === 'omitted') {
      assert(['safety', 'native-limit'].includes(r.limitKind));
      assert.equal(r.lunaPaths.length, 0);
    }
  }
});
test('all34index contentpages have sourceclosure evidence including premium/legal/introduction', async () => {
  const sources = await load('data/source-closure.json'),
    ref = await load('data/commands.json');
  assert.equal(sources.length, 34);
  assert.equal(new Set(sources.map((s) => s.source)).size, 34);
  for (const s of new Set(ref.map((r) => r.source))) assert(sources.some((r) => r.source === s));
  for (const s of sources) {
    assert(s.scope.length > 40);
    assert(s.verification.includes('unverified'));
    await readFile(s.behaviorDoc, 'utf8');
    if (s.commandLedger) await load(s.commandLedger);
  }
  for (const n of [
    'intro/premium.md',
    'legal/privacy.md',
    'legal/terms.md',
    'intro/whatiszynrax.md',
    'intro/whyzynrax.md',
  ])
    assert(sources.some((r) => r.source.endsWith(n) && r.commandLedger === null));
});
test('supplemental premium3commands socialprivacy marketing and deletion explicitly closed', async () => {
  const doc = await readFile('docs/SUPPLEMENTAL_CLOSURE.md', 'utf8');
  for (const s of [
    'premium activate',
    'premium revoke',
    'premium status',
    'Dating',
    'Vanity',
    'goodbye',
    'Anti-Betray',
    'Razorpay',
    'Cryptomus',
    'bot removal',
    'ticket snapshots',
    'backup',
    '319',
    'unverified',
  ])
    assert(doc.includes(s));
  const ref = await load('data/commands.json');
  assert(!ref.some((r) => r.name.startsWith('premium ')));
});
