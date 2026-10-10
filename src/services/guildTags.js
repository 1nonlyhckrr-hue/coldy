import {validateSelfRole} from './rolePanels.js';import{UserError}from'../utils/errors.js';import{PermissionFlagsBits as P}from'discord.js';
export function guildTagState(user,guildId){const identity=user.primaryGuild;if(!identity||identity.identityEnabled===null||identity.identityGuildId===null)return'unknown';if(typeof identity.identityEnabled!=='boolean')return'unknown';return identity.identityEnabled&&identity.identityGuildId===guildId?'matching':'notMatching';}
export class GuildTags{
 constructor(db){this.db=db;this.active=new Set();}
 config(guildId){return this.db.prepare('SELECT role_id FROM guild_tag_config WHERE guild_id=?').get(guildId);}
 grant(guildId,userId){return this.db.prepare('SELECT role_id,status FROM guild_tag_grants WHERE guild_id=? AND user_id=?').get(guildId,userId);}
 setup(guildId,roleId){if(!/^\d{17,20}$/.test(roleId))throw new UserError('customRoleInvalid');const current=this.config(guildId);if(current&&current.role_id!==roleId)throw new UserError('tagRoleChangeBlocked');this.db.prepare('INSERT INTO guild_tag_config VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET updated_at=excluded.updated_at').run(guildId,roleId,Date.now());}
 reset(guildId){this.db.prepare('DELETE FROM guild_tag_config WHERE guild_id=?').run(guildId);}
 reserve(guildId,userId,roleId){const grant=this.grant(guildId,userId);if(grant?.status==='uncertain'||grant?.status==='pending')throw new UserError('tagUncertain');if(grant&&grant.role_id!==roleId)throw new UserError('tagOldRole');this.db.prepare("INSERT INTO guild_tag_grants VALUES(?,?,?,'pending') ON CONFLICT(guild_id,user_id) DO UPDATE SET status='pending'").run(guildId,userId,roleId);}
 finish(guildId,userId,status){if(!['granted','uncertain'].includes(status))throw new TypeError('Invalid tag state');this.db.prepare('UPDATE guild_tag_grants SET status=? WHERE guild_id=? AND user_id=?').run(status,guildId,userId);}
 remove(guildId,userId){this.db.prepare('DELETE FROM guild_tag_grants WHERE guild_id=? AND user_id=?').run(guildId,userId);}
 recover(){this.db.prepare("UPDATE guild_tag_grants SET status='uncertain' WHERE status='pending'").run();}
}
export async function refreshGuildTag(i,c){
 const key=`${i.guildId}:${i.user.id}`;if(c.guildTags.active.has(key))throw new UserError('roleActionBusy');c.guildTags.active.add(key);
 try{
  const cfg=c.guildTags.config(i.guildId);if(!cfg)throw new UserError('tagNotConfigured');
  const [member,bot,user,role]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.client.users.fetch(i.user.id,{force:true}),i.guild.roles.fetch(cfg.role_id)]);
  if(!member||member.id!==i.user.id||user.id!==i.user.id)throw new UserError('customMemberMissing');
  const state=guildTagState(user,i.guildId);if(state==='unknown')throw new UserError('tagUnavailable');
  validateSelfRole(role,bot,{id:i.guild.ownerId},i.guild);if(!i.appPermissions?.has(P.ManageRoles))throw new UserError('roleBotPermission');
  const grant=c.guildTags.grant(i.guildId,i.user.id);if(grant&&grant.role_id!==role.id)throw new UserError('tagOldRole');if(grant&&grant.status!=='granted')throw new UserError('tagUncertain');
  const has=member.roles.cache.has(role.id),claim=state==='matching';
  if(claim&&has)return'already';
  if(!claim&&!grant)return'notMatching'; // Never remove independently assigned roles.
  if(!claim&&!has){c.guildTags.remove(i.guildId,i.user.id);return'notMatching';}
  if(c.guildTags.config(i.guildId)?.role_id!==role.id)throw new UserError('customConfigChanged');
  const caseId=c.cases.begin({guildId:i.guildId,targetId:member.id,actorId:member.id,action:claim?'guildtag_claim':'guildtag_release',reason:'Verified primary guild identity',interactionId:i.id});
  c.guildTags.reserve(i.guildId,i.user.id,role.id);
  try{if(claim)await member.roles.add(role,'Luna verified server tag reward');else await member.roles.remove(role,'Luna server tag reward removed');}
  catch{c.guildTags.finish(i.guildId,i.user.id,'uncertain');c.cases.finish(caseId,'uncertain');throw new UserError('tagUncertain');}
  try{if(claim)c.guildTags.finish(i.guildId,i.user.id,'granted');else c.guildTags.remove(i.guildId,i.user.id);c.cases.finish(caseId,'completed');}catch{throw new UserError('tagUncertain');}
  return claim?'claimed':'released';
 }finally{c.guildTags.active.delete(key);}
}
