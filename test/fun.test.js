import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pick,
  rollDice,
  parseChoices,
  playRps,
  shuffleChoices,
  BALL_ANSWERS,
  TRUTH_PROMPTS,
  DARE_PROMPTS,
  rollKeep,
  playRpsSeries,
} from '../src/services/fun.js';
import fun from '../src/commands/fun/fun.js';
import { translate } from '../src/services/localization.js';
test('random selection includes first/last and rejects invalid RNG outputs', () => {
  assert.equal(
    pick(['a', 'b'], () => 0),
    'a',
  );
  assert.equal(
    pick(['a', 'b'], () => 1),
    'b',
  );
  assert.throws(() => pick([]));
  for (const value of [-1, 2, 0.5, NaN]) assert.throws(() => pick(['a', 'b'], () => value));
});
test('dice enforces bounds and deterministic sums without off-by-one', () => {
  assert.deepEqual(
    rollDice(2, 1, () => 0),
    { rolls: [1], total: 1 },
  );
  assert.deepEqual(
    rollDice(1000, 10, () => 999),
    { rolls: Array(10).fill(1000), total: 10000 },
  );
  for (const args of [
    [1, 1],
    [1001, 1],
    [6, 0],
    [6, 11],
    [6, 1.5],
    [NaN, 1],
  ])
    assert.throws(() => rollDice(...args));
  assert.throws(() => rollDice(6, 1, () => 6));
});
test('choices require distinct bounded entries and reject empty/control input', () => {
  assert.deepEqual(parseChoices(' tea | coffee '), ['tea', 'coffee']);
  assert.equal(parseChoices(Array.from({ length: 20 }, (_, i) => `c${i}`).join('|')).length, 20);
  for (const text of [
    'one',
    'a||b',
    'a|A',
    'a|b\n',
    'a|' + 'b'.repeat(101),
    Array.from({ length: 21 }, (_, i) => String(i)).join('|'),
    'a|b\u0000',
    null,
  ])
    assert.throws(() => parseChoices(text));
});
test('RPS computes all nine outcomes', () => {
  const moves = ['rock', 'paper', 'scissors'],
    wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  for (const player of moves)
    for (let n = 0; n < 3; n++) {
      const { bot, result } = playRps(player, () => n);
      assert.equal(bot, moves[n]);
      assert.equal(result, player === bot ? 'draw' : wins[player] === bot ? 'win' : 'lose');
    }
  assert.throws(() => playRps('gun'));
});
test('fun serializes twenty-two real paths and bounded input options', () => {
  const d = fun.data.toJSON();
  assert.equal(d.options.length, 22);
  assert.equal(d.contexts[0], 0);
  assert.equal(fun.cooldownMs, 5000);
  assert(d.options.every((o) => o.type === 1));
});
test('all fun commands reply in all locales with ephemeral branded embeds and no pings', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['8ball', 'coin', 'dice', 'choose', 'shuffle', 'truth', 'dare', 'rps']) {
      const replies = [],
        c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (name) =>
            ({
              question: 'safe question',
              choices: '@everyone **first** | @everyone **second**',
              move: 'rock',
            })[name],
          getInteger: () => null,
        },
        reply: async (p) => replies.push(p),
      };
      await fun.execute(i, c);
      assert.equal(replies.length, 1);
      const r = replies[0];
      assert.equal(r.flags, 64);
      assert.deepEqual(r.allowedMentions.parse, []);
      assert.equal(r.embeds.length, 1);
      assert(r.embeds[0].data.footer.text.includes('Luna'));
      assert(r.embeds[0].data.description.length < 1900);
      if (sub === 'choose') assert(r.embeds[0].data.description.includes('\\*\\*'));
    }
});
test('fun rejects malformed runtime values without replying', async () => {
  const c = { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } };
  for (const sub of ['8ball', 'choose', 'shuffle', 'rps', 'unknown']) {
    let replied = false;
    const i = {
      guildId: 'g',
      options: { getSubcommand: () => sub, getString: () => '', getInteger: () => null },
      reply: async () => {
        replied = true;
      },
    };
    await assert.rejects(() => fun.execute(i, c));
    assert.equal(replied, false);
  }
});
test('all fixed answers and prompts exist with no placeholders in each locale', () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const [prefix, values] of [
      ['funBall_', BALL_ANSWERS],
      ['funTruth_', TRUTH_PROMPTS],
      ['funDare_', DARE_PROMPTS],
    ])
      for (const value of values) assert(translate(locale, prefix + value).length > 0);
});

