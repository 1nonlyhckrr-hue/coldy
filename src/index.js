import { join, dirname } from 'node:path';
import { HelpNavigation, createHelpNavigationHandler } from './services/helpNavigation.js';
import { BulkTimeout } from './services/bulkTimeout.js';
import { RankRewards } from './services/rankRewards.js';
import { Jail } from './services/jail.js';
import { EventMode } from './services/eventMode.js';
import { VoiceControls, createVoiceControlHandler } from './services/vmControls.js';
import { VoiceJoin, createVoiceJoinHandler, createVoiceCleanupHandler } from './services/vmJoin.js';
import { VoiceRanks, createVoiceRankHandler, sampleVoiceRanks } from './services/voiceRanks.js';
import { AntiBot, createAntiBotHandler } from './services/antibot.js';
import { AutoReactions, createAutoReactHandler } from './services/autoreact.js';
import { MediaPolicy, createMediaHandler } from './services/mediaPolicy.js';
import { VoiceRoles, createVoiceRoleHandler } from './services/vcrole.js';
import { AutoRoles, createAutoRoleHandler } from './services/autorole.js';
import { MentionGuard, createMentionGuardHandler } from './services/mentionGuard.js';
import { MusicQueues } from './services/musicQueue.js';
import { YouTubeLavalinkAdapter } from './services/musicRuntime.js';
import { VoiceReadiness } from './services/voiceReadiness.js';
import { AfkStates, createAfkHandler } from './services/afk.js';
import { Polls } from './services/polls.js';
import { PurgePlans } from './services/purge.js';
import {
  EventLogDelivery,
  createMetadataLogHandler,
  createRoleUpdateLogHandler,
  createChannelUpdateLogHandler,
} from './services/eventLogs.js';
import { VoiceMaster } from './services/voiceMaster.js';
import { GuildTags } from './services/guildTags.js';
import { SecurityAccess } from './services/securityAccess.js';
import { ServerBackups } from './services/serverBackup.js';
import { JoinRaid, createJoinRaidHandler } from './services/joinRaid.js';
import {
  Verification,
  createVerificationHandler,
  createVerificationJoinHandler,
} from './services/verification.js';
import { BotActivity } from './services/botActivity.js';
import { FeatureStore } from './services/featureStore.js';
import { InviteTracker, createRaidHandlers } from './services/raidTools.js';
import { SnipeCache, createSnipeHandlers } from './services/snipe.js';
import { TempRoles } from './services/tempRole.js';
import { Watch, createWatchHandlers } from './services/watch.js';
import { LogHub, createLogHandlers } from './services/logHub.js';
import { Guard, createGuardHandler, resumeAutoUnlocks } from './services/guard.js';
import { Lockdown } from './services/lockdown.js';
import { AntinukeAlerts, createAntinukeHandler } from './services/antinuke.js';
import { MessageRanks, createMessageRankHandler } from './services/leaderboard.js';
import { CustomRoles } from './services/customRoles.js';
import { CommandRestrictions } from './services/permit.js';
import { LinkSafety } from './services/linkSafety.js';
import { AutoMod, createAutoModHandler } from './services/automod.js';
import { MessageSchedules, AutomationRunner } from './services/automations.js';
import { Tickets } from './services/tickets.js';
import { createTicketButtonHandler } from './services/ticketDelivery.js';
import { Giveaways } from './services/giveaways.js';
import { GiveawayRunner, createGiveawayButtonHandler } from './services/giveawayDelivery.js';
import { Autoresponders } from './services/autoresponder.js';
import { createAutoresponderHandler } from './events/autoresponderMessages.js';
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
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    ...(config.voiceEventsEnabled ? [GatewayIntentBits.GuildVoiceStates] : []),
    ...(config.auditEventsEnabled ? [GatewayIntentBits.GuildModeration] : []),
    ...(config.messageEventsEnabled
      ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
      : []),
    ...(config.memberEventsEnabled
      ? [GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites]
      : []),
  ],
  allowedMentions: { parse: [], repliedUser: false },
});
const commands = await loadCommands();
const context = {
  config,
  logger,
  db,
  settings: new GuildSettings(db),
  commands,
  cooldowns: new Cooldowns(),
  cases: new ModerationCases(db),
  version: '0.1.0',
};
if (config.musicNode) {
  const adapter = YouTubeLavalinkAdapter.create(client, config.musicNode, logger);
  context.music = new MusicQueues(adapter, [], { logger });
  adapter.onEnded = (...args) => context.music.ended(...args);
}
context.eventLogs = new EventLogDelivery(db);
context.eventLogs.recover();
context.eventLogs.cleanup();
context.voiceRanks = new VoiceRanks(db);
context.voiceRanks.cleanup();
if (config.voiceEventsEnabled) {
  client.on(Events.VoiceStateUpdate, createVoiceRankHandler(context));
  const voiceRankTimer = setInterval(
    () => sampleVoiceRanks(context).catch(() => context.logger.warn('Voice sampling unavailable')),
    60000,
  );
  voiceRankTimer.unref();
}
context.voiceRoles = new VoiceRoles(db);
context.voiceRoles.recover();
context.voiceReadiness = new VoiceReadiness();
if (config.voiceEventsEnabled) client.on(Events.VoiceStateUpdate, createVoiceRoleHandler(context));
client.on(Events.ShardDisconnect, (event, id) => {
  logger.warn({ shardId: id, code: event?.code }, 'Shard disconnected; voice effects paused');
  context.voiceReadiness.disconnected(id);
});
client.on(Events.ShardReconnecting, (id) => {
  logger.warn({ shardId: id }, 'Shard reconnecting; voice effects paused');
  context.voiceReadiness.disconnected(id);
});
for (const event of [Events.ShardResume, Events.ShardReady])
  client.on(event, (id) => {
    if (context.voiceReadiness.recovered(id))
      logger.info({ shardId: id, event }, 'Shard recovered; voice effects resumed');
  });
