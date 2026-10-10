import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.js';
const valid = {DISCORD_TOKEN:'x'.repeat(40),DISCORD_CLIENT_ID:'123456789012345678',OWNER_IDS:'123456789012345678'};
test('valid config has defaults and parsed owner IDs',()=>{ const c=loadConfig(valid); assert.equal(c.databasePath,'./var/luna.sqlite'); assert.deepEqual(c.ownerIds,['123456789012345678']); assert(Object.isFrozen(c)); });
test('invalid config names fields without secret input',()=>{ assert.throws(()=>loadConfig({...valid,DISCORD_TOKEN:'secret'}),e=>e.message.includes('DISCORD_TOKEN')&&!e.message.includes('secret')); });
test('invalid owner and guild IDs rejected',()=>{ assert.throws(()=>loadConfig({...valid,OWNER_IDS:'abc'})); assert.throws(()=>loadConfig({...valid,DISCORD_GUILD_ID:'abc'})); });
test('empty optional guild is accepted',()=>assert.equal(loadConfig({...valid,DISCORD_GUILD_ID:''}).guildId,undefined));
