import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
test('configurationclosure33unique exact reference sources/syntax actualpaths docs namedomissions', async () => {
  const rows = await load('data/configuration-closure.json'),
    sources = new Set(rows.map((x) => x.source)),
    ref = (await load('data/commands.json')).filter((r) => sources.has(r.source)),
    paths = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 33);
  assert.equal(ref.length, 33);
  assert.equal(new Set(rows.map((r) => r.source + ':' + r.referenceName)).size, 33);
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
      assert.equal(x.limitKind, 'safety');
      assert.deepEqual(x.lunaPaths, []);
    }
  }
});
test('configurationclosure blanketbypass/autolog/autodelete/dashboard/contentretention omitted honest', async () => {
  const rows = await load('data/configuration-closure.json');
  for (const n of [
    'ignore bypass add',
    'ignore command add',
    'logging auto setup',
    'greet autodelete',
  ])
    assert.equal(rows.find((r) => r.referenceName === n).disposition, 'omitted');
  const doc = await readFile('docs/CONFIGURATION_CLOSURE.md', 'utf8');
  for (const s of [
    'webdashboard',
    'placeholders',
    'Logging70events',
    '20events/min',
    'voiceattendance',
    'audienceprivacy',
  ])
    assert(doc.includes(s));
});
test('configurationclosure adds33disjoint204of319 no denominatorinflation', async () => {
  const rows = (
      await Promise.all(
        ['moderation', 'activity', 'security', 'roles', 'configuration'].map((f) =>
          load('data/' + f + '-closure.json'),
        ),
      )
    ).flat(),
    keys = rows.map((r) => r.source + ':' + r.referenceName);
  assert.equal(keys.length, 204);
  assert.equal(new Set(keys).size, 204);
});
