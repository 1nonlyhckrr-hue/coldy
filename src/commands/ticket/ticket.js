import { SlashCommandBuilder,InteractionContextType,PermissionFlagsBits as P,ChannelType,MessageFlags } from 'discord.js';
import { validateTicketConfig,requireTicketAccess } from '../../services/tickets.js';
import { openTicket,publishTicketPanel,changeTicketState,exportTicketTranscript } from '../../services/ticketDelivery.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data=new SlashCommandBuilder().setName('ticket').setDescription('Private support tickets with stored transcripts.').setContexts(InteractionContextType.Guild)
 .addSubcommand(s=>s.setName('setup').setDescription('Set the category and role that can view new tickets.').addChannelOption(o=>o.setName('category').setDescription('Ticket category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)).addRoleOption(o=>o.setName('support-role').setDescription('This role will see new ticket contents').setRequired(true)))
 .addSubcommand(s=>s.setName('panel').setDescription('Publish a ticket-open button.').addChannelOption(o=>o.setName('channel').setDescription('Panel destination').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)))
 .addSubcommand(s=>s.setName('open').setDescription('Open one private support ticket.'))
 .addSubcommand(s=>s.setName('claim').setDescription('Assign the current open ticket to yourself.'))
 .addSubcommand(s=>s.setName('close').setDescription('Store transcript and make the owner read-only.'))
 .addSubcommand(s=>s.setName('reopen').setDescription('Restore the ticket owner write access.'))
 .addSubcommand(s=>s.setName('transcript').setDescription('Export current ticket history privately.'))
 .addSubcommand(s=>s.setName('config').setDescription('Show ticket configuration to server managers.'));
export default {category:'ticket',data,async execute(i,c){
 await i.deferReply({flags:MessageFlags.Ephemeral});const sub=i.options.getSubcommand(),locale=c.guildConfig.get(i.guildId).language,t=(key,p)=>translate(locale,key,p);let content,files;
 if(['setup','panel','config'].includes(sub)){const actor=await i.guild.members.fetch({user:i.user.id,force:true});if(!actor.permissions.has(P.ManageGuild))throw new UserError('userPermission');}
 if(sub==='setup'){const categoryId=i.options.getChannel('category',true).id,roleId=i.options.getRole('support-role',true).id;await validateTicketConfig(i.guild,categoryId,roleId);c.tickets.configure(i.guildId,categoryId,roleId);content=t('ticketSetupSaved');}
 if(sub==='panel'){const id=await publishTicketPanel(i,c,i.options.getChannel('channel',true).id);content=t('ticketPanelSent',{id});}
 if(sub==='open'){const r=await openTicket(i,c);content=t('ticketOpened',{id:r.id,channel:`<#${r.channelId}>`});}
 if(sub==='claim'){const ticket=c.tickets.byChannel(i.channelId,i.guildId);await requireTicketAccess(i,ticket,{staff:true});c.tickets.claim(ticket.id,i.user.id);content=t('ticketClaimed',{id:ticket.id});}
 if(['close','reopen'].includes(sub)){const id=await changeTicketState(i,c,sub==='close');content=t(sub==='close'?'ticketClosed':'ticketReopened',{id});}
 if(sub==='transcript'){const result=await exportTicketTranscript(i,c);files=[result.file];content=t('ticketTranscriptExport',{count:result.count,status:t(result.truncated?'ticketPartial':'ticketComplete')});}
 if(sub==='config'){const s=c.tickets.config(i.guildId);content=s?t('ticketConfig',{category:s.category_id,role:s.support_role_id}):t('ticketSetupRequired');}
 await i.editReply(lunaPayload({content,...(files?{files}:{}),allowedMentions:{parse:[]}},{locale}));
}};
