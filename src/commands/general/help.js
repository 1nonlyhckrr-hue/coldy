import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {category:'general',data:new SlashCommandBuilder().setName('help').setDescription('Show installed commands with pagination.').setContexts(InteractionContextType.Guild).addIntegerOption(o=>o.setName('page').setDescription('Page number').setMinValue(1)),async execute(i,c){
 const locale=c.localization?.locale(i.guildId)??'en',t=(key,params)=>translate(locale,key,params);
 const lines=[...c.commands.values()].flatMap(command=>{const subs=(command.data.toJSON().options??[]).filter(o=>o.type===1);return subs.length?subs.map(s=>`/${command.data.name} ${s.name}: ${s.description}`):[`/${command.data.name}: ${command.data.description}`];});
 const pages=Math.max(1,Math.ceil(lines.length/12));const page=Math.min(i.options?.getInteger?.('page')??1,pages);
 await i.reply(lunaPayload({content:`${t('helpHeader',{version:c.version,page,pages})}\n${lines.slice((page-1)*12,page*12).join('\n').slice(0,1750)}\n${t('helpFooter')}`,flags:MessageFlags.Ephemeral},{locale}));
}};
