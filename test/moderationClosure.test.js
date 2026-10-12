import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (path) => JSON.parse(await readFile(path, 'utf8'));
test('moderation closure59exact reference rows source/syntax unique everydisposition no phantom paths', async () => {
  const ref = (await load('data/commands.json')).filter(
      (r) => r.source === 'https://docs.zynrax.site/security/moderation',
    ),
    rows = await load('data/moderation-closure.json'),
    installed = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 59);
  assert.equal(new Set(rows.map((r) => r.referenceName)).size, 59);
  for (const r of ref) {
    const row = rows.find((x) => x.referenceName === r.name);
    assert(row);
    assert.equal(row.source, r.source);
    assert.equal(row.referenceSyntax, r.syntax);
    assert(['adapted', 'omitted'].includes(row.disposition));
    assert(row.reason.length > 40);
    assert(row.verification.includes('unverified'));
    await readFile(row.evidenceDoc, 'utf8');
    if (row.disposition === 'adapted') {
      assert(row.lunaPaths.length > 0);
      for (const p of row.lunaPaths) assert(installed.has(p));
    } else {
      assert.deepEqual(row.lunaPaths, []);
      assert(['safety', 'native-limit'].includes(row.limitKind));
    }
  }
});
test('moderation closure bulk/noavatar/privacy/unban generation limitations explicit no unsafeequivalence', async () => {
  const rows = await load('data/moderation-closure.json');
  assert.equal(rows.find((r) => r.referenceName === 'unbanall').limitKind, 'native-limit');
  assert.match(rows.find((r) => r.referenceName === 'unbanall').reason, /unban\/reban/);
  for (const name of [
    'snipe',
    'nuke',
    'role unverified',
    'role delete',
    'lockall',
    'voice pullall',
  ])
    assert.equal(rows.find((r) => r.referenceName === name).disposition, 'omitted');
  assert.match(rows.find((r) => r.referenceName === 'unmuteall').reason, /1-10/);
  assert.match(rows.find((r) => r.referenceName === 'warn').reason, /automatic4/);
});
test('moderation closure supplemental docs name every purgefilter warningthreshold bound/native caveat', async () => {
  const text = await readFile('docs/MODERATION_CLOSURE.md', 'utf8');
  for (const s of [
    'images/embeds/files/customemoji/contains/reactions',
    'auto4+timeout',
    'Purge999',
    'roleunverified',
    'native Discord',
  ])
    assert(text.includes(s));
});
