import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { moderate } from '../../services/moderation.js';
const actions=['warn','warnings','clearwarns','timeout','untimeout','kick','ban','unban'];
const data=new SlashCommandBuilder().setName('moderation').setDescription('Moderation with current permissions, hierarchy and case tracking.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers);
for(const action of actions) data.addSubcommand(s=>{
  s.setName(action).setDescription(`${action}: one member, checked and recorded.`);
  if(action==='unban') s.addStringOption(o=>o.setName('user-id').setDescription('Banned Discord user ID').setRequired(true).setMinLength(17).setMaxLength(20));
  else s.addUserOption(o=>o.setName('member').setDescription('Target member').setRequired(true));
  if(action==='timeout') s.addStringOption(o=>o.setName('duration').setDescription('1s to 28d, e.g. 30m or 1h').setRequired(true).setMaxLength(12));
  if(action!=='warnings') s.addStringOption(o=>o.setName('reason').setDescription('Reason recorded in the case').setMaxLength(400));
  return s;
});
export default {category:'moderation',data,cooldownMs:5000,
  async execute(i,context){
    const locale=context.localization?.locale(i.guildId)??'en',t=(key,params)=>translate(locale,key,params);
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const action=i.options.getSubcommand();
    const result=await moderate(i,context,{action,targetId:action==='unban'?i.options.getString('user-id',true):i.options.getUser('member',true).id,reason:action==='warnings'?undefined:i.options.getString('reason'),duration:action==='timeout'?i.options.getString('duration',true):undefined});
    if(result.id && context.serverLogs){const delivered=await context.serverLogs.emit(i.guild,{kind:'moderation',action,caseId:result.id,actorId:i.user.id,targetId:action==='unban'?i.options.getString('user-id',true):i.options.getUser('member',true).id});if(delivered.reason==='unavailable')result.logUnavailable=true;}
    let content=result.warnings ? (result.warnings.length ? result.warnings.map(w=>`#${w.id}: ${w.reason}`).join('\n').slice(0,1900) : t('modNoWarnings')) : t('modComplete',{action,id:result.id});
    if(result.count!==undefined)content+=' '+t('modCleared',{count:result.count});
    if(result.logUnavailable)content+=' '+t('modLogUnavailable');
    await i.editReply(lunaPayload({content,allowedMentions:{parse:[]}},{locale}));
  }};
