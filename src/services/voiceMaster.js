import {ChannelType,PermissionFlagsBits as P} from 'discord.js';import{UserError}from'../utils/errors.js';
export function privateVoiceOverwrites(guildId,botId,ownerId){if(new Set([guildId,botId,ownerId]).size!==3)throw new UserError('vmIdentityInvalid');return[{id:guildId,type:0,deny:[P.ViewChannel,P.Connect]},{id:botId,type:1,allow:[P.ViewChannel,P.Connect,P.ManageChannels]},{id:ownerId,type:1,allow:[P.ViewChannel,P.Connect,P.Speak,P.Stream,P.UseVAD]}];}
export function verifyPrivateVoice(channel,row,botId){
 if(!channel||channel.guildId!==row.guild_id||channel.id!==row.channel_id||channel.type!==ChannelType.GuildVoice)throw new UserError('vmChannelInvalid');
 const expected=privateVoiceOverwrites(row.guild_id,botId,row.owner_id),actual=channel.permissionOverwrites.cache;if(actual.size!==expected.length)throw new UserError('vmAccessChanged');
 for(const rule of expected){const value=actual.get(rule.id),allow=(rule.allow??[]).reduce((a,b)=>a|b,0n),deny=(rule.deny??[]).reduce((a,b)=>a|b,0n);if(!value||value.type!==rule.type||value.allow.bitfield!==allow||value.deny.bitfield!==deny)throw new UserError('vmAccessChanged');}
}
export class VoiceMaster{
 constructor(db){this.db=db;this.active=new Set();}
 config(guildId){return this.db.prepare('SELECT category_id FROM voice_master_config WHERE guild_id=?').get(guildId);}
 setup(guildId,categoryId){if(!/^\d{17,20}$/.test(categoryId))throw new UserError('vmCategoryInvalid');this.db.prepare('INSERT INTO voice_master_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET category_id=excluded.category_id').run(guildId,categoryId);}
 owned(guildId,userId){return this.db.prepare("SELECT * FROM voice_master_channels WHERE guild_id=? AND owner_id=? AND status!='closed'").get(guildId,userId);}
 reserve(guildId,userId,interactionId){return this.db.transaction(()=>{if(this.owned(guildId,userId))throw new UserError('vmAlreadyOpen');if(this.db.prepare("SELECT count(*) n FROM voice_master_channels WHERE guild_id=? AND status!='closed'").get(guildId).n>=50)throw new UserError('vmLimit');return Number(this.db.prepare("INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at) VALUES(?,?,'creating',?,?)").run(guildId,userId,interactionId,Date.now()).lastInsertRowid);})();}
 created(id,channelId){this.db.prepare("UPDATE voice_master_channels SET channel_id=? WHERE id=? AND status='creating'").run(channelId,id);}
 activate(id,channelId){this.db.prepare("UPDATE voice_master_channels SET channel_id=?,status='active' WHERE id=? AND status='creating'").run(channelId,id);}
 status(id,status){if(!['deleting','closed','uncertain'].includes(status))throw new TypeError('Invalid VoiceMaster state');this.db.prepare('UPDATE voice_master_channels SET status=? WHERE id=?').run(status,id);}
 recover(){this.db.prepare("UPDATE voice_master_channels SET status='uncertain' WHERE status IN ('creating','deleting')").run();}
}
export async function openPrivateVoice(i,c){
 const key=`${i.guildId}:${i.user.id}`;if(c.voiceMaster.active.has(key))throw new UserError('roleActionBusy');c.voiceMaster.active.add(key);
 try{
  const cfg=c.voiceMaster.config(i.guildId);if(!cfg)throw new UserError('vmNotConfigured');
  const[owner,bot,category]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.channels.fetch(cfg.category_id)]);
  if(!owner||owner.id!==i.user.id||owner.user.bot)throw new UserError('customMemberMissing');
  if(!category||category.guildId!==i.guildId||category.type!==ChannelType.GuildCategory)throw new UserError('vmCategoryInvalid');
  if(!category.permissionsFor(owner)?.has([P.ViewChannel,P.Connect]))throw new UserError('vmOwnerPermission');
  if(!bot.permissions.has([P.ManageChannels,P.ViewChannel,P.Connect])||!category.permissionsFor(bot)?.has([P.ViewChannel,P.ManageChannels,P.Connect]))throw new UserError('vmBotPermission');
  if(c.voiceMaster.config(i.guildId)?.category_id!==category.id)throw new UserError('customConfigChanged');
  const id=c.voiceMaster.reserve(i.guildId,i.user.id,i.id);let channel;
  try{channel=await i.guild.channels.create({name:`luna-voice-${id}`,type:ChannelType.GuildVoice,parent:category.id,userLimit:1,permissionOverwrites:privateVoiceOverwrites(i.guildId,bot.id,i.user.id),reason:'Luna private temporary voice channel'});}catch{c.voiceMaster.status(id,'uncertain');throw new UserError('vmCreateUncertain',{id});}
  try{c.voiceMaster.created(id,channel.id);verifyPrivateVoice(channel,{guild_id:i.guildId,owner_id:i.user.id,channel_id:channel.id},bot.id);c.voiceMaster.activate(id,channel.id);}catch{c.voiceMaster.status(id,'uncertain');throw new UserError('vmCreateUncertain',{id});}
  return{id,channelId:channel.id};
 }finally{c.voiceMaster.active.delete(key);}
}
export async function editPrivateVoice(i,c,{action,name,limit}){
 if(!['rename','limit','close'].includes(action))throw new UserError('vmActionInvalid');
 if(action==='rename'&&(typeof name!=='string'||!name.trim()||name.length>80||/[\u0000-\u001f\u007f]/u.test(name)))throw new UserError('vmNameInvalid');
 if(action==='limit'&&(!Number.isInteger(limit)||limit<1||limit>99))throw new UserError('vmUserLimitInvalid');
 const key=`${i.guildId}:${i.user.id}`;if(c.voiceMaster.active.has(key))throw new UserError('roleActionBusy');c.voiceMaster.active.add(key);
 try{
  const row=c.voiceMaster.owned(i.guildId,i.user.id);if(!row||row.status!=='active')throw new UserError('vmNotActive');
  const[owner,bot,channel]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.channels.fetch(row.channel_id)]);
  if(!owner||owner.id!==row.owner_id)throw new UserError('customMemberMissing');
  verifyPrivateVoice(channel,row,bot.id);if(!channel.permissionsFor(bot)?.has(P.ManageChannels)||!i.appPermissions?.has(P.ManageChannels))throw new UserError('vmBotPermission');
  if(action==='close'&&channel.members.size!==0)throw new UserError('vmNotEmpty');
  const latest=c.voiceMaster.owned(i.guildId,i.user.id);if(latest?.id!==row.id||latest.status!=='active')throw new UserError('vmNotActive');
  const caseId=c.cases.begin({guildId:i.guildId,targetId:channel.id,actorId:i.user.id,action:`voicemaster_${action}`,reason:'Owner requested private voice channel change',interactionId:i.id});
  if(action==='close')c.voiceMaster.status(row.id,'deleting');
  try{if(action==='rename')await channel.setName(name.trim(),'Luna owner voice rename');else if(action==='limit')await channel.setUserLimit(limit,'Luna owner voice limit');else await channel.delete('Luna owner closed empty private voice channel');}
  catch{if(action==='close')c.voiceMaster.status(row.id,'uncertain');c.cases.finish(caseId,'uncertain');throw new UserError('vmEditUncertain',{id:caseId});}
  try{if(action==='close')c.voiceMaster.status(row.id,'closed');c.cases.finish(caseId,'completed');}catch{throw new UserError('vmEditUncertain',{id:caseId});}
  return caseId;
 }finally{c.voiceMaster.active.delete(key);}
}
