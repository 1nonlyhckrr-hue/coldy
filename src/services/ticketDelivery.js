import { ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,MessageFlags,AttachmentBuilder } from 'discord.js';
import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { UserError } from '../utils/errors.js';
import { validateOutputChannel } from './guildConfig.js';
import { validateTicketConfig,ticketOverwrites,requireTicketAccess,verifyTicketPrivacy } from './tickets.js';
import { collectTicketTranscript } from './ticketTranscripts.js';
export async function openTicket(i,c){
 const config=c.tickets.config(i.guildId);if(!config)throw new UserError('ticketSetupRequired');
 const member=await i.guild.members.fetch({user:i.user.id,force:true});if(member.user.bot)throw new UserError('ticketBotOwner');
 const {bot}=await validateTicketConfig(i.guild,config.category_id,config.support_role_id);
 const id=c.tickets.reserve(i.guildId,i.user.id,config.support_role_id,i.id);let channel;
 try{channel=await i.guild.channels.create({name:`ticket-${id}`,type:ChannelType.GuildText,parent:config.category_id,topic:`Luna ticket ${id}`,permissionOverwrites:ticketOverwrites(i.guildId,bot.id,i.user.id,config.support_role_id),reason:'Luna private support ticket'});}
 catch{c.tickets.uncertain(id);throw new UserError('ticketCreateUncertain',{id});}
 try{const record={...c.tickets.get(id,i.guildId),channel_id:channel.id};await verifyTicketPrivacy(channel,record,bot.id);c.tickets.activate(id,channel.id);}catch{c.tickets.uncertain(id);throw new UserError('ticketPrivacyUncertain',{id});}
 return {id,channelId:channel.id};
}
export async function publishTicketPanel(i,c,channelId){
 if(!c.tickets.config(i.guildId))throw new UserError('ticketSetupRequired');const channel=await validateOutputChannel(i.guild,channelId),locale=c.guildConfig.get(i.guildId).language;
 const id=c.tickets.reservePanel(i.guildId,channelId,i.id),button=new ButtonBuilder().setCustomId(`luna:ticket:${id}`).setLabel(translate(locale,'ticketOpenButton')).setStyle(ButtonStyle.Primary);
 try{const message=await channel.send(lunaPayload({content:translate(locale,'ticketPanelPrompt'),components:[new ActionRowBuilder().addComponents(button)],allowedMentions:{parse:[]}},{locale}));c.tickets.panelSent(id,message.id);}catch{c.tickets.panelUncertain(id);throw new UserError('ticketPanelUncertain',{id});}return id;
}
export async function changeTicketState(i,c,close){
 const ticket=c.tickets.byChannel(i.channelId,i.guildId);await requireTicketAccess(i,ticket,{staff:!close});
 if(ticket.status!==(close?'open':'closed'))throw new UserError('ticketStateInvalid');
 const channel=await i.guild.channels.fetch(ticket.channel_id),bot=await i.guild.members.fetchMe({force:true});await verifyTicketPrivacy(channel,ticket,bot.id);
 if(close){const transcript=await collectTicketTranscript(channel);c.tickets.saveTranscript(ticket.id,transcript);}
 // Reserve before overwrites; a timeout or storage fault blocks automatic repeats.
 c.tickets.transition(ticket.id,ticket.status,close?'closing':'reopening');
 try{await channel.permissionOverwrites.set(ticketOverwrites(i.guildId,bot.id,ticket.owner_id,ticket.support_role_id,close),'Luna ticket access change');await verifyTicketPrivacy(channel,{...ticket,status:close?'closed':'open'},bot.id);c.tickets.transition(ticket.id,close?'closing':'reopening',close?'closed':'open');}
 catch{c.tickets.uncertain(ticket.id);throw new UserError('ticketStateUncertain',{id:ticket.id});}return ticket.id;
}
export async function exportTicketTranscript(i,c){
 const ticket=c.tickets.byChannel(i.channelId,i.guildId);await requireTicketAccess(i,ticket);
 const channel=await i.guild.channels.fetch(ticket.channel_id),bot=await i.guild.members.fetchMe({force:true});await verifyTicketPrivacy(channel,ticket,bot.id);
 let transcript;if(ticket.status==='closed'){transcript=c.tickets.transcript(ticket.id);if(!transcript)throw new UserError('ticketTranscriptMissing');}else{transcript=await collectTicketTranscript(channel);c.tickets.saveTranscript(ticket.id,transcript);}
 return {file:new AttachmentBuilder(Buffer.from(transcript.body,'utf8'),{name:`luna-ticket-${ticket.id}.txt`}),count:transcript.count??transcript.message_count,truncated:!!transcript.truncated};
}
export function createTicketButtonHandler(c){return async i=>{
 if(!i.isButton()||!i.customId.startsWith('luna:ticket:'))return false;
 try{if(!i.inGuild())throw new UserError('guildOnly');await i.deferReply({flags:MessageFlags.Ephemeral});const raw=i.customId.slice(12);if(!/^\d+$/.test(raw))throw new UserError('ticketPanelInvalid');const p=c.tickets.panel(Number(raw),i.guildId);if(!p||p.status!=='active'||p.message_id!==i.message.id||p.channel_id!==i.channelId)throw new UserError('ticketPanelInvalid');const r=await openTicket(i,c),locale=c.guildConfig.get(i.guildId).language;await i.editReply(lunaPayload({content:translate(locale,'ticketOpened',{id:r.id,channel:`<#${r.channelId}>`}),allowedMentions:{parse:[]}},{locale}));}catch(e){await c.handleInteractionError(e,i,c.logger);}return true;
};}
