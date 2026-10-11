import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpPage, commandDetails } from '../src/services/helpIndex.js';
import { loadCommands } from '../src/services/registry.js';
import command from '../src/commands/general/help.js';
const commands = await loadCommands();
test('help pages expose all214 installed paths exactly once with complete sorted lines', () => {
  const first = helpPage(commands),
    lines = [];
  assert.equal(first.total, 214);
  for (let page = 1; page <= first.pages; page++) {
    const result = helpPage(commands, { page });
    assert(result.lines.length <= 8);
    lines.push(...result.lines);
  }
  assert.equal(lines.length, 214);
  assert.equal(new Set(lines).size, 214);
  assert.deepEqual(lines, [...lines].sort());
});
test('help category and case-insensitive literal search combine without changing registry', () => {
  assert.equal(helpPage(commands, { category: 'music' }).total, 12);
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
          getString: (name) => (name === 'category' ? 'music' : name === 'search' ? search : null),
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

test('help detail lists exact native parameters/bounds/choices for every real installed path without omissions', () => {
  for (const command of commands.values()) {
    const d = command.data.toJSON(),
      subs = (d.options ?? []).filter((o) => o.type === 1),
      selected = subs.length ? subs : [d];
    for (const sub of selected) {
      const path = d.name + (subs.length ? ' ' + sub.name : ''),
        first = commandDetails(commands, path),
        lines = [];
      for (let p = 1; p <= first.pages; p++) lines.push(...commandDetails(commands, path, p).lines);
      const options = sub.options ?? [];
      assert.equal(first.parameters, options.length);
      assert.deepEqual(
        lines.filter((r) => r.kind === 'parameter').map((r) => r.name),
        options.map((o) => o.name),
      );
      assert.equal(
        lines.filter((r) => r.kind === 'choice').length,
        options.reduce((n, o) => n + (o.choices?.length ?? 0), 0),
      );
    }
  }
});
test('help details normalize slash/case/spacing but reject missing or ambiguous paths and invalid pages', () => {
  assert.equal(commandDetails(commands, ' /MUSIC   PLAY ').path, '/music play');
  for (const path of [
    'music',
    'music notfound',
    'absent',
    'music play extra',
    '',
    'a\n',
    'x'.repeat(81),
  ])
    assert.throws(() => commandDetails(commands, path));
  for (const page of [0, 1.5, 101, 2]) assert.throws(() => commandDetails(commands, 'ping', page));
});
test('help detail pagination uses6whole lines and exact stored bounds and repeated choice entries', () => {
  const r = commandDetails(commands, 'fun number');
  assert.deepEqual(r.lines.find((l) => l.kind === 'bounds').bounds, {
    min_value: -1000000,
    max_value: 1000000,
  });
  const rows = [];
  const first = commandDetails(commands, 'automod rule');
  for (let p = 1; p <= first.pages; p++)
    rows.push(...commandDetails(commands, 'automod rule', p).lines);
  assert.equal(rows.filter((r) => r.kind === 'choice').length, 6);
  assert(first.pages > 1);
});
test('help command details localize private no-ping bounded replies over all paths/pages with no effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const cmd of commands.values()) {
      const d = cmd.data.toJSON(),
        subs = (d.options ?? []).filter((o) => o.type === 1);
      for (const selected of subs.length ? subs : [d]) {
        const path = d.name + (subs.length ? ' ' + selected.name : ''),
          first = commandDetails(commands, path);
        for (let page = 1; page <= first.pages; page++) {
          let payload;
          const i = {
            guildId: 'g',
            options: { getInteger: () => page, getString: (n) => (n === 'command' ? path : null) },
            reply: async (p) => {
              payload = p;
            },
          };
          await command.execute(i, {
            commands,
            localization: { locale: () => locale },
            version: '0.1.0',
          });
          assert.equal(payload.flags, 64);
          assert.deepEqual(payload.allowedMentions.parse, []);
          assert(payload.embeds[0].data.description.length < 2000);
          assert(payload.embeds[0].data.description.includes('/' + path));
        }
      }
    }
});
test('help detail rejects mixed filter modes before response instead of silently changing user intent', async () => {
  for (const filter of ['category', 'search']) {
    let replies = 0;
    const i = {
      guildId: 'g',
      options: {
        getInteger: () => 1,
        getString: (n) => (n === 'command' ? 'ping' : n === filter ? 'music' : null),
      },
      reply: async () => {
        replies++;
      },
    };
    await assert.rejects(() => command.execute(i, { commands }), /helpDetailConflict/);
    assert.equal(replies, 0);
  }
});
