import{SlashCommandBuilder,InteractionContextType,ChannelType,PermissionFlagsBits as P,MessageFlags}from'discord.js';import{openPrivateVoice,editPrivateVoice}from'../../services/voiceMaster.js';import{UserError}from'../../utils/errors.js';import{lunaPayload}from'../../utils/embeds.js';
const data=new SlashCommandBuilder().setName('voicemaster').setDescription('Owner-only private temporary voice channels; explicit creation.').setContexts(InteractionContextType.Guild)
.addSubcommand(s=>s.setName('setup').setDescription('Manage Channels: set private voice creation category.').addChannelOption(o=>o.setName('category').setDescription('Server category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
.addSubcommand(s=>s.setName('config').setDescription('Show configured private channel category and limits.'))
.addSubcommand(s=>s.setName('open').setDescription('Create your own private standard voice channel.'))
.addSubcommand(s=>s.setName('rename').setDescription('Rename your own tracked private channel.').addStringOption(o=>o.setName('name').setDescription('Channel name').setMinLength(1).setMaxLength(80).setRequired(true)))
.addSubcommand(s=>s.setName('limit').setDescription('Set your channel capacity; access stays private.').addIntegerOption(o=>o.setName('count').setDescription('1-99 members').setMinValue(1).setMaxValue(99).setRequired(true)))
.addSubcommand(s=>s.setName('close').setDescription('Delete only your tracked empty private channel.'));
export default{category:'voicemaster',data,cooldownMs:10000,async execute(i,c){
 await i.deferReply({flags:MessageFlags.Ephemeral});const sub=i.options.getSubcommand(),locale=c.localization.locale(i.guildId),t=(k,p)=>c.localization.t(i.guildId,k,p);let text;
 if(sub==='setup'){
  const[actor,bot,category]=await Promise.all([i.guild.members.fetch({user:i.user.id,force:true}),i.guild.members.fetchMe({force:true}),i.guild.channels.fetch(i.options.getChannel('category',true).id)]);
  if(!actor.permissions.has(P.ManageChannels))throw new UserError('userPermission');if(!category||category.guildId!==i.guildId||category.type!==ChannelType.GuildCategory)throw new UserError('vmCategoryInvalid');if(!category.permissionsFor(bot)?.has([P.ViewChannel,P.ManageChannels,P.Connect]))throw new UserError('vmBotPermission');c.voiceMaster.setup(i.guildId,category.id);text=t('vmSetup');
 }else if(sub==='config'){text=t('vmConfig',{category:c.voiceMaster.config(i.guildId)?.category_id??'-'});}
 else if(sub==='open'){const r=await openPrivateVoice(i,c);text=t('vmOpened',{id:r.id,channel:r.channelId});}
 else if(['rename','limit','close'].includes(sub)){const id=await editPrivateVoice(i,c,{action:sub,name:sub==='rename'?i.options.getString('name',true):undefined,limit:sub==='limit'?i.options.getInteger('count',true):undefined});text=t('vmEdited',{id});}
 else throw new UserError('unknownCommand');
 await i.editReply(lunaPayload({content:text,allowedMentions:{parse:[]}},{locale}));
}};
