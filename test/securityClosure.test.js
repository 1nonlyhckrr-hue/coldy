import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (p) => JSON.parse(await readFile(p, 'utf8'));
test('securityclosure41exactrows unique source syntax actualpaths docs omissions currentinventory', async () => {
  const rows = await load('data/security-closure.json'),
    sources = new Set(rows.map((r) => r.source)),
    ref = (await load('data/commands.json')).filter((r) => sources.has(r.source)),
    paths = new Set((await load('data/luna-commands.json')).map((r) => r.name));
  assert.equal(rows.length, 41);
  assert.equal(ref.length, 41);
  assert.equal(new Set(rows.map((r) => r.source + ':' + r.referenceName)).size, 41);
  for (const r of ref) {
    const x = rows.find((x) => x.source === r.source && x.referenceName === r.name);
    assert(x);
    assert.equal(x.referenceSyntax, r.syntax);
    assert(x.reason.length > 30);
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
test('securityclosure no preventioninstantban extraowner/logging parity thresholdbypasses named', async () => {
  const rows = await load('data/security-closure.json');
  for (const n of ['antipunish', 'extraowner set', 'mainrole add', 'whitelist', 'automod logging'])
    assert.equal(rows.find((r) => r.referenceName === n).disposition, 'omitted');
  const doc = await readFile('docs/SECURITY_CLOSURE.md', 'utf8');
  for (const s of [
    'Unban/prune/botadd/memberupdate',
    'recoveryrole',
    'default6messages',
    'current-serverinvite',
    '>80percent',
    'emoji spam',
    'NSFWlink',
    'not channelannouncements',
    'not vanity protection',
  ])
    assert(doc.includes(s));
});
test('securityclosure adds41disjoint from preceding97 rather than duplicatecountclaims', async () => {
  const ledgers = await Promise.all(
      [
        'data/moderation-closure.json',
        'data/activity-closure.json',
        'data/security-closure.json',
      ].map(load),
    ),
    keys = ledgers.flat().map((r) => r.source + ':' + r.referenceName);
  assert.equal(keys.length, 138);
  assert.equal(new Set(keys).size, 138);
});
