import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {category:'utility', data:new SlashCommandBuilder().setName('serverinfo').setDescription('Show basic information about this server.').setContexts(InteractionContextType.Guild),
  async execute(i,c) { await i.reply(lunaPayload({content:c.localization.t(i.guildId,'serverInfo',{name:i.guild.name,id:i.guild.id,count:i.guild.memberCount}),allowedMentions:{parse:[]},flags:MessageFlags.Ephemeral},{locale:c.localization.locale(i.guildId)})); }};
