import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P, ChannelType, MessageFlags } from 'discord.js';
import { createRolePanel } from '../../services/rolePanels.js';
import { UserError } from '../../utils/errors.js';
const data=new SlashCommandBuilder().setName('reactionroles').setDescription('Create and manage button-based self-service role panels.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageRoles)
 .addSubcommand(s=>s.setName('create').setDescription('Publish one role toggle button.').addChannelOption(o=>o.setName('channel').setDescription('Destination').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Safe self-service role').setRequired(true)).addStringOption(o=>o.setName('label').setDescription('Button text').setMinLength(1).setMaxLength(70).setRequired(true)))
 .addSubcommand(s=>s.setName('list').setDescription('List the newest 20 panel records.'))
 .addSubcommand(s=>s.setName('disable').setDescription('Disable a panel in storage; its old button becomes inactive.').addIntegerOption(o=>o.setName('panel-id').setDescription('Panel ID').setMinValue(1).setRequired(true)));
export default {category:'reactionroles',data,userPermissions:[P.ManageRoles],botPermissions:[P.ManageRoles],async execute(i,c){
 await i.deferReply({flags:MessageFlags.Ephemeral});const sub=i.options.getSubcommand();let content;
 if(sub==='create'){const result=await createRolePanel(i,c,{channelId:i.options.getChannel('channel',true).id,roleId:i.options.getRole('role',true).id,label:i.options.getString('label',true)});content=`Role panel #${result.panelId} sent. Message ID: ${result.messageId}.`;}
 if(sub==='list'){const panels=c.rolePanels.list(i.guildId);content=panels.length?panels.map(p=>`#${p.id} | ${p.status} | role ${p.role_id} | channel ${p.channel_id}`).join('\n').slice(0,1900):'No role panels.';}
 if(sub==='disable'){const id=i.options.getInteger('panel-id',true);if(!c.rolePanels.get(id,i.guildId))throw new UserError('Panel not found in this server.');c.rolePanels.status(id,'disabled');content=`Panel #${id} disabled. Its existing button will refuse role changes.`;}
 await i.editReply(lunaPayload({content,allowedMentions:{parse:[]}}));
}};