test('shuffle uses shrinking random bounds and returns every choice once without duplicates', () => {
  const bounds = [];
  assert.deepEqual(
    shuffleChoices('a|b|c|d', (n) => {
      bounds.push(n);
      return 0;
    }),
    ['b', 'c', 'd', 'a'],
  );
  assert.deepEqual(bounds, [4, 3, 2]);
  assert.deepEqual(
    shuffleChoices('a|b', (n) => n - 1),
    ['a', 'b'],
  );
  for (const value of [-1, 2, 0.5, NaN]) assert.throws(() => shuffleChoices('a|b', () => value));
  for (const input of ['one', 'a|A', 'a||b', 'a|b\n']) assert.throws(() => shuffleChoices(input));
});
test('shuffle privately escapes all choices in all locales without external effects', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const replies = [],
      c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
    await fun.execute(
      {
        guildId: 'g',
        options: { getSubcommand: () => 'shuffle', getString: () => '**one** | @everyone two' },
        reply: async (p) => replies.push(p),
      },
      c,
    );
    assert.equal(replies.length, 1);
    assert.equal(replies[0].flags, 64);
    assert.deepEqual(replies[0].allowedMentions.parse, []);
    const body = replies[0].embeds[0].data.description;
    assert(body.includes('\\*\\*one\\*\\*'));
    assert(body.includes('@everyone two'));
    assert(body.includes('1. '));
    assert(body.includes('2. '));
  }
});

test('shuffle refuses expanded output that would truncate any choices', async () => {
  let replied = false;
  const text = Array.from({ length: 18 }, (_, n) => '*'.repeat(94) + n).join('|');
  await assert.rejects(
    () =>
      fun.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => 'shuffle', getString: () => text },
          reply: async () => {
            replied = true;
          },
        },
        { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } },
      ),
    /funShuffleTooLong/,
  );
  assert.equal(replied, false);
});

test('random label teams contain every unique input exactly once and differ in size by at most one', async () => {
  const { splitTeams } = await import('../src/services/fun.js');
  for (const size of [2, 3, 7, 20])
    for (let groups = 2; groups <= Math.min(size, 5); groups++) {
      const labels = Array.from({ length: size }, (_, n) => 'label' + n),
        teams = splitTeams(labels.join('|'), groups, () => 0);
      assert.equal(teams.length, groups);
      assert.deepEqual(teams.flat().sort(), labels.sort());
      assert.equal(new Set(teams.flat()).size, size);
      assert(
        Math.max(...teams.map((t) => t.length)) - Math.min(...teams.map((t) => t.length)) <= 1,
      );
      assert(teams.every((t) => t.length > 0));
    }
});
test('random label teams reject empty groups duplicates malformed labels and bad RNG', async () => {
  const { splitTeams } = await import('../src/services/fun.js');
  for (const count of [1, 6, 3, 1.5, NaN]) assert.throws(() => splitTeams('a|b', count));
  for (const labels of ['a|A', 'a||b', 'a|b\n']) assert.throws(() => splitTeams(labels, 2));
  assert.throws(() => splitTeams('a|b', 2, () => 2));
});
test('teams replies are localized private escaped and no-ping without native assignments', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const replies = [],
      c = { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } };
    await fun.execute(
      {
        guildId: 'g',
        reply: async (p) => replies.push(p),
        options: {
          getSubcommand: () => 'teams',
          getString: () => '@everyone **A** | B | C',
          getInteger: () => 2,
        },
      },
      c,
    );
    const p = replies[0];
    assert(p.flags);
    assert.deepEqual(p.allowedMentions.parse, []);
    assert(
      p.embeds[0].data.description.includes(
        translate(locale, 'funTeam', { number: 1, labels: '' }).split(':')[0],
      ),
    );
    assert(p.embeds[0].data.description.includes('\\*\\*A\\*\\*'));
    assert(p.embeds[0].data.description.includes('@everyone'));
  }
});

