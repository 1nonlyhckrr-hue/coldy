import 'dotenv/config';
import { RolePanels, createRoleButtonHandler } from './services/rolePanels.js';
import { handleInteractionError } from './utils/errors.js';
import { Localization } from './services/localization.js';
import { GuildConfig } from './services/guildConfig.js';
import { ServerLogs } from './services/logging.js';
import { createMemberMessageHandler } from './events/memberMessages.js';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { openDatabase, GuildSettings } from './database/index.js';
import { loadCommands } from './services/registry.js';
import { ModerationCases } from './services/moderation.js';
import { Cooldowns } from './services/cooldowns.js';
import { createInteractionHandler } from './events/interactionCreate.js';
const config = loadConfig();
const logger = createLogger(config.logLevel);
const db = openDatabase(config.databasePath);
const client = new Client({intents:[GatewayIntentBits.Guilds,...(config.memberEventsEnabled?[GatewayIntentBits.GuildMembers]:[])], allowedMentions:{parse:[],repliedUser:false}});
const commands = await loadCommands();
const context = {config,logger,db,settings:new GuildSettings(db),commands,cooldowns:new Cooldowns(),cases:new ModerationCases(db),version:'0.1.0'};
context.rolePanels = new RolePanels(db);
context.handleInteractionError = (error,i,logger)=>handleInteractionError(error,i,logger,context.localization);
const roleButtonHandler = createRoleButtonHandler(context);
client.on(Events.InteractionCreate,roleButtonHandler);
context.guildConfig = new GuildConfig(context.settings);
context.localization = new Localization(context.guildConfig);
context.serverLogs = new ServerLogs(context.guildConfig,logger);
if(config.memberEventsEnabled){client.on(Events.GuildMemberAdd,createMemberMessageHandler(context,'welcome'));client.on(Events.GuildMemberRemove,createMemberMessageHandler(context,'goodbye'));}
client.on(Events.InteractionCreate,createInteractionHandler(context));
client.once(Events.ClientReady, ready => logger.info({botId:ready.user.id,commands:commands.size}, 'Luna ready'));
client.on(Events.Error, e => logger.error({kind:e.name},'Discord client error'));
let stopping = false;
async function stop(code = 0) { if (stopping) return; stopping = true; client.destroy(); db.close(); process.exitCode = code; }
process.once('SIGINT',() => void stop());
process.once('SIGTERM',() => void stop());
process.on('unhandledRejection',() => { logger.fatal('Unhandled rejection; shutting down'); void stop(1); });
process.once('uncaughtException',() => { logger.fatal('Uncaught exception; shutting down'); void stop(1); });
try { await client.login(config.token); } catch { logger.error('Login failed; check Discord credentials and connectivity.'); await stop(1); }