context.bulkTimeout = new BulkTimeout(db);
context.bulkTimeout.recover();
context.jail = new Jail(db);
context.jail.recover();
context.eventMode = new EventMode(db);
context.eventMode.recover();
context.voiceMaster = new VoiceMaster(db);
context.voiceMaster.recover();
context.voiceControls = new VoiceControls(db);
context.voiceControls.recover();
context.voiceControls.cleanup();
client.on(Events.InteractionCreate, createVoiceControlHandler(context));
context.voiceJoin = new VoiceJoin(db);
context.voiceJoin.recover();
if (config.voiceEventsEnabled) client.on(Events.VoiceStateUpdate, createVoiceJoinHandler(context));
if (config.voiceEventsEnabled)
  client.on(Events.VoiceStateUpdate, createVoiceCleanupHandler(context));
context.guildTags = new GuildTags(db);
context.guildTags.recover();
context.antinuke = new AntinukeAlerts(db);
context.antinuke.cleanup();
if (config.auditEventsEnabled)
  client.on(Events.GuildAuditLogEntryCreate, createAntinukeHandler(context));
context.guard = new Guard(db);
context.features = new FeatureStore(db);
if (config.auditEventsEnabled)
  client.on(Events.GuildAuditLogEntryCreate, createGuardHandler(context));
context.lockdown = new Lockdown(db);
context.verification = new Verification(db);
context.botActivity = new BotActivity(db);
context.joinRaid = new JoinRaid(db);
context.serverBackups = new ServerBackups(db);
context.securityAccess = new SecurityAccess(db);
context.rankRewards = new RankRewards(db);
context.rankRewards.recover();
context.messageRanks = new MessageRanks(db);
context.messageRanks.cleanup();
context.autoroles = new AutoRoles(db);
context.autoroles.recover();
context.autoroles.cleanup();
context.customRoles = new CustomRoles(db);
context.customRoles.recoverCreation();
context.commandRestrictions = new CommandRestrictions(db);
context.autoresponders = new Autoresponders(db);
context.autoresponders.recover();
context.autoresponders.cleanup();
context.afk = new AfkStates(db);
context.afk.cleanup();
context.autoReactions = new AutoReactions(db);
context.autoReactions.recover();
context.autoReactions.cleanup();
context.antiBot = new AntiBot(db);
context.antiBot.recover();
context.antiBot.cleanup();
context.mediaPolicy = new MediaPolicy(db);
context.mediaPolicy.recover();
context.mediaPolicy.cleanup();
context.mentionGuard = new MentionGuard(db);
context.mentionGuard.recover();
context.automod = new AutoMod(db);
context.linkSafety = new LinkSafety({
  dir: join(dirname(config.databasePath), 'blocklists'),
  logger,
});
context.automod.linkSafety = context.linkSafety;
context.automod.recover();
context.automod.cleanup();
if (config.messageEventsEnabled) {
  context.linkSafety.start();
  const antibot = createAntiBotHandler(context),
    react = createAutoReactHandler(context),
    media = createMediaHandler(context),
    mentionGuard = createMentionGuardHandler(context),
    autoMod = createAutoModHandler(context),
    respond = createAutoresponderHandler(context),
    rank = createMessageRankHandler(context),
    afk = createAfkHandler(context);
  client.on(Events.MessageCreate, async (message) => {
    if (await antibot(message)) return;
    if (await media(message)) return;
    if (await mentionGuard(message)) return;
    rank(message);
    if (!(await autoMod(message))) {
      await afk(message);
      await respond(message);
      await react(message);
    }
  });
}
context.giveaways = new Giveaways(db);
context.giveaways.recover();
context.giveawayRunner = new GiveawayRunner(context, client);
client.on(Events.InteractionCreate, createGiveawayButtonHandler(context));
context.tickets = new Tickets(db);
context.tickets.recover();
client.on(Events.InteractionCreate, createTicketButtonHandler(context));
context.messageSchedules = new MessageSchedules(db);
context.messageSchedules.recover();
context.automationRunner = new AutomationRunner(context, client);
context.polls = new Polls(db);
context.polls.recover();
context.purgePlans = new PurgePlans(db);
context.purgePlans.recover();
context.rolePanels = new RolePanels(db);
context.rolePanels.recover();
context.handleInteractionError = (error, i, logger) =>
  handleInteractionError(error, i, logger, context.localization);
