import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCommands } from '../src/services/registry.js';
test('installed Emika inventory exact registry paths are separate from reference claims/live acceptance', async () => {
  const commands = await loadCommands(),
    actual = [];
  for (const command of commands.values()) {
    const d = command.data.toJSON(),
      subs = (d.options ?? []).filter((o) => o.type === 1);
    actual.push(...(subs.length ? subs.map((s) => d.name + ' ' + s.name) : [d.name]));
  }
  const rows = JSON.parse(await readFile('data/luna-commands.json', 'utf8'));
  assert.equal(rows.length, 680);
  assert.equal(new Set(rows.map((r) => r.name)).size, 680);
  assert.deepEqual(rows.map((r) => r.name).sort(), actual.sort());
  for (const row of rows) {
    assert(row.implemented);
    assert.equal(row.tested, false);
    assert.equal(row.referenceVerified, false);
    assert(row.testStatus.includes('unverified'));
    assert(row.notes.includes('Empty static array'));
    assert(row.cooldownMs > 0);
  }
});
test('Emika CSV preserves formula-safe quoted syntax and structured native parameters', async () => {
  const rows = JSON.parse(await readFile('data/luna-commands.json', 'utf8')),
    csv = await readFile('data/luna-commands.csv', 'utf8');
  assert.equal(csv.split('\n').filter(Boolean).length, 681);
  const poll = rows.find((r) => r.name === 'poll');
  assert.equal(poll.parameters.filter((p) => p.required).length, 4);
  assert.equal(poll.parameters.find((p) => p.name === 'hours').max, 768);
  assert.equal(poll.defaultMemberPermissions[0], 'ManageGuild');
  assert(rows.find((r) => r.name === 'moderation purgeconfirm').syntax.includes('(confirm)'));
});

test('human-readable installed command index matches every registry path exactly once', async () => {
  const rows = JSON.parse(await readFile('data/luna-commands.json', 'utf8')),
    index = await readFile('COMMAND_INDEX.md', 'utf8');
  const section = index
    .split('## Installed Emika commands')[1]
    .split('## Zynrax reference inventory')[0];
  const paths = section
    .split('\n')
    .filter((l) => l.startsWith('| /'))
    .map((l) => l.split(' | ')[0].slice(3));
  assert.deepEqual(
    paths,
    rows.map((r) => r.name),
  );
  assert.equal(new Set(paths).size, rows.length);
  assert(
    section.includes(
      `${new Set(rows.map((r) => r.name.split(' ')[0])).size} top-level commands, ${rows.length} executable paths`,
    ),
  );
  assert(section.includes('no live Discord acceptance'));
});
