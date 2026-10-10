import {SlashCommandBuilder,InteractionContextType,PermissionFlagsBits as P,MessageFlags} from 'discord.js';
import {translate} from '../../services/localization.js';
import {lunaPayload} from '../../utils/embeds.js';
import {UserError} from '../../utils/errors.js';
const ruleNames=['words','invites','links','mentions','caps','spam'];
const data=new SlashCommandBuilder().setName('automod').setDescription('Configure server-owned message moderation rules.').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(P.ManageGuild)
 .addSubcommand(s=>s.setName('enable').setDescription('Enable configured rules; all rules start disabled.').addStringOption(o=>o.setName('action').setDescription('Warning record or message deletion').addChoices({name:'Record warning',value:'warn'},{name:'Delete message',value:'delete'}).setRequired(true)))
 .addSubcommand(s=>s.setName('disable').setDescription('Stop automatic message moderation.'))
 .addSubcommand(s=>s.setName('rule').setDescription('Enable or disable one rule.').addStringOption(o=>o.setName('name').setDescription('Rule').addChoices(...ruleNames.map(value=>({name:value,value}))).setRequired(true)).addBooleanOption(o=>o.setName('enabled').setDescription('Enabled').setRequired(true)))
 .addSubcommand(s=>s.setName('wordadd').setDescription('Add a literal word/phrase to the filter.').addStringOption(o=>o.setName('text').setDescription('Literal phrase, no regex').setMinLength(1).setMaxLength(50).setRequired(true)))
 .addSubcommand(s=>s.setName('wordremove').setDescription('Remove a literal filtered word/phrase.').addStringOption(o=>o.setName('text').setDescription('Literal phrase').setMinLength(1).setMaxLength(50).setRequired(true)))
 .addSubcommand(s=>s.setName('exempt').setDescription('Add or remove an exempt server role.').addRoleOption(o=>o.setName('role').setDescription('Staff exemption').setRequired(true)).addBooleanOption(o=>o.setName('enabled').setDescription('Exemption enabled').setRequired(true)))
 .addSubcommand(s=>s.setName('config').setDescription('Show configured rules and limits.'))
 .addSubcommand(s=>s.setName('incidents').setDescription('Show 20 recent action outcomes, no message content.'));
export default {category:'automod',data,userPermissions:[P.ManageGuild],async execute(i,c){await i.deferReply({flags:MessageFlags.Ephemeral});const actor=await i.guild.members.fetch({user:i.user.id,force:true});if(!actor.permissions.has(P.ManageGuild))throw new UserError('userPermission');const sub=i.options.getSubcommand(),locale=c.guildConfig.get(i.guildId).language,t=(k,p)=>translate(locale,k,p);let content;
 if(sub==='enable'){if(!c.config.messageEventsEnabled)throw new UserError('responderRuntimeDisabled');const action=i.options.getString('action',true);if(action==='delete'){const bot=await i.guild.members.fetchMe({force:true});if(!bot.permissions.has(P.ManageMessages))throw new UserError('automodDeletePermission');}c.automod.patch(i.guildId,{enabled:true,action});content=t('automodEnabled');}
 if(sub==='disable'){c.automod.patch(i.guildId,{enabled:false});content=t('automodDisabled');}
 if(sub==='rule'){const name=i.options.getString('name',true);if(!ruleNames.includes(name))throw new UserError('automodRuleInvalid');c.automod.patch(i.guildId,{rules:{[name]:i.options.getBoolean('enabled',true)}});content=t('automodSaved');}
 if(['wordadd','wordremove'].includes(sub)){c.automod.word(i.guildId,i.options.getString('text',true),sub==='wordadd');content=t('automodSaved');}
 if(sub==='exempt'){const role=await i.guild.roles.fetch(i.options.getRole('role',true).id);if(!role||role.guild.id!==i.guildId||role.id===i.guildId)throw new UserError('automodRoleInvalid');c.automod.exempt(i.guildId,role.id,i.options.getBoolean('enabled',true));content=t('automodSaved');}
 if(sub==='config'){const s=c.automod.get(i.guildId);content=t('automodConfig',{status:t(s.enabled?'enabled':'disabled'),action:s.action,rules:Object.entries(s.rules).filter(([,v])=>v).map(([k])=>k).join(', ')||'-',words:s.words.length,roles:s.exemptRoles.length});}
 if(sub==='incidents'){const rows=c.automod.incidents(i.guildId);content=t('automodIncidents')+'\n'+(rows.map(r=>`${r.message_id} | ${r.rule} | ${r.action} | ${r.status}`).join('\n')||t('automodEmpty'));}
 await i.editReply(lunaPayload({content,allowedMentions:{parse:[]}},{locale}));}};
