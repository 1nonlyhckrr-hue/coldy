import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
const categories = JSON.parse(await readFile('data/categories.json','utf8'));
const row = z.object({name:z.string().min(1),category:z.enum(categories),syntax:z.string(),description:z.string(),parameters:z.array(z.unknown()),userPermissions:z.array(z.string()),botPermissions:z.array(z.string()),aliases:z.array(z.string()),referenceVerified:z.boolean(),implemented:z.boolean(),tested:z.boolean(),notes:z.string(),source:z.string()}).strict();
const rows = z.array(row).parse(JSON.parse(await readFile('data/commands.json','utf8')));
const seen = new Set();
for (const item of rows) { const key = `${item.category}:${item.name}`; if (seen.has(key)) throw new Error(`Duplicate inventory row: ${key}`); seen.add(key); if (item.referenceVerified && !item.source) throw new Error(`Verified row missing source: ${key}`); if (item.tested && !item.implemented) throw new Error(`Tested but not implemented: ${key}`); }
const columns = ['name','category','syntax','description','parameters','userPermissions','botPermissions','aliases','referenceVerified','implemented','tested','notes','source'];
const quote = value => { let s = typeof value === 'string' ? value : JSON.stringify(value); if (/^[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
await writeFile('data/commands.csv',columns.join(',')+'\n'+rows.map(r => columns.map(c => quote(r[c])).join(',')).join('\n')+(rows.length ? '\n' : ''));
console.log(`Reference rows: ${rows.length}; verified: ${rows.filter(r=>r.referenceVerified).length}.`);
