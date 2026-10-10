import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { validateOutputChannel } from './guildConfig.js';
import { UserError } from '../utils/errors.js';
const safeNames=new Set(['ViewChannel','SendMessages','ReadMessageHistory','AddReactions','EmbedLinks','AttachFiles','UseExternalEmojis','UseExternalStickers','Connect','Speak','Stream','UseVAD','UseApplicationCommands','SendMessagesInThreads','SendVoiceMessages','SendPolls']);
// Fail closed for new Discord permissions: only reviewed community permissions are allowed.
const dangerous=Object.entries(P).filter(([name])=>!safeNames.has(name)).map(([,flag])=>flag);
export function validateSelfRole(role,bot,actor,guild){
 if(!role||role.guild.id!==guild.id||role.id===guild.id||role.managed)throw new UserError('roleInvalid');
 if(dangerous.some(permission=>role.permissions.has(permission)))throw new UserError('roleDangerous');
 if(bot.roles.highest.comparePositionTo(role)<=0)throw new UserError('roleBotHierarchy');
 if(actor.id!==guild.ownerId&&actor.roles.highest.comparePositionTo(role)<=0)throw new UserError('roleActorHierarchy');
 if(!bot.permissions.has(P.ManageRoles))throw new UserError('roleBotPermission');
}
export class RolePanels {
 constructor(db){this.db=db;}
 reserve(record){return Number(this.db.prepare('INSERT INTO role_panels(guild_id,channel_id,role_id,label,interaction_id,created_at) VALUES(?,?,?,?,?,?)').run(record.guildId,record.channelId,record.roleId,record.label,record.interactionId,Date.now()).lastInsertRowid);}
 get(id,guildId){return this.db.prepare('SELECT * FROM role_panels WHERE id=? AND guild_id=?').get(id,guildId);}
 list(guildId){return this.db.prepare('SELECT id,channel_id,message_id,role_id,label,status FROM role_panels WHERE guild_id=? ORDER BY id DESC LIMIT 20').all(guildId);}
 complete(id,messageId){this.db.prepare("UPDATE role_panels SET message_id=?,status='active' WHERE id=?").run(messageId,id);}
 status(id,status){if(!['disabled','uncertain','failed'].includes(status))throw new Error('Invalid panel state');this.db.prepare('UPDATE role_panels SET status=? WHERE id=?').run(status,id);}
}
export async function createRolePanel(i,c,{channelId,roleId,label}){
 const locale=c.localization?.locale(i.guildId)??'en';
 if(typeof label!=='string'||label.trim().length<1||label.length>70)throw new UserError('roleLabelInvalid');
 const [actor,bot,role,channel]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.roles.fetch(roleId),validateOutputChannel(i.guild,channelId)]);
 if(!actor.permissions.has(P.ManageRoles))throw new UserError('roleActorPermission');
 validateSelfRole(role,bot,actor,i.guild);
 const panelId=c.rolePanels.reserve({guildId:i.guildId,channelId,roleId,label:label.trim(),interactionId:i.id});
 const button=new ButtonBuilder().setCustomId(`luna:role:${panelId}`).setLabel(label.trim()).setStyle(ButtonStyle.Secondary);
 let message;
 try{message=await channel.send(lunaPayload({content:translate(locale,'rolePanelPrompt'),components:[new ActionRowBuilder().addComponents(button)],allowedMentions:{parse:[]}},{locale}));}
 catch{c.rolePanels.status(panelId,'uncertain');throw new UserError('rolePanelUncertain',{id:panelId});}
 try{c.rolePanels.complete(panelId,message.id);}
 catch{throw new UserError('rolePanelStorageFailed',{id:panelId});}
 return {panelId,messageId:message.id};
}
export function createRoleButtonHandler(c){
 const active=new Set();
 return async i=>{
  if(!i.isButton()||!i.customId.startsWith('luna:role:'))return false;
  const locale=c.localization?.locale(i.guildId)??'en';
  const key=`${i.guildId}:${i.user.id}`;
  if(active.has(key)){await i.reply(lunaPayload({content:translate(locale,'roleActionBusy'),flags:MessageFlags.Ephemeral},{locale}));return true;}
  active.add(key);
  try{
   if(!i.inGuild())throw new UserError('roleGuildOnly');
   await i.deferReply({flags:MessageFlags.Ephemeral});
   const id=i.customId.slice('luna:role:'.length);
   if(!/^\d+$/.test(id))throw new UserError('rolePanelInvalid');
   const panel=c.rolePanels.get(Number(id),i.guildId);
   if(!panel||panel.status!=='active'||panel.message_id!==i.message.id||panel.channel_id!==i.channelId)throw new UserError('rolePanelInactive');
   const remaining=c.cooldowns.acquire(`role:${key}`,3000);if(remaining)throw new UserError('roleCooldown');
   const [member,bot,role]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.roles.fetch(panel.role_id)]);
   // Validate every click: a role may have been edited to grant dangerous permissions.
   validateSelfRole(role,bot,{id:i.guild.ownerId},i.guild);
   const has=member.roles.cache.has(role.id);
   try{if(has)await member.roles.remove(role,'Luna self-service role');else await member.roles.add(role,'Luna self-service role');}
   catch{throw new UserError('roleChangeUncertain');}
   await i.editReply(lunaPayload({content:translate(locale,has?'roleRemoved':'roleAdded'),allowedMentions:{parse:[]}},{locale}));
  }catch(error){await c.handleInteractionError(error,i,c.logger);}
  finally{active.delete(key);}
  return true;
 };
}
