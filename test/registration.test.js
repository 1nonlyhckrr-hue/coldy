import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Routes } from 'discord.js';
import { parseRegistrationArgs, registerCommands } from '../scripts/register.js';
import { loadCommands } from '../src/services/registry.js';
const clientId = '1537440298479656961';
const guildId = '1537440298479656962';
function harness(config = { clientId, guildId }) {
  const calls = [];
  return {
    calls,
    deps: {
      getConfig: () => config,
      rest: { put: async (...args) => calls.push(args) },
      log: () => {},
    },
  };
}
test('global apply sends all65 validated commands without guild configuration', async () => {
  const { calls, deps } = harness({ clientId });
  await registerCommands(['--apply', '--global'], deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], Routes.applicationCommands(clientId));
  const expected = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
  assert.equal(expected.length, 66);
  assert.deepEqual(calls[0][1].body, expected);
});
test('existing guild apply still sends same65command body to configured guild', async () => {
  const { calls, deps } = harness();
  await registerCommands(['--apply'], deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], Routes.applicationGuildCommands(clientId, guildId));
  assert.equal(calls[0][1].body.length, 66);
});
test('clear-guild sends only empty body to explicitly named guilds without loading commands', async () => {
  for (const id of [guildId, '1551646147100024925']) {
    const { calls, deps } = harness({ clientId });
    deps.getCommands = () => {
      throw new Error('must not load commands for clearing');
    };
    await registerCommands(['--clear-guild', id], deps);
    assert.deepEqual(calls, [[Routes.applicationGuildCommands(clientId, id), { body: [] }]]);
  }
});
test('preview including global remains nonmutating and needs no credentials', async () => {
  for (const args of [[], ['--global']]) {
    const { calls, deps } = harness();
    deps.getConfig = () => {
      throw new Error('preview must not load credentials');
    };
    const logs = [];
    deps.log = (s) => logs.push(s);
    await registerCommands(args, deps);
    assert.equal(JSON.parse(logs[0]).commands.length, 66);
    assert.deepEqual(calls, []);
  }
});
test('malformed unknown duplicate or conflicting registration arguments fail closed', () => {
  for (const args of [
    ['--clear-guild'],
    ['--clear-guild', '--apply'],
    ['--clear-guild', 'abc'],
    ['--clear-guild', guildId, '--global'],
    ['--globla', '--apply'],
    ['--apply', '--apply'],
  ])
    assert.throws(() => parseRegistrationArgs(args));
});
test('guild apply without guild configuration fails without any REST writes', async () => {
  const { calls, deps } = harness({ clientId });
  await assert.rejects(registerCommands(['--apply'], deps), /DISCORD_GUILD_ID is required/);
  assert.deepEqual(calls, []);
});
test('required-option validation blocks guild and global writes before config access', async () => {
  for (const args of [['--apply'], ['--apply', '--global']]) {
    const { calls, deps } = harness();
    deps.getConfig = () => {
      throw new Error('must validate first');
    };
    deps.getCommands = async () =>
      new Map([
        [
          'bad',
          {
            data: {
              toJSON: () => ({
                name: 'bad',
                options: [
                  { type: 3, name: 'optional' },
                  { type: 3, name: 'required', required: true },
                ],
              }),
            },
          },
        ],
      ]);
    await assert.rejects(
      registerCommands(args, deps),
      /Required options must precede optional options/,
    );
    assert.deepEqual(calls, []);
  }
});
