import { PermissionFlagsBits as P } from 'discord.js';
import { lunaPayload } from '../utils/embeds.js';
export function createAutoresponderHandler(context){return async message=>{
 if(!message.guild||!message.author||message.author.bot||message.webhookId||message.system||!message.content||message.content.length>4000)return;
 // Edits are not handled. Very old messages/replayed events are not eligible.
 if(!Number.isFinite(message.createdTimestamp)||Math.abs(Date.now()-message.createdTimestamp)>300000)return;
 let reserved=false;
 try{
  const me=await message.guild.members.fetchMe();
  if(!message.channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))return;
  const rule=context.autoresponders.claim(message.guild.id,message.id,message.content);if(!rule)return;reserved=true;
  const locale=context.guildConfig.get(message.guild.id).language;
  await message.channel.send(lunaPayload({content:rule.response,allowedMentions:{parse:[],repliedUser:false}},{locale}));
  context.autoresponders.finish(message.id,'sent');
 }catch{
  if(reserved){try{context.autoresponders.finish(message.id,'uncertain');}catch{}}
  context.logger.warn({guildId:message.guild.id},'Autoresponder delivery unavailable; no automatic retry');
 }
};}
