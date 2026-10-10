import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import { ServerLogs } from '../src/services/logging.js';
import logging from '../src/commands/logging/logging.js';
import welcome from '../src/commands/welcomer/welcome.js';
import { makeGuild } from './helpers/guild.js';
function setup(){const db=openDatabase(':memory:'),guildConfig=new GuildConfig(new GuildSettings(db)),s=makeGuild(),replies=[];s.guild.members.fetch=async()=>({id:'100000000000000002',user:{username:'Tester'},guild:s.guild});const c={guildConfig,config:{memberEventsEnabled:true},serverLogs:new ServerLogs(guildConfig,{warn:()=>{}})};let sub='config';const i={guild:s.guild,guildId:'g',user:{id:'100000000000000002'},deferReply:async()=>{},editReply:async v=>replies.push(v),options:{getSubcommand:()=>sub,getChannel:()=>({id:'100000000000000001'}),getString:()=> 'Hello {user}',getBoolean:()=>true}};return {db,c,i,s,replies,setSub:v=>sub=v};}
test('logging setup, enable, config, test and disable persist',async()=>{const x=setup();try{for(const sub of ['channel','enable','config','test','disable']){x.setSub(sub);await logging.execute(x.i,x.c);}assert.equal(x.replies.length,5);assert.equal(x.s.sent.length,1);assert.equal(x.c.guildConfig.get('g').logging.enabled,false);}finally{x.db.close();}});
test('welcome enable requires runtime member events and destination',async()=>{const x=setup();try{x.setSub('enable');await assert.rejects(()=>welcome.execute(x.i,x.c),/channel first/);x.setSub('channel');await welcome.execute(x.i,x.c);x.c.config.memberEventsEnabled=false;x.setSub('enable');await assert.rejects(()=>welcome.execute(x.i,x.c),/disabled in the runtime/);x.c.config.memberEventsEnabled=true;for(const sub of ['message','enable','goodbye','test','config','disable']){x.setSub(sub);await welcome.execute(x.i,x.c);}assert.equal(x.s.sent.length,1);assert.equal(x.c.guildConfig.get('g').welcome.enabled,false);assert.equal(x.c.guildConfig.get('g').welcome.goodbyeEnabled,true);}finally{x.db.close();}});
