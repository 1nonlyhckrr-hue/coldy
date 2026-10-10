import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P, ChannelType, MessageFlags } from 'discord.js';
import { validateOutputChannel, renderTemplate } from '../../services/guildConfig.js';
import { UserError } from '../../utils/errors.js';
const data=new SlashCommandBuilder().setName('welcome').setDescription('Configure welcome and goodbye messages.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageGuild)
 .addSubcommand(s=>s.setName('channel').setDescription('Choose the destination.').addChannelOption(o=>o.setName('channel').setDescription('Destination').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)))
 .addSubcommand(s=>s.setName('message').setDescription('Set welcome template.').addStringOption(o=>o.setName('text').setDescription('Supports {user}, {username}, {server}, {count}').setRequired(true).setMinLength(1).setMaxLength(1800)))
 .addSubcommand(s=>s.setName('goodbye').setDescription('Set goodbye template and enable or disable it.').addBooleanOption(o=>o.setName('enabled').setDescription('Enabled').setRequired(true)).addStringOption(o=>o.setName('text').setDescription('Goodbye template').setMinLength(1).setMaxLength(1800)))
 .addSubcommand(s=>s.setName('enable').setDescription('Enable welcome messages.'))
 .addSubcommand(s=>s.setName('disable').setDescription('Disable welcome messages.'))
 .addSubcommand(s=>s.setName('config').setDescription('Show current settings.'))
 .addSubcommand(s=>s.setName('test').setDescription('Send one welcome message for yourself.'));
export default {category:'welcomer',data,userPermissions:[P.ManageGuild],async execute(i,c){
 await i.deferReply({flags:MessageFlags.Ephemeral});const sub=i.options.getSubcommand();let text;
 if(sub==='channel'){const id=i.options.getChannel('channel',true).id;await validateOutputChannel(i.guild,id);c.guildConfig.patch(i.guildId,'welcome',{channelId:id});text='Welcome destination saved.';}
 if(sub==='message'){c.guildConfig.patch(i.guildId,'welcome',{message:i.options.getString('text',true)});text='Welcome template saved.';}
 if(sub==='goodbye'){
  const enabled=i.options.getBoolean('enabled',true);const template=i.options.getString('text');
  if(enabled&&!c.config.memberEventsEnabled)throw new UserError('Member events are disabled in the runtime. Ask the operator to enable ENABLE_MEMBER_EVENTS after granting the Members intent.');
  const s=c.guildConfig.get(i.guildId).welcome;if(enabled){if(!s.channelId)throw new UserError('Set a welcome channel first.');await validateOutputChannel(i.guild,s.channelId);}
  c.guildConfig.patch(i.guildId,'welcome',{goodbyeEnabled:enabled,...(template?{goodbyeMessage:template}:{})});text='Goodbye settings saved.';
 }
 if(sub==='enable'){if(!c.config.memberEventsEnabled)throw new UserError('Member events are disabled in the runtime. Set ENABLE_MEMBER_EVENTS after granting the Members intent.');const s=c.guildConfig.get(i.guildId).welcome;if(!s.channelId)throw new UserError('Set a welcome channel first.');await validateOutputChannel(i.guild,s.channelId);c.guildConfig.patch(i.guildId,'welcome',{enabled:true});text='Welcome messages enabled.';}
 if(sub==='disable'){c.guildConfig.patch(i.guildId,'welcome',{enabled:false});text='Welcome messages disabled.';}
 if(sub==='config'){const s=c.guildConfig.get(i.guildId).welcome;text=`Welcome: ${s.enabled}; goodbye: ${s.goodbyeEnabled}; channel ID: ${s.channelId??'not set'}; runtime member events: ${c.config.memberEventsEnabled}.`;}
 if(sub==='test'){const s=c.guildConfig.get(i.guildId).welcome;if(!s.channelId)throw new UserError('Set a welcome channel first.');const channel=await validateOutputChannel(i.guild,s.channelId);const member=await i.guild.members.fetch({user:i.user.id,force:true});await channel.send(lunaPayload({content:renderTemplate(s.message,member),allowedMentions:{parse:[],users:[i.user.id]}}));text='Welcome test sent for you.';}
 await i.editReply(lunaPayload({content:text,allowedMentions:{parse:[]}}));
}};
