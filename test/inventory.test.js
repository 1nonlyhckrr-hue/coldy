import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('reference inventory has sources, no implementation claims, and deduplicated aliases',async()=>{
  const rows=JSON.parse(await readFile('data/commands.json','utf8'));
  assert.equal(rows.length,318);
  for(const row of rows){assert(row.source.startsWith('https://docs.zynrax.site/'));assert(row.referenceVerified);assert.equal(row.implemented,false);assert.equal(row.tested,false);}
  assert(rows.find(r=>r.name==='serverinfo').aliases.includes('si'));
  assert(!rows.some(r=>r.name==='si'));
  assert(rows.find(r=>r.name==='setup create').parameters.some(p=>p.name==='name'));
});