test('random integer range includes negative/positive endpoints and singleton without rounding', async () => {
  const { randomNumber } = await import('../src/services/fun.js');
  assert.equal(
    randomNumber(-1000000, 1000000, () => 0),
    -1000000,
  );
  assert.equal(
    randomNumber(-1000000, 1000000, (n) => n - 1),
    1000000,
  );
  assert.equal(
    randomNumber(-7, -7, () => 0),
    -7,
  );
  assert.equal(
    randomNumber(-5, 5, () => 5),
    0,
  );
});
test('random integer range refuses reversed,out-of-bounds,noninteger and invalid RNG', async () => {
  const { randomNumber } = await import('../src/services/fun.js');
  for (const args of [
    [2, 1],
    [-1000001, 0],
    [0, 1000001],
    [1.5, 2],
    [0, NaN],
    ['1', 2],
  ])
    assert.throws(() => randomNumber(...args));
  for (const result of [-1, 3, 1.5, NaN]) assert.throws(() => randomNumber(0, 2, () => result));
});
test('sampling uses every unique label at most once and count gates before RNG', async () => {
  const { sampleChoices } = await import('../src/services/fun.js');
  for (const count of [1, 2, 3]) {
    const result = sampleChoices('a|b|c', count, () => 0);
    assert.equal(result.length, count);
    assert.equal(new Set(result).size, count);
    assert(result.every((v) => ['a', 'b', 'c'].includes(v)));
  }
  let random = 0;
  for (const count of [0, 4, 1.5, '1', NaN])
    assert.throws(() =>
      sampleChoices('a|b|c', count, () => {
        random++;
        return 0;
      }),
    );
  assert.equal(random, 0);
  for (const labels of ['a|A', 'a||b', 'a|b\n']) assert.throws(() => sampleChoices(labels, 1));
});
test('sample and number reply privately in all locales without pings,storage or assignments', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['sample', 'number']) {
      let p;
      await fun.execute(
        {
          guildId: 'g',
          options: {
            getSubcommand: () => sub,
            getString: () => '**A** @everyone | B',
            getInteger: (name) => (name === 'count' ? 2 : name === 'minimum' ? -3 : -3),
          },
          reply: async (payload) => {
            p = payload;
          },
        },
        { localization: { locale: () => locale, t: (_g, k, v) => translate(locale, k, v) } },
      );
      assert.equal(p.flags, 64);
      assert.deepEqual(p.allowedMentions.parse, []);
      assert(p.embeds[0].data.description.length < 2000);
      if (sub === 'sample') assert(p.embeds[0].data.description.includes('\\*\\*A\\*\\*'));
      else assert(p.embeds[0].data.description.includes('-3'));
    }
});
test('sample expanded labels refuse output overflow without partial reply', async () => {
  let replied = false;
  const text = Array.from({ length: 18 }, (_, n) => '*'.repeat(94) + n).join('|');
  await assert.rejects(
    () =>
      fun.execute(
        {
          guildId: 'g',
          options: { getSubcommand: () => 'sample', getString: () => text, getInteger: () => 18 },
          reply: async () => {
            replied = true;
          },
        },
        { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } },
      ),
    /funShuffleTooLong/,
  );
  assert.equal(replied, false);
});

