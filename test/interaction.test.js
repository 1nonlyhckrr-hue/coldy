import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInteractionHandler } from '../src/events/interactionCreate.js';
import { Cooldowns } from '../src/services/cooldowns.js';
const logger={error:()=>{},warn:()=>{}};
function setup(command){const replies=[]; const i={isChatInputCommand:()=>true,inGuild:()=>true,user:{id:'u'},guildId:'g',commandName:'x',reply:async v=>replies.push(v)};const c={commands:new Map([['x',command]]),config:{ownerIds:[]},cooldowns:new Cooldowns(),logger};return {i,c,replies};}
test('dispatch executes and rate limits',async()=>{let n=0;const {i,c,replies}=setup({data:{name:'x'},execute:async()=>n++});const h=createInteractionHandler(c);await h(i);await h(i);assert.equal(n,1);assert.match(replies[0].embeds[0].data.description,/Please wait/);});
test('internal error is not disclosed',async()=>{const {i,c,replies}=setup({data:{name:'x'},execute:async()=>{throw new Error('SECRET');}});await createInteractionHandler(c)(i);assert(!replies[0].embeds[0].data.description.includes('SECRET'));assert.match(replies[0].embeds[0].data.description,/Reference:/);});
test('non-command events are ignored',async()=>{const {i,c}=setup({});i.isChatInputCommand=()=>false;await createInteractionHandler(c)(i);});
