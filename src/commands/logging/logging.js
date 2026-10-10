import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P, ChannelType, MessageFlags } from 'discord.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { UserError } from '../../utils/errors.js';
const data=new SlashCommandBuilder().setName('logging').setDescription('Configure Luna moderation case log delivery.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageGuild)
 .addSubcommand(s=>s.setName('channel').setDescription('Choose the server log channel.').addChannelOption(o=>o.setName('channel').setDescription('Log destination').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)))
 .addSubcommand(s=>s.setName('enable').setDescription('Enable case logs after configuring a channel.'))
 .addSubcommand(s=>s.setName('disable').setDescription('Disable delivery without deleting config.'))
 .addSubcommand(s=>s.setName('config').setDescription('Show case-log settings.'))
 .addSubcommand(s=>s.setName('test').setDescription('Send one test log to the configured channel.'));
export default {category:'logging',data,userPermissions:[P.ManageGuild],async execute(i,c){
 await i.deferReply({flags:MessageFlags.Ephemeral});
 const sub=i.options.getSubcommand();let text;
 if(sub==='channel'){const id=i.options.getChannel('channel',true).id;await validateOutputChannel(i.guild,id);c.guildConfig.patch(i.guildId,'logging',{channelId:id});text='Log channel saved. Delivery remains unchanged; use enable when ready.';}
 if(sub==='enable'){const s=c.guildConfig.get(i.guildId).logging;if(!s.channelId)throw new UserError('Set a log channel first.');await validateOutputChannel(i.guild,s.channelId);c.guildConfig.patch(i.guildId,'logging',{enabled:true});text='Case logs enabled.';}
 if(sub==='disable'){c.guildConfig.patch(i.guildId,'logging',{enabled:false});text='Case logs disabled.';}
 if(sub==='config'){const s=c.guildConfig.get(i.guildId).logging;text=`Enabled: ${s.enabled}. Channel ID: ${s.channelId??'not set'}. Case/action IDs only; reasons and message contents are not copied to logs.`;}
 if(sub==='test'){const result=await c.serverLogs.emit(i.guild,{kind:'test',actorId:i.user.id});text=result.sent?'Test log sent.':'Test log was not sent; check logging enabled, channel and bot permissions.';}
 await i.editReply(lunaPayload({content:text,allowedMentions:{parse:[]}}));
}};
