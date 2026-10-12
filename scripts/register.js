import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { loadConfig } from '../src/config/env.js';
import { loadCommands } from '../src/services/registry.js';
import { validateCommandOptionOrder } from '../src/services/commandValidation.js';

export function parseRegistrationArgs(args) {
  let apply = false;
  let global = false;
  let clearGuild;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Duplicate registration flag: ${flag}`);
    seen.add(flag);
    if (flag === '--apply') apply = true;
    else if (flag === '--global') global = true;
    else if (flag === '--clear-guild') {
      clearGuild = args[++i];
      if (!/^\d{17,20}$/.test(clearGuild ?? ''))
        throw new Error('--clear-guild requires a valid guild ID.');
    } else throw new Error(`Unknown registration flag: ${flag}`);
  }
  if (clearGuild && global) throw new Error('--clear-guild cannot be combined with --global.');
  return { apply, global, clearGuild };
}

export async function registerCommands(
  args = process.argv.slice(2),
  { getConfig = loadConfig, getCommands = loadCommands, rest, log = console.log } = {},
) {
  const options = parseRegistrationArgs(args);
  // Clearing is a separate, explicit operation. It never registers the command payload.
  if (options.clearGuild) {
    const config = getConfig();
    const client = rest ?? new REST({ version: '10' }).setToken(config.token);
    log(`Clearing guild command set: ${options.clearGuild}.`);
    await client.put(Routes.applicationGuildCommands(config.clientId, options.clearGuild), {
      body: [],
    });
    log('Guild command set cleared.');
    return;
  }
  const commands = await getCommands();
  const body = [...commands.values()].map((c) => c.data.toJSON());
  validateCommandOptionOrder(body);
  if (!options.apply) {
    log(JSON.stringify({ mode: 'preview', commands: body }, null, 2));
    return;
  }
  const config = getConfig();
  if (!options.global && !config.guildId)
    throw new Error(
      'DISCORD_GUILD_ID is required for guild registration. Use --apply --global for global commands.',
    );
  const route = options.global
    ? Routes.applicationCommands(config.clientId)
    : Routes.applicationGuildCommands(config.clientId, config.guildId);
  const label = options.global ? 'global' : `test-guild (${config.guildId})`;
  log(`Replacing ${label} command set: ${body.length} commands.`);
  await (rest ?? new REST({ version: '10' }).setToken(config.token)).put(route, { body });
  log(options.global ? 'Global registration complete.' : 'Test-guild registration complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await registerCommands();
