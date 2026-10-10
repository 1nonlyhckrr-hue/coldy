import { lunaPayload } from '../../utils/embeds.js';
import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
export default {category:'general',data:new SlashCommandBuilder().setName('help').setDescription('Show installed commands with pagination.').setContexts(InteractionContextType.Guild).addIntegerOption(o=>o.setName('page').setDescription('Page number').setMinValue(1)),async execute(i,c){
 const lines=[...c.commands.values()].flatMap(command=>{const subs=(command.data.toJSON().options??[]).filter(o=>o.type===1);return subs.length?subs.map(s=>`/${command.data.name} ${s.name}: ${s.description}`):[`/${command.data.name}: ${command.data.description}`];});
 const pages=Math.max(1,Math.ceil(lines.length/12));const page=Math.min(i.options?.getInteger?.('page')??1,pages);
 await i.reply(lunaPayload({content:`Luna ${c.version} | page ${page}/${pages}\n${lines.slice((page-1)*12,page*12).join('\n').slice(0,1750)}\nOnly installed commands are listed. Use /help page:<number>.`,flags:MessageFlags.Ephemeral}));
}};
