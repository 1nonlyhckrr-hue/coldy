import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const trigger=o=>o.setName('trigger').setDescription('Literal trigger, case-insensitive').setMinLength(1).setMaxLength(100).setRequired(true);
const response=o=>o.setName('response').setDescription('Response text; mentions are disabled').setMinLength(1).setMaxLength(1800).setRequired(true);
const data=new SlashCommandBuilder().setName('autoresponder').setDescription('Manage server autoresponders.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageGuild)
 .addSubcommand(s=>s.setName('create').setDescription('Create an exact or literal keyword trigger.').addStringOption(trigger).addStringOption(response).addStringOption(o=>o.setName('mode').setDescription('Matching mode').addChoices({name:'Exact message',value:'exact'},{name:'Keyword phrase',value:'keyword'})).addIntegerOption(o=>o.setName('cooldown').setDescription('Server-wide trigger cooldown in seconds').setMinValue(10).setMaxValue(3600)))
 .addSubcommand(s=>s.setName('edit').setDescription('Edit the response for an existing trigger.').addStringOption(trigger).addStringOption(response))
 .addSubcommand(s=>s.setName('delete').setDescription('Delete an existing trigger.').addStringOption(trigger))
 .addSubcommand(s=>s.setName('config').setDescription('List trigger configuration.').addIntegerOption(o=>o.setName('page').setDescription('Page number').setMinValue(1)));
export default {category:'autoresponder',data,userPermissions:[P.ManageGuild],async execute(i,c){
 const locale=c.guildConfig.get(i.guildId).language,t=(k,p)=>translate(locale,k,p);const sub=i.options.getSubcommand();let text;
 if(sub==='create'){
  if(!c.config.messageEventsEnabled)throw new UserError('responderRuntimeDisabled');
  const id=c.autoresponders.create(i.guildId,{trigger:i.options.getString('trigger',true),response:i.options.getString('response',true),mode:i.options.getString('mode')??'exact',cooldownSeconds:i.options.getInteger('cooldown')??60});text=t('responderCreated',{id});
 }
 if(sub==='edit'){c.autoresponders.edit(i.guildId,i.options.getString('trigger',true),i.options.getString('response',true));text=t('responderEdited');}
 if(sub==='delete'){c.autoresponders.delete(i.guildId,i.options.getString('trigger',true));text=t('responderDeleted');}
 if(sub==='config'){
  const rows=c.autoresponders.list(i.guildId),pages=Math.max(1,Math.ceil(rows.length/10)),page=i.options.getInteger('page')??1;
  if(page>pages)throw new UserError('responderPageInvalid',{pages});
  text=t('responderConfig',{page,pages,count:rows.length,runtime:t(c.config.messageEventsEnabled?'enabled':'disabled')});
  text+='\n'+(rows.slice((page-1)*10,page*10).map(r=>`#${r.id} | ${r.trigger} | ${r.mode} | ${r.cooldown_seconds}s`).join('\n')||t('responderEmpty'));
 }
 await i.reply(lunaPayload({content:text,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}},{locale}));
}};
