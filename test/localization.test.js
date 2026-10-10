import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate,validateLocaleCoverage,Localization } from '../src/services/localization.js';
import { openDatabase,GuildSettings } from '../src/database/index.js';
import { GuildConfig } from '../src/services/guildConfig.js';
import configCommand from '../src/commands/general/config.js';
test('locale keys aligned and placeholders strict',()=>{assert(validateLocaleCoverage()>=7);assert.match(translate('hi','languageSaved',{language:'hi'}),/भाषा/);assert.throws(()=>translate('bad','enabled'));assert.throws(()=>translate('en','unknown'));assert.throws(()=>translate('en','languageSaved'));});
test('per-guild language isolates and localized config executes',async()=>{const db=openDatabase(':memory:');try{const guildConfig=new GuildConfig(new GuildSettings(db)),c={guildConfig,localization:new Localization(guildConfig),config:{memberEventsEnabled:false}},replies=[];let sub='language';const i={guildId:'one',options:{getSubcommand:()=>sub,getString:()=> 'hi'},reply:async p=>replies.push(p)};await configCommand.execute(i,c);assert.equal(guildConfig.get('one').language,'hi');assert.equal(guildConfig.get('two').language,'en');assert.throws(()=>guildConfig.setLanguage('one','invalid'));sub='view';await configCommand.execute(i,c);assert.match(replies[1].embeds[0].data.description,/भाषा/);}finally{db.close();}});
