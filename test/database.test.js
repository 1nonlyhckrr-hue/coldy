import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GuildSettings } from '../src/database/index.js';
test('migrations are idempotent and guild data survives reopening',()=>{ const dir=mkdtempSync(join(tmpdir(),'luna-test-')); try { const path=join(dir,'test.sqlite'); const db=openDatabase(path); const settings=new GuildSettings(db); settings.patch('guild-a',{welcome:true}); settings.patch('guild-a',{channel:'42'}); assert.deepEqual(settings.get('guild-b'),{}); db.close(); const again=openDatabase(path); assert.deepEqual(new GuildSettings(again).get('guild-a'),{welcome:true,channel:'42'}); assert.equal(again.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,14); again.close(); } finally { rmSync(dir,{recursive:true,force:true}); } });
test('parameterized settings do not execute injected IDs',()=>{const db=openDatabase(':memory:');const s=new GuildSettings(db);s.set("x'); DROP TABLE guild_settings; --",{ok:true});assert.deepEqual(s.get('normal'),{});db.close();});
