import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
test('utilityclosure37unique exact reference sources/syntax actualpaths docs namedomissions', async () => {
  const rows = await load('data/utility-closure.json'),
    sources = new Set(rows.map((x) => x.source)),
    ref = (await load('data/commands.json')).filter((r) => sources.has(r.source)),
    paths = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 37);
  assert.equal(ref.length, 37);
  assert.equal(new Set(rows.map((r) => r.source + ':' + r.referenceName)).size, 37);
  for (const r of ref) {
    const x = rows.find((x) => x.source === r.source && x.referenceName === r.name);
    assert(x);
    assert.equal(x.referenceSyntax, r.syntax);
    assert(x.reason.length > 40);
    await readFile(x.evidenceDoc, 'utf8');
    assert(x.verification.includes('unverified'));
    if (x.disposition === 'adapted') {
      assert(x.lunaPaths.length);
      for (const p of x.lunaPaths) assert(paths.has(p));
    } else {
      assert.equal(x.disposition, 'omitted');
      assert(['safety', 'native-limit'].includes(x.limitKind));
      assert.deepEqual(x.lunaPaths, []);
    }
  }
});
test('utilityclosure native providers/payment/relay/profile gaps explicit', async () => {
  const rows = await load('data/utility-closure.json');
  for (const n of ['weather', 'translate', 'makeqr', 'say', 'embed', 'prefix', 'customize avatar'])
    assert.equal(rows.find((r) => r.referenceName === n).disposition, 'omitted');
  const doc = await readFile('docs/UTILITY_CLOSURE.md', 'utf8');
  for (const s of [
    'cross-server',
    'bio',
    '25fields',
    'extraowner',
    'approximate',
    'shard',
    'no prefix parser',
  ])
    assert(doc.includes(s));
});
test('utilityclosure adds37disjoint264of319 no denominatorinflation', async () => {
  const rows = (
      await Promise.all(
        ['moderation', 'activity', 'security', 'roles', 'configuration', 'support', 'utility'].map(
          (f) => load('data/' + f + '-closure.json'),
        ),
      )
    ).flat(),
    keys = rows.map((r) => r.source + ':' + r.referenceName);
  assert.equal(keys.length, 264);
  assert.equal(new Set(keys).size, 264);
});