const roleButtonHandler = createRoleButtonHandler(context);
client.on(Events.InteractionCreate, roleButtonHandler);
client.on(Events.InteractionCreate, createVerificationHandler(context));
context.guildConfig = new GuildConfig(context.settings);
context.localization = new Localization(context.guildConfig);
context.serverLogs = new ServerLogs(context.guildConfig, logger);
if (config.memberEventsEnabled) {
  client.on(Events.GuildMemberAdd, createJoinRaidHandler(context));
  client.on(Events.GuildMemberAdd, createVerificationJoinHandler(context));
  client.on(Events.GuildMemberAdd, createAutoRoleHandler(context));
  client.on(Events.GuildMemberAdd, createMemberMessageHandler(context, 'welcome'));
  client.on(Events.GuildMemberRemove, createMemberMessageHandler(context, 'goodbye'));
}
context.helpNavigation = new HelpNavigation();
client.on(Events.InteractionCreate, createHelpNavigationHandler(context));
client.on(Events.InteractionCreate, createInteractionHandler(context));
for (const [event, kind] of [
  [Events.GuildRoleCreate, 'rolecreate'],
  [Events.GuildRoleDelete, 'roledelete'],
  [Events.ChannelCreate, 'channelcreate'],
  [Events.ChannelDelete, 'channeldelete'],
])
  client.on(event, createMetadataLogHandler(context, kind));
client.on(Events.GuildRoleUpdate, createRoleUpdateLogHandler(context));
client.on(Events.ChannelUpdate, createChannelUpdateLogHandler(context));
if (config.memberEventsEnabled) {
  client.on(Events.GuildMemberAdd, createMetadataLogHandler(context, 'memberjoin'));
  client.on(Events.GuildMemberRemove, createMetadataLogHandler(context, 'memberleave'));
}

context.logHub = new LogHub(context);
{
  const logs = createLogHandlers(context);
  if (config.messageEventsEnabled) {
    client.on(Events.MessageDelete, logs.messageDelete);
    client.on(Events.MessageUpdate, logs.messageUpdate);
  }
  if (config.memberEventsEnabled) {
    client.on(Events.GuildMemberAdd, logs.memberAdd);
    client.on(Events.GuildMemberRemove, logs.memberRemove);
    client.on(Events.GuildMemberUpdate, logs.memberUpdate);
  }
  if (config.voiceEventsEnabled) client.on(Events.VoiceStateUpdate, logs.voice);
  context.invites = new InviteTracker(context);
  const raid = createRaidHandlers(context);
  if (config.memberEventsEnabled) {
    client.on(Events.GuildMemberAdd, raid.join);
    client.on(Events.GuildMemberAdd, (m) => context.invites.join(m).catch(() => {}));
    client.on(Events.GuildMemberRemove, (m) => context.invites.leave(m));
    for (const ev of [Events.InviteCreate, Events.InviteDelete])
      client.on(ev, (inv) => {
        if (inv.guild && context.invites.enabled(inv.guild.id))
          context.invites.snapshot(inv.guild).catch(() => {});
      });
  }
  context.snipe = new SnipeCache();
  if (config.messageEventsEnabled) {
    const sn = createSnipeHandlers(context);
    client.on(Events.MessageDelete, sn.delete);
    client.on(Events.MessageUpdate, sn.update);
  }
  context.tempRoles = new TempRoles(context);
  context.watch = new Watch(context);
  const watch = createWatchHandlers(context);
  if (config.messageEventsEnabled) client.on(Events.MessageCreate, watch.message);
  if (config.memberEventsEnabled) client.on(Events.GuildMemberUpdate, watch.nick);
  if (config.voiceEventsEnabled) client.on(Events.VoiceStateUpdate, watch.voice);
  client.on(Events.ChannelCreate, (ch) => logs.channel('create', ch));
  client.on(Events.ChannelDelete, (ch) => logs.channel('delete', ch));
  client.on(Events.ChannelUpdate, (before, ch) => logs.channel('update', ch, before));
}

client.once(Events.ClientReady, (ready) => {
  context.voiceReadiness.initialReady();
  context.botActivity.apply(ready);
  resumeAutoUnlocks(context, client);
  context.tempRoles.start(client);
  for (const g of ready.guilds.cache.values())
    if (context.invites.enabled(g.id)) context.invites.snapshot(g).catch(() => {});
  logger.info({ botId: ready.user.id, commands: commands.size }, 'Emika ready');
  context.giveawayRunner.start();
  context.automationRunner.start();
});
client.on(Events.Error, (e) => logger.error({ kind: e.name }, 'Discord client error'));
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  context.giveawayRunner.stop();
  context.automationRunner.stop();
  client.destroy();
  db.close();
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
process.on('unhandledRejection', () => {
  logger.fatal('Unhandled rejection; shutting down');
  void stop(1);
});
process.once('uncaughtException', () => {
  logger.fatal('Uncaught exception; shutting down');
  void stop(1);
});
try {
  await client.login(config.token);
} catch {
  logger.error('Login failed; check Discord credentials and connectivity.');
  await stop(1);
}
