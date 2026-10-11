import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../src/services/preflight.js';
const env = {
  DISCORD_TOKEN: 'TEST_SECRET_TOKEN_DO_NOT_OUTPUT'.repeat(2),
  DISCORD_CLIENT_ID: '1556357674663153694',
  DISCORD_GUILD_ID: '100000000000000001',
  OWNER_IDS: '100000000000000002',
  DATABASE_PATH: '/TEST_SECRET_PATH/luna.sqlite',
};
test('offline preflight reports registry/counts with explicit unverified live gates and no secret values', async () => {
  const result = await preflight(env, '22.13.0');
  assert.equal(result.ok, true);
  const text = JSON.stringify(result);
  assert(!text.includes(env.DISCORD_TOKEN));
  assert(!text.includes(env.DATABASE_PATH));
  assert(text.includes('214 executable'));
  assert(text.includes('NOT live readiness'));
  assert(text.includes('Music off'));
  assert(text.includes('ownership and backup policy NOT checked'));
});
test('preflight refuses unsupported runtime/config without leaking rejected input', async () => {
  for (const version of ['20.0.0', '22.12.0', '23.0.0', '25.0.0', 'bad'])
    assert.equal((await preflight(env, version)).ok, false);
  for (const version of ['22.13.0', '22.99.0', '24.0.0'])
    assert.equal((await preflight(env, version)).ok, true);
  const result = await preflight({ ...env, OWNER_IDS: 'PRIVATE_INVALID_ID' }, '24.0.0');
  assert.equal(result.ok, false);
  assert(!JSON.stringify(result).includes('PRIVATE_INVALID_ID'));
  assert(JSON.stringify(result).includes('OWNER_IDS'));
});
test('preflight guild-registration gate and enabled music retain honest untested status', async () => {
  assert.equal((await preflight({ ...env, DISCORD_GUILD_ID: '' }, '24.0.0')).ok, false);
  const result = await preflight(
    {
      ...env,
      ENABLE_MUSIC: 'true',
      MUSIC_RISK_ACCEPTED: 'true',
      ENABLE_VOICE_EVENTS: 'true',
      LAVALINK_URL: 'private-provider.example.org',
      LAVALINK_AUTH: 'NODE_SECRET_DO_NOT_OUTPUT',
    },
    '24.0.0',
  );
  assert.equal(result.ok, true);
  const text = JSON.stringify(result);
  assert(!text.includes('NODE_SECRET'));
  assert(!text.includes('private-provider'));
  assert(text.includes('voice/client/playback NOT checked'));
});
