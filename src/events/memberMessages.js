import { lunaPayload } from '../utils/embeds.js';
import { renderGuildTemplate, validateOutputChannel } from '../services/guildConfig.js';
export function createMemberMessageHandler(context,kind){
 return async member=>{
  try{
   const settings=context.guildConfig.get(member.guild.id);const config=settings.welcome;
   const enabled=kind==='welcome'?config.enabled:config.goodbyeEnabled;
   if(!enabled||!config.channelId)return;
   const channel=await validateOutputChannel(member.guild,config.channelId);
   const content=renderGuildTemplate(config,kind,member,settings.language);
   // Only the new member may be mentioned, never roles or everyone.
   await channel.send(lunaPayload({content,allowedMentions:{parse:[],users:kind==='welcome'?[member.id]:[]}},{locale:settings.language}));
  }catch{context.logger.warn({guildId:member.guild.id},'Member message delivery unavailable');}
 };
}
