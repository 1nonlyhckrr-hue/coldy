import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lunaEmbed,lunaPayload,LUNA_COLOR } from '../src/utils/embeds.js';
test('Luna brand and polished error styles apply with Discord length bounds',()=>{
 const e=lunaEmbed({title:'x'.repeat(300),description:'d'.repeat(5000),fields:[{name:'name',value:'v'.repeat(1200)}],timestamp:true}).toJSON();
 assert.equal(e.color,LUNA_COLOR);assert.equal(e.title.length,256);assert.equal(e.description.length,4096);assert.equal(e.fields[0].value.length,1024);assert(e.footer.text.includes('Luna'));assert(e.timestamp);
 const p=lunaPayload({content:'Denied',flags:64,allowedMentions:{parse:[]}},{kind:'error'});assert.equal(p.content,undefined);assert.equal(p.flags,64);assert.match(p.embeds[0].data.title,/Unable/);assert.deepEqual(p.allowedMentions,{parse:[]});
});
