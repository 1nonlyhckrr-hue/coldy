import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadConfig } from '../src/config/env.js';
import { loadCommands } from '../src/services/registry.js';
const commands = await loadCommands();
const body = [...commands.values()].map((c) => c.data.toJSON());
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ mode: 'preview', commands: body }, null, 2));
} else {
  const config = loadConfig();
  if (!config.guildId)
    throw new Error(
      'DISCORD_GUILD_ID is required. This script only registers test-guild commands.',
    );
  console.log(`Replacing test-guild command set: ${config.guildId}; ${body.length} commands.`);
  await new REST({ version: '10' })
    .setToken(config.token)
    .put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  console.log('Test-guild registration complete.');
}
