import { loadConfig } from '../config/env.js';
import { loadCommands } from './registry.js';
export async function preflight(env = process.env, nodeVersion = process.versions.node) {
  const version =
    typeof nodeVersion === 'string'
      ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(nodeVersion)
      : null;
  const parts = version ? version.slice(1).map(Number) : [];
  const [major, minor] = parts;
  const nodeSupported =
    !!version &&
    parts.every(Number.isSafeInteger) &&
    ((major === 22 && minor >= 13) || major === 24);
  const checks = [
    {
      name: 'node',
      ok: nodeSupported,
      detail: nodeSupported ? 'Supported Node runtime.' : 'Use Node22.13+ or24.',
    },
  ];
  let config;
  try {
    config = loadConfig(env);
    checks.push({
      name: 'configuration',
      ok: true,
      detail: 'Required fields validate. Token authenticity and account ownership are NOT checked.',
    });
  } catch (error) {
    // loadConfig exposes field names/constant diagnostics only,not input values.
    checks.push({ name: 'configuration', ok: false, detail: error.message });
  }
  try {
    const commands = await loadCommands();
    const paths = [...commands.values()].reduce((n, c) => {
      const d = c.data.toJSON(),
        subs = (d.options ?? []).filter((o) => o.type === 1);
      return n + (subs.length || 1);
    }, 0);
    checks.push({
      name: 'registry',
      ok: true,
      detail: `${commands.size} top-level commands,${paths} executable paths serialize.`,
    });
  } catch {
    checks.push({ name: 'registry', ok: false, detail: 'Command registry failed validation.' });
  }
  if (config) {
    checks.push({
      name: 'guild-registration',
      ok: !!config.guildId,
      detail: config.guildId
        ? 'Guild ID configured. Verify exact intended server before register:guild.'
        : 'DISCORD_GUILD_ID missing. Add exact guild ID before register:guild.',
    });
    checks.push({
      name: 'storage',
      ok: true,
      detail:
        'Database path configured. Writable persistent volume,ownership and backup policy NOT checked.',
    });
    checks.push({
      name: 'event-flags',
      ok: true,
      detail: `Message:${config.messageEventsEnabled};members:${config.memberEventsEnabled};audit:${config.auditEventsEnabled};voice:${config.voiceEventsEnabled}. Required intents/permissions NOT checked.`,
    });
    checks.push({
      name: 'music',
      ok: true,
      detail: config.musicNode
        ? 'Music opted in. Provider trust/version,source terms,voice/client/playback NOT checked.'
        : 'Music off. No provider connection attempted.',
    });
  }
  return {
    ok: checks.every((c) => c.ok),
    checks,
    limitations:
      'Offline configuration/metadata check only. No login,network,registration,database access,volume write,provider probe or deployment. Passing is NOT live readiness.',
  };
}
