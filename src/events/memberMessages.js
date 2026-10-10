import { lunaPayload } from '../utils/embeds.js';
import { renderTemplate, validateOutputChannel } from '../services/guildConfig.js';
export function createMemberMessageHandler(context,kind){
 return async member=>{
  try{
   const config=context.guildConfig.get(member.guild.id).welcome;
   const enabled=kind==='welcome'?config.enabled:config.goodbyeEnabled;
   if(!enabled||!config.channelId)return;
   const channel=await validateOutputChannel(member.guild,config.channelId);
   const content=renderTemplate(kind==='welcome'?config.message:config.goodbyeMessage,member);
   // Only the new member may be mentioned, never roles or everyone.
   await channel.send(lunaPayload({content,allowedMentions:{parse:[],users:kind==='welcome'?[member.id]:[]}}));
  }catch{context.logger.warn({guildId:member.guild.id},'Member message delivery unavailable');}
 };
}
