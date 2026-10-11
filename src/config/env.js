import { validateMusicNodeConfig } from '../services/musicRuntime.js';
import { z } from 'zod';
const snowflake = z.string().regex(/^\d{17,20}$/);
const schema = z.object({
  DISCORD_TOKEN: z.string().min(30),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: z.preprocess((v) => (v === '' ? undefined : v), snowflake.optional()),
  OWNER_IDS: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(snowflake).min(1)),
  DATABASE_PATH: z.string().min(1).default('./var/luna.sqlite'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ENABLE_MESSAGE_EVENTS: z.enum(['true', 'false']).default('false'),
  ENABLE_AUDIT_EVENTS: z.enum(['true', 'false']).default('false'),
  ENABLE_VOICE_EVENTS: z.enum(['true', 'false']).default('false'),
  ENABLE_MEMBER_EVENTS: z.enum(['true', 'false']).default('false'),
  ENABLE_MUSIC: z.enum(['true', 'false']).default('false'),
  MUSIC_RISK_ACCEPTED: z.enum(['true', 'false']).default('false'),
  LAVALINK_URL: z.string().default(''),
  LAVALINK_AUTH: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Only field paths are emitted. Never include input values or Zod's raw errors.
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Invalid configuration fields: ${fields.join(', ')}`);
  }
  const c = result.data;
  const musicNode = validateMusicNodeConfig({
    enabled: c.ENABLE_MUSIC === 'true',
    riskAccepted: c.MUSIC_RISK_ACCEPTED === 'true',
    url: c.LAVALINK_URL,
    auth: c.LAVALINK_AUTH,
  });
  if (musicNode && c.ENABLE_VOICE_EVENTS !== 'true')
    throw new Error('Music requires ENABLE_VOICE_EVENTS');
  return Object.freeze({
    musicNode,
    token: c.DISCORD_TOKEN,
    clientId: c.DISCORD_CLIENT_ID,
    guildId: c.DISCORD_GUILD_ID,
    ownerIds: Object.freeze(c.OWNER_IDS),
    voiceEventsEnabled: c.ENABLE_VOICE_EVENTS === 'true',
    auditEventsEnabled: c.ENABLE_AUDIT_EVENTS === 'true',
    messageEventsEnabled: c.ENABLE_MESSAGE_EVENTS === 'true',
    memberEventsEnabled: c.ENABLE_MEMBER_EVENTS === 'true',
    databasePath: c.DATABASE_PATH,
    logLevel: c.LOG_LEVEL,
    environment: c.NODE_ENV,
  });
}
