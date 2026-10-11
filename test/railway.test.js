import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('Railway worker start,Docker scripts/Node22,secret template and persistent storage steps remain deployable', () => {
  const p = JSON.parse(readFileSync('package.json'));
  assert.equal(p.scripts.start, 'node src/index.js');
  assert(existsSync('src/index.js'));
  const d = readFileSync('Dockerfile', 'utf8');
  assert(d.includes('node:22-bookworm-slim'));
  assert(d.includes('scripts ./scripts'));
  assert(d.includes('USER node'));
  assert(d.includes('npm ci --omit=dev'));
  const env = readFileSync('.env.example', 'utf8');
  for (const key of [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
    'OWNER_IDS',
    'DATABASE_PATH',
    'ENABLE_MUSIC',
    'MUSIC_RISK_ACCEPTED',
    'LAVALINK_URL',
    'LAVALINK_AUTH',
  ])
    assert(env.includes(key + '='));
  const guide = readFileSync('docs/RAILWAY_QUICKSTART.md', 'utf8');
  for (const text of [
    '1556357674663153694',
    '/app/var',
    'npm run register:guild',
    'One instance',
    'not a verified Railway deployment',
    'FAILS compatibility guard',
  ])
    assert(guide.includes(text));
  assert(readFileSync('.dockerignore', 'utf8').includes('.env'));
});
