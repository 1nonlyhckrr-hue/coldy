import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpPage } from '../src/services/helpIndex.js';
import { loadCommands } from '../src/services/registry.js';
import command from '../src/commands/general/help.js';
const commands = await loadCommands();
test('help pages expose all199 installed paths exactly once with complete sorted lines', () => {
  const first = helpPage(commands),
    lines = [];
  assert.equal(first.total, 199);
  for (let page = 1; page <= first.pages; page++) {
    const result = helpPage(commands, { page });
    assert(result.lines.length <= 8);
    lines.push(...result.lines);
  }
  assert.equal(lines.length, 199);
  assert.equal(new Set(lines).size, 199);
  assert.deepEqual(lines, [...lines].sort());
});
test('help category and case-insensitive literal search combine without changing registry', () => {
  assert.equal(helpPage(commands, { category: 'music' }).total, 10);
  assert.deepEqual(
    helpPage(commands, { category: 'music', search: 'SHUFFLE' }).lines.map((l) => l.split(':')[0]),
    ['/music shuffle'],
  );
  assert.equal(helpPage(commands, { search: '.*' }).total, 0);
  assert.equal(helpPage(commands, { category: 'music', search: 'ban' }).total, 0);
  assert.equal(commands.size, 41);
});
test('help refuses malformed/out-of-range pages/categories/search without clamping', () => {
  for (const page of [0, -1, 101, 1.5, '1', NaN]) assert.throws(() => helpPage(commands, { page }));
  assert.throws(() => helpPage(commands, { page: 2, search: 'no such random installed name' }));
  for (const category of ['absent', 'MUSIC', ' music '])
    assert.throws(() => helpPage(commands, { category }));
  for (const search of ['', ' ', 'x'.repeat(81), 'a\nb', 42])
    assert.throws(() => helpPage(commands, { search }));
});
test('help filtered results and empty state are private localized no-ping full rows', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const search of ['shuffle', 'impossible-path-name']) {
      let payload;
      const i = {
        guildId: 'g',
        options: {
          getInteger: () => 1,
          getString: (name) => (name === 'category' ? 'music' : search),
        },
        reply: async (p) => {
          payload = p;
        },
      };
      await command.execute(i, {
        commands,
        version: '0.1.0',
        localization: { locale: () => locale },
      });
      assert.equal(payload.flags, 64);
      assert.deepEqual(payload.allowedMentions.parse, []);
      const text = payload.embeds[0].data.description;
      assert(text.length < 2000);
      assert(!text.includes('helpNoResults'));
      if (search === 'shuffle') assert(text.includes('/music shuffle:'));
    }
});