test('dice keep sorts chosen extrema without changing original rolls and handles ties/all/one', () => {
  for (const [mode, kept, total] of [
    ['highest', [6, 6], 12],
    ['lowest', [1, 2], 3],
  ]) {
    const values = [0, 5, 1, 5];
    const r = rollKeep(6, 4, 2, mode, () => values.shift());
    assert.deepEqual(r, { rolls: [1, 6, 2, 6], kept, total });
  }
  assert.deepEqual(
    rollKeep(2, 1, 1, 'lowest', () => 0),
    { rolls: [1], kept: [1], total: 1 },
  );
  assert.equal(rollKeep(1000, 10, 10, 'highest', () => 999).total, 10000);
});
test('dice keep validates all native runtime bounds and rejects unsafe RNG without partial output', () => {
  for (const args of [
    [6, 3, 0, 'highest'],
    [6, 3, 4, 'highest'],
    [6, 3, 1.5, 'highest'],
    [6, 3, 1, 'bad'],
    [1, 3, 1, 'lowest'],
    [6, 11, 1, 'lowest'],
  ])
    assert.throws(() => rollKeep(...args));
  for (const v of [-1, 6, NaN, 0.5]) assert.throws(() => rollKeep(6, 3, 1, 'highest', () => v));
});
test('RPS series accepts repeated moves and scores all outcomes/tie with independent uniform draws', () => {
  const choices = [2, 0, 1],
    bounds = [];
  const r = playRpsSeries(' ROCK | rock | rock ', (n) => {
    bounds.push(n);
    return choices.shift();
  });
  assert.deepEqual(bounds, [3, 3, 3]);
  assert.equal(r.wins, 1);
  assert.equal(r.losses, 1);
  assert.equal(r.draws, 1);
  assert.equal(r.result, 'draw');
  assert.equal(playRpsSeries('rock|rock', () => 2).result, 'win');
  assert.equal(playRpsSeries('rock|rock', () => 1).result, 'lose');
  assert.equal(playRpsSeries(Array(10).fill('rock').join('|'), () => 0).draws, 10);
});
test('RPS series validates entire move list before randomness and rejects malformed bounded inputs', () => {
  for (const text of [
    null,
    'rock',
    'rock||paper',
    'rock|gun',
    'rock|paper\n',
    Array(11).fill('rock').join('|'),
    'x'.repeat(101),
  ]) {
    let calls = 0;
    assert.throws(() =>
      playRpsSeries(text, () => {
        calls++;
        return 0;
      }),
    );
    assert.equal(calls, 0);
  }
  assert.throws(() => playRpsSeries('rock|paper', () => 3));
});
test('dicekeep and RPS series reply privately with complete localized no-ping branded summaries', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['dicekeep', 'rpsseries']) {
      let reply;
      const c = {
        localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
      };
      const i = {
        guildId: 'g',
        options: {
          getSubcommand: () => sub,
          getString: (n) => (n === 'mode' ? 'highest' : Array(10).fill('scissors').join('|')),
          getInteger: (n) => (n === 'sides' ? 1000 : n === 'count' ? 10 : 5),
        },
        reply: async (p) => {
          reply = p;
        },
      };
      await fun.execute(i, c);
      assert.equal(reply.flags, 64);
      assert.deepEqual(reply.allowedMentions.parse, []);
      assert(reply.embeds[0].data.footer.text.includes('Luna'));
      assert(reply.embeds[0].data.description.length < 2000);
      if (sub === 'rpsseries') assert(reply.embeds[0].data.description.includes('10.'));
    }
});
test('new Fun runtime rejection has no reply and no external or persistent effects', async () => {
  for (const sub of ['dicekeep', 'rpsseries']) {
    let replies = 0;
    const c = { localization: { locale: () => 'en', t: (_g, k, p) => translate('en', k, p) } };
    const i = {
      guildId: 'g',
      options: { getSubcommand: () => sub, getString: () => 'bad', getInteger: () => 1 },
      reply: async () => {
        replies++;
      },
    };
    await assert.rejects(() => fun.execute(i, c));
    assert.equal(replies, 0);
  }
});
