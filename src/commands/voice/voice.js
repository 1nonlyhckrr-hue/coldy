import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P, MessageFlags, ChannelType } from 'discord.js';
import { VOICE_PERMISSIONS,voiceAction } from '../../services/voice.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data=new SlashCommandBuilder().setName('voice').setDescription('Single-member voice moderation with case tracking.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.MuteMembers|P.DeafenMembers|P.MoveMembers);
for(const action of Object.keys(VOICE_PERMISSIONS))data.addSubcommand(s=>{
  s.setName(action).setDescription(`${action}: one current voice member.`).addUserOption(o=>o.setName('member').setDescription('Target server member').setRequired(true));
  if(action==='move')s.addChannelOption(o=>o.setName('channel').setDescription('Destination voice channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true));
  return s.addStringOption(o=>o.setName('reason').setDescription('Reason recorded in the case').setMaxLength(400));
});
export default {category:'voice',data,cooldownMs:5000,async execute(i,c){
  await i.deferReply({flags:MessageFlags.Ephemeral});const action=i.options.getSubcommand();
  const targetId=i.options.getUser('member',true).id;
  const {id}=await voiceAction(i,c,{action,targetId,channelId:action==='move'?i.options.getChannel('channel',true).id:undefined,reason:i.options.getString('reason')});
  const locale=c.localization?.locale(i.guildId)??'en';
  let logUnavailable=false;if(c.serverLogs){const result=await c.serverLogs.emit(i.guild,{kind:'moderation',action:`voice_${action}`,caseId:id,actorId:i.user.id,targetId});logUnavailable=result.reason==='unavailable';}
  const content=translate(locale,'voiceComplete',{action:translate(locale,`voiceAction_${action}`),id})+(logUnavailable?' '+translate(locale,'modLogUnavailable'):'');
  await i.editReply(lunaPayload({content,allowedMentions:{parse:[]}},{locale}));
}};
