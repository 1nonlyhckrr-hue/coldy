import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTextLines, uniqueTextLines, compareTextLines } from '../src/services/discordTools.js';
import command from '../src/commands/utility/tools.js';
import { translate } from '../src/services/localization.js';
test('line exactsort/dedupe case/whitespace/empty/newline normalization no Unicode folding', () => {
  assert.equal(sortTextLines('b\r\nA\r b\na\n', 'ascending'), '\n b\nA\na\nb');
  assert.equal(sortTextLines('a\nb\na', 'descending'), 'b\na\na');
  assert.equal(uniqueTextLines('a\r\na\nA\na \n\n'), 'a\nA\na \n');
  assert.equal(uniqueTextLines('é\né\né'), 'é\né');
  assert.equal(sortTextLines('🙂\nA', 'ascending'), 'A\n🙂');
  for (const fn of [sortTextLines, uniqueTextLines])
    for (const text of ['', 'a\0b', 'a'.repeat(1201), '\n'.repeat(100)])
      assert.throws(() => fn(text, 'ascending'));
  assert.throws(() => sortTextLines('a', 'locale'));
});
test('linecompare exactunique sets firstoccurrenceorder no duplicatecounts/positions whitespace and empties distinct', () => {
  assert.deepEqual(compareTextLines('a\na\nA\n \n', 'a\nb\n'), {
    onlyLeft: ['A', ' '],
    onlyRight: ['b'],
    common: ['a', ''],
  });
  assert.deepEqual(compareTextLines('é', 'é'), { onlyLeft: ['é'], onlyRight: ['é'], common: [] });
  assert.throws(() => compareTextLines('a', 'b\0'));
});
test('line3paths private3locale exactTXTJSONbytes professionalembed no fetch/evaluation/state', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['sortlines', 'uniquelines', 'comparelines']) {
      let reply;
      const input = 'b\na\na\n',
        i = {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: (k) => (k === 'direction' ? 'ascending' : k === 'right' ? 'a\nc' : input),
          },
          reply: async (p) => (reply = p),
        };
      await command.execute(i, {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      });
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert.equal(reply.embeds.length, 1);
      const expected =
        sub === 'sortlines'
          ? sortTextLines(input, 'ascending')
          : sub === 'uniquelines'
            ? uniqueTextLines(input)
            : JSON.stringify(compareTextLines(input, 'a\nc'), null, 2) + '\n';
      assert.equal(reply.files[0].attachment.toString('utf8'), expected);
    }
});
