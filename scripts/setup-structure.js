import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { Client, GatewayIntentBits } from 'discord.js';
import { STRUCTURE, createStructure } from '../src/services/serverStructure.js';

export { STRUCTURE };
export const ALLOWED_GUILD_ID = '1551646147100024925';

export function parseSetupEnv(env) {
  const id = env.TARGET_GUILD_ID?.trim();
  if (id && !/^\d{17,20}$/.test(id)) throw new Error('TARGET_GUILD_ID must be a numeric guild ID.');
  if (id && id !== ALLOWED_GUILD_ID)
    throw new Error('TARGET_GUILD_ID is not the approved guild; refusing.');
  return { targetGuildId: id || undefined };
}

/** Creates the structure; existing categories/channels are skipped. */
export async function buildStructure(guild, botId, log = console.log) {
  const r = await createStructure(guild, botId, 'Emika one-off structure setup');
  for (const n of r.createdCategories) log(`create category ${n}`);
  for (const n of r.skippedCategories) log(`skip category ${n} (exists)`);
  for (const n of r.createdChannels) log(`create channel ${n}`);
  for (const n of r.skippedChannels) log(`skip channel ${n} (exists)`);
  const created = r.createdCategories.length + r.createdChannels.length;
  const skipped = r.skippedCategories.length + r.skippedChannels.length;
  log(`done: ${created} created, ${skipped} skipped`);
  return { created, skipped };
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
