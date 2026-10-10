import { ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,PermissionFlagsBits as P } from 'discord.js';
import { lunaPayload } from '../utils/embeds.js';
import { translate } from './localization.js';
import { validateOutputChannel } from './guildConfig.js';
import { UserError } from '../utils/errors.js';
export function giveawayPayload(record,locale='en'){
 const ended=['ending','ended'].includes(record.status),winners=JSON.parse(record.winners_json);
 const content=ended?translate(locale,'giveawayResult',{id:record.id,prize:record.prize,winners:winners.map(id=>`<@${id}>`).join(', ')||translate(locale,'giveawayNoWinners'),draw:record.draw_version}):translate(locale,'giveawayAnnouncement',{id:record.id,prize:record.prize,count:record.winner_count,end:`<t:${Math.floor(record.ends_at/1000)}:R>`,role:record.required_role_id?`<@&${record.required_role_id}>`:translate(locale,'giveawayEveryone')});
 const button=new ButtonBuilder().setCustomId(`luna:giveaway:${record.id}`).setLabel(translate(locale,'giveawayJoinButton')).setStyle(ButtonStyle.Primary).setDisabled(ended);
 return lunaPayload({content,components:[new ActionRowBuilder().addComponents(button)],allowedMentions:{parse:[]}},{locale});
}
export async function createGiveaway(i,c,input){
 const actor=await i.guild.members.fetch({user:i.user.id,force:true});if(!actor.permissions.has(P.ManageGuild))throw new UserError('userPermission');
 const channel=await validateOutputChannel(i.guild,input.channelId);
 if(input.requiredRoleId){const role=await i.guild.roles.fetch(input.requiredRoleId);if(!role||role.guild.id!==i.guildId||role.id===i.guildId)throw new UserError('giveawayRoleInvalid');}
 const id=c.giveaways.reserve({...input,guildId:i.guildId,interactionId:i.id});const record=c.giveaways.get(id,i.guildId),locale=c.guildConfig.get(i.guildId).language;
 let message;try{message=await channel.send(giveawayPayload(record,locale));}catch{c.giveaways.uncertain(id);throw new UserError('giveawaySendUncertain',{id});}
 try{c.giveaways.activate(id,message.id);}catch{throw new UserError('giveawayStorageUncertain',{id});}return id;
}
export class GiveawayRunner {
 constructor(context,client){this.context=context;this.client=client;this.busy=new Set();this.tickBusy=false;this.timer=null;}
 async finish(id,guildId,{reroll=false}={}){
  const key=`${guildId}:${id}`;if(this.busy.has(key))throw new UserError('giveawayBusy');this.busy.add(key);
  try{
   const c=this.context;let g=c.giveaways.get(id,guildId);if(!g)throw new UserError('giveawayNotFound');
   if(g.status!=='ending'){
    if((reroll&&g.status!=='ended')||(!reroll&&g.status!=='active'))throw new UserError('giveawayDrawInvalid');
    const guild=await this.client.guilds.fetch(guildId),eligible=[];
    // Fail closed when eligibility cannot be verified. Do not draw from stale caches.
    for(const userId of c.giveaways.entries(id)){
     let member;try{member=await guild.members.fetch({user:userId,force:true});}catch(error){if(error.code===10007)continue;throw new UserError('giveawayEligibilityUnavailable');}
     if(!member.user.bot&&(!g.required_role_id||member.roles.cache.has(g.required_role_id)))eligible.push(userId);
    }
    g=c.giveaways.draw(id,guildId,eligible,{reroll});
   }
   // Winners are already persisted. A failed edit may be safely retried without a new draw.
   const guild=await this.client.guilds.fetch(guildId),channel=await validateOutputChannel(guild,g.channel_id),message=await channel.messages.fetch(g.message_id);
   if(message.author.id!==this.client.user.id)throw new UserError('giveawayMessageInvalid');
   await message.edit(giveawayPayload(g,c.guildConfig.get(guildId).language));
   c.giveaways.endPublished(id,g.draw_version);return g;
  }finally{this.busy.delete(key);}
 }
 async tick(){if(this.tickBusy)return;this.tickBusy=true;try{for(const g of this.context.giveaways.due()){try{await this.finish(g.id,g.guild_id);}catch{this.context.logger.warn({giveawayId:g.id,guildId:g.guild_id},'Giveaway ending unavailable; stored draw is preserved');}}}catch{this.context.logger.warn('Giveaway scheduler storage unavailable');}finally{this.tickBusy=false;}}
 start(){if(this.timer)return;void this.tick();this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
export function createGiveawayButtonHandler(c){return async i=>{
 if(!i.isButton()||!i.customId.startsWith('luna:giveaway:'))return false;
 try{
  if(!i.inGuild())throw new UserError('guildOnly');await i.deferReply({flags:MessageFlags.Ephemeral});
  const raw=i.customId.slice('luna:giveaway:'.length);if(!/^\d+$/.test(raw))throw new UserError('giveawayNotFound');
  const g=c.giveaways.get(Number(raw),i.guildId);if(!g||g.message_id!==i.message.id||g.channel_id!==i.channelId)throw new UserError('giveawayMessageInvalid');
  const remaining=c.cooldowns.acquire(`giveaway:${i.guildId}:${i.user.id}`,3000);if(remaining)throw new UserError('commandCooldown',{seconds:Math.ceil(remaining/1000)});
  const member=await i.guild.members.fetch({user:i.user.id,force:true});if(member.user.bot)throw new UserError('giveawayBotEntry');if(g.required_role_id&&!member.roles.cache.has(g.required_role_id))throw new UserError('giveawayRoleRequired');
  const added=c.giveaways.enter(g.id,i.guildId,i.user.id),locale=c.guildConfig.get(i.guildId).language;
  await i.editReply(lunaPayload({content:translate(locale,added?'giveawayEntered':'giveawayAlreadyEntered'),allowedMentions:{parse:[]}},{locale}));
 }catch(e){await c.handleInteractionError(e,i,c.logger);}return true;
};}
