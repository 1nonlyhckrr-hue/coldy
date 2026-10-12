import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';

export const ALLOWED_GUILD_ID = '1551646147100024925';
const READ_ONLY = 'readOnly';
const PRIVATE = 'private';

export const STRUCTURE = [
  {
    name: '𝕴𝖓𝖋𝖔',
    channels: [
      { name: '⚔・𝖜𝖊𝖑𝖈𝖔𝖒𝖊', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖗𝖚𝖑𝖊𝖘', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖆𝖓𝖓𝖔𝖚𝖓𝖈𝖊𝖒𝖊𝖓𝖙𝖘', type: 'text', access: READ_ONLY },
    ],
  },
  {
    name: '𝕮𝖍𝖆𝖙',
    channels: [
      { name: '⚔・𝖌𝖊𝖓𝖊𝖗𝖆𝖑', type: 'text' },
      { name: '⚔・𝖒𝖊𝖉𝖎𝖆-𝖈𝖑𝖎𝖕𝖘', type: 'text' },
      { name: '⚔・𝖇𝖔𝖙-𝖈𝖔𝖒𝖒𝖆𝖓𝖉𝖘', type: 'text' },
    ],
  },
  {
    name: '𝕲𝖆𝖒𝖎𝖓𝖌',
    channels: [
      { name: '⚔・𝖋𝖋-𝖑𝖋𝖌', type: 'text' },
      { name: '⚔・𝖍𝖎𝖌𝖍𝖑𝖎𝖌𝖍𝖙𝖘', type: 'text' },
    ],
  },
  {
    name: '𝖁𝖔𝖎𝖈𝖊',
    channels: [
      { name: '⚔・𝖏𝖔𝖎𝖓-𝖙𝖔-𝖈𝖗𝖊𝖆𝖙𝖊', type: 'voice' },
      { name: '⚔・𝖌𝖆𝖒𝖎𝖓𝖌-𝖛𝖈', type: 'voice' },
      { name: '⚔・𝖈𝖍𝖎𝖑𝖑-𝖛𝖈', type: 'voice' },
    ],
  },
  {
    name: '𝕾𝖚𝖕𝖕𝖔𝖗𝖙',
    channels: [
      { name: '⚔・𝖙𝖎𝖈𝖐𝖊𝖙-𝖕𝖆𝖓𝖊𝖑', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖋𝖆𝖖', type: 'text', access: READ_ONLY },
    ],
  },
  {
    name: '𝕾𝖙𝖆𝖋𝖋',
    access: PRIVATE,
    channels: [
      { name: '⚔・𝖘𝖙𝖆𝖋𝖋-𝖈𝖍𝖆𝖙', type: 'text' },
      { name: '⚔・𝖒𝖔𝖉-𝖑𝖔𝖌𝖘', type: 'text' },
    ],
  },
];

const BOT_ALLOW = [
  P.ViewChannel,
  P.SendMessages,
  P.EmbedLinks,
  P.ReadMessageHistory,
  P.ManageChannels,
];

function overwritesFor(access, everyoneId, botId) {
  if (access === READ_ONLY)
    return [
      { id: everyoneId, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages] },
      { id: botId, allow: BOT_ALLOW },
    ];
  if (access === PRIVATE)
    return [
      { id: everyoneId, deny: [P.ViewChannel] },
      { id: botId, allow: BOT_ALLOW },
    ];
  return undefined;
}

export function parseSetupEnv(env) {
  const id = env.TARGET_GUILD_ID?.trim();
  if (id && !/^\d{17,20}$/.test(id)) throw new Error('TARGET_GUILD_ID must be a numeric guild ID.');
  if (id && id !== ALLOWED_GUILD_ID)
    throw new Error('TARGET_GUILD_ID is not the approved guild; refusing.');
  return { targetGuildId: id || undefined };
}

/** Creates the structure; existing categories/channels (same name, type and parent) are skipped. */
export async function buildStructure(guild, botId, log = console.log) {
  await guild.channels.fetch();
  const cache = guild.channels.cache;
  const counts = { created: 0, skipped: 0 };
  for (const group of STRUCTURE) {
    let category = cache.find((c) => c.type === ChannelType.GuildCategory && c.name === group.name);
    if (category) {
      counts.skipped += 1;
      log(`skip category ${group.name} (exists)`);
    } else {
      category = await guild.channels.create({
        name: group.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwritesFor(group.access, guild.id, botId),
      });
      counts.created += 1;
      log(`create category ${group.name}`);
    }
    for (const spec of group.channels) {
      const type = spec.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const found = cache.find(
        (c) => c.type === type && c.name === spec.name && c.parentId === category.id,
      );
      if (found) {
        counts.skipped += 1;
        log(`skip ${spec.type} channel ${spec.name} (exists)`);
        continue;
      }
      await guild.channels.create({
        name: spec.name,
        type,
        parent: category.id,
        permissionOverwrites: overwritesFor(spec.access ?? group.access, guild.id, botId),
      });
      counts.created += 1;
      log(`create ${spec.type} channel ${spec.name} in ${group.name}`);
    }
  }
  log(`done: ${counts.created} created, ${counts.skipped} skipped`);
  return counts;
}

export async function runSetup({ env = process.env, client, log = console.log } = {}) {
  const { targetGuildId } = parseSetupEnv(env);
  if (!env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required.');
  const own =
    client ?? new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] } });
  try {
    await own.login(env.DISCORD_TOKEN);
    const guilds = await own.guilds.fetch();
    log(`Bot guilds (${guilds.size}):`);
    for (const g of guilds.values()) log(`  ${g.id}  ${g.name}`);
    if (!targetGuildId) {
      log('TARGET_GUILD_ID not set. Listing only; no changes made.');
      return { listed: guilds.size, created: 0 };
    }
    if (!guilds.has(targetGuildId)) throw new Error('Bot is not in TARGET_GUILD_ID.');
    const guild = await own.guilds.fetch(targetGuildId);
    const counts = await buildStructure(guild, own.user.id, log);
    return { listed: guilds.size, ...counts };
  } finally {
    await own.destroy();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runSetup().then(
    () => process.exit(0),
    (e) => {
      console.error(`Setup failed: ${e.message}`);
      process.exit(1);
    },
  );
}
