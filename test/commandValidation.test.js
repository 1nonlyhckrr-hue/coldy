import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadCommands } from '../src/services/registry.js';
import { validateCommandOptionOrder } from '../src/services/commandValidation.js';
test('all65registered commands recursively require required options before optional', async () => {
  const commands = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
  assert.equal(commands.length, 72);
  assert.doesNotThrow(() => validateCommandOptionOrder(commands));
  const apply = commands.find((c) => c.name === 'jail').options.find((o) => o.name === 'apply');
  assert.deepEqual(
    apply.options.map((o) => o.name),
    ['confirm', 'member', 'duration', 'reason'],
  );
});
test('option order validator rejects root subcommand nestedgroup errors without mutating payload', () => {
  for (const wrapper of [
    (x) => x,
    (x) => [{ type: 1, name: 'apply', options: x }],
    (x) => [{ type: 2, name: 'group', options: [{ type: 1, name: 'apply', options: x }] }],
  ]) {
    const commands = [
      {
        name: 'example',
        options: wrapper([
          { type: 3, name: 'reason' },
          { type: 3, name: 'duration', required: true },
        ]),
      },
    ];
    const before = JSON.stringify(commands);
    assert.throws(
      () => validateCommandOptionOrder(commands),
      /Required options must precede optional options/,
    );
    assert.equal(JSON.stringify(commands), before);
  }
  assert.doesNotThrow(() =>
    validateCommandOptionOrder([
      {
        name: 'good',
        options: [
          { type: 3, name: 'a', required: true },
          { type: 3, name: 'b', required: false },
        ],
      },
    ]),
  );
});
test('register preview validates full65command payload before output or API path', () => {
  const preview = JSON.parse(
    execFileSync(process.execPath, ['scripts/register.js'], { encoding: 'utf8' }),
  );
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.commands.length, 72);
  validateCommandOptionOrder(preview.commands);
});
