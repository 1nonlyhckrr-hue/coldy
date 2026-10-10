import { z } from 'zod';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
const id=z.string().regex(/^\d{17,20}$/);
const message=z.string().min(1).max(1800);
export const guildConfigSchema=z.object({
  language:z.enum(['en','hi','hinglish']).default('en'),
  logging:z.object({enabled:z.boolean().default(false),channelId:id.optional()}).strict().default({enabled:false}),
  welcome:z.object({enabled:z.boolean().default(false),channelId:id.optional(),message:message.default('Welcome {user} to {server}!'),goodbyeEnabled:z.boolean().default(false),goodbyeMessage:message.default('Goodbye {username}.')}).strict().default({enabled:false,message:'Welcome {user} to {server}!',goodbyeEnabled:false,goodbyeMessage:'Goodbye {username}.'}),
}).strict();
export class GuildConfig {
  constructor(settings){this.settings=settings;}
  get(guildId){return guildConfigSchema.parse(this.settings.get(guildId));}
  patch(guildId,section,changes){
    if(!['logging','welcome'].includes(section)) throw new UserError('Unknown configuration section.');
    // Validate inside repository transaction so read/merge/write is atomic.
    return this.settings.db.transaction(()=>{const current=this.get(guildId);const updated=guildConfigSchema.parse({...current,[section]:{...current[section],...changes}});this.settings.set(guildId,updated);return updated[section];})();
  }
  setLanguage(guildId,language){return this.settings.db.transaction(()=>{const updated=guildConfigSchema.parse({...this.get(guildId),language});this.settings.set(guildId,updated);return language;})();}
  reset(guildId,section){const defaults=guildConfigSchema.parse({});return this.patch(guildId,section,{...defaults[section],channelId:undefined});}
}
export async function validateOutputChannel(guild,channelId){
 let channel;try{channel=await guild.channels.fetch(channelId);}catch{throw new UserError('That channel could not be fetched.');}
 if(!channel || channel.guildId!==guild.id || ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)) throw new UserError('Choose a text or announcement channel in this server.');
 const bot=await guild.members.fetchMe({force:true});
 if(!channel.permissionsFor(bot)?.has([P.ViewChannel,P.SendMessages])) throw new UserError('Luna needs View Channel and Send Messages there.');
 return channel;
}
export function renderTemplate(template,member){
 const vars={user:`<@${member.id}>`,username:member.user.username,server:member.guild.name,count:String(member.guild.memberCount)};
 return template.replace(/\{(user|username|server|count)\}/g,(_,key)=>vars[key]).slice(0,1900);
}
