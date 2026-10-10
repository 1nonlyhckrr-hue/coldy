import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
export class ServerLogs {
 constructor(config,logger){this.config=config;this.logger=logger;}
 async emit(guild,entry){
  try{
   const setting=this.config.get(guild.id).logging;
   if(!setting.enabled||!setting.channelId)return {sent:false,reason:'disabled'};
   const channel=await validateOutputChannel(guild,setting.channelId);
   const content=`Luna ${entry.kind} | ${entry.action ?? 'event'} | case ${entry.caseId ?? '-'} | actor ${entry.actorId ?? '-'} | target ${entry.targetId ?? '-'}`.slice(0,1900);
   await channel.send(lunaPayload({content,allowedMentions:{parse:[]}}));
   return {sent:true};
  }catch{this.logger.warn({guildId:guild.id},'Server log delivery unavailable');return {sent:false,reason:'unavailable'};}
 }
}
