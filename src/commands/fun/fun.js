import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import {
  eliminationBracket,
  bingoCard,
  drawDominoes,
  roundRobin,
  dealHands,
  rollHistogram,
  pairLabels,
  exchangeCycle,
  weightedChoice,
  drawCards,
  scrambleWord,
  rollTarget,
  BALL_ANSWERS,
  TRUTH_PROMPTS,
  DARE_PROMPTS,
  pick,
  rollDice,
  parseChoices,
  playRps,
  shuffleChoices,
  splitTeams,
  randomNumber,
  sampleChoices,
  rollKeep,
  playRpsSeries,
} from '../../services/fun.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('fun')
  .setDescription('Safe solo games and random choices.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('roundrobin')
      .setDescription('Private complete pair schedule for2-10 labels,no dates/member assignments.')
      .addStringOption((o) =>
        o
          .setName('labels')
          .setDescription('2-10 distinct labels separated by |,max30characters each')
          .setMinLength(3)
          .setMaxLength(309)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('dealhands')
      .setDescription(
        'Private2-5 numbered hands,1-5cards each,unique standarddeck,no bets/secret delivery.',
      )
      .addIntegerOption((o) =>
        o
          .setName('players')
          .setDescription('Numbered hands2-5')
          .setMinValue(2)
          .setMaxValue(5)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('cards')
          .setDescription('Cards perhand1-5')
          .setMinValue(1)
          .setMaxValue(5)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('dicehistogram')
      .setDescription(
        'Private1-100 independent dice rolls summarized by face,count/total,no stored state.',
      )
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('Roll count1-100')
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('sides')
          .setDescription('Sides2-20')
          .setMinValue(2)
          .setMaxValue(20)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('pairs')
      .setDescription(
        'Private random pairings of2-20 labels,odd label gets bye;no member assignment.',
      )
      .addStringOption((o) =>
        o
          .setName('labels')
          .setDescription('Distinct labels separated by |')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exchange')
      .setDescription(
        'Private one-cycle label exchange;no self match,no messages or secret delivery.',
      )
      .addStringOption((o) =>
        o
          .setName('labels')
          .setDescription('2-20 distinct labels separated by |,result visible to you')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('weightedchoice')
      .setDescription(
        'Private weighted draw from explicit labels/positive integer weights,not advice.',
      )
      .addStringOption((o) =>
        o
          .setName('choices')
          .setDescription('2-20 distinct choices separated by |')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('weights')
          .setDescription('Matching positive1-1000 integer weights separated by |,no spaces')
          .setMinLength(3)
          .setMaxLength(119)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('8ball')
      .setDescription('Get a playful random answer, not advice.')
      .addStringOption((o) =>
        o
          .setName('question')
          .setDescription('A question for the 8-ball')
          .setMinLength(1)
          .setMaxLength(300)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('coin').setDescription('Flip a coin.'))
  .addSubcommand((s) =>
    s
      .setName('dice')
      .setDescription('Roll up to ten dice.')
      .addIntegerOption((o) =>
        o
          .setName('sides')
          .setDescription('Sides per die (2-1000)')
          .setMinValue(2)
          .setMaxValue(1000),
      )
      .addIntegerOption((o) =>
        o.setName('count').setDescription('Dice count (1-10)').setMinValue(1).setMaxValue(10),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('choose')
      .setDescription('Pick one of 2-20 choices separated by |.')
      .addStringOption((o) =>
        o
          .setName('choices')
          .setDescription('Example: tea | coffee | juice')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('shuffle')
      .setDescription('Privately randomize all 2-20 distinct choices,no assignments.')
      .addStringOption((o) =>
        o
          .setName('choices')
          .setDescription('Choices separated by |')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('teams')
      .setDescription(
        'Privately split 2-20 distinct labels into balanced random groups,no invites.',
      )
      .addStringOption((o) =>
        o
          .setName('labels')
          .setDescription('Labels separated by |,not Discord member assignments')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('groups')
          .setDescription('Group count2-5,no empty groups')
          .setMinValue(2)
          .setMaxValue(5)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('number')
      .setDescription('One uniform integer in an inclusive bounded range;not advice.')
      .addIntegerOption((o) =>
        o
          .setName('minimum')
          .setDescription('Inclusive minimum,-1000000 to1000000')
          .setMinValue(-1000000)
          .setMaxValue(1000000)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('maximum')
          .setDescription('Inclusive maximum,at least minimum')
          .setMinValue(-1000000)
          .setMaxValue(1000000)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('sample')
      .setDescription('Pick1-20 distinct waiting labels without replacement;no assignments.')
      .addStringOption((o) =>
        o
          .setName('choices')
          .setDescription('2-20 distinct labels separated by |')
          .setMinLength(3)
          .setMaxLength(1800)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('How many labels,at most total supplied')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('truth').setDescription('Get an optional, low-pressure reflection prompt.'),
  )
  .addSubcommand((s) => s.setName('dare').setDescription('Get an optional, safe solo activity.'))
  .addSubcommand((s) =>
    s
      .setName('dicekeep')
      .setDescription('Roll bounded dice,keep highest or lowest results;no stakes or saved state.')
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('Number of dice1-10')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('keep')
          .setDescription('Keep1-count dice')
          .setMinValue(1)
          .setMaxValue(10)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('Keep highest or lowest')
          .addChoices({ name: 'highest', value: 'highest' }, { name: 'lowest', value: 'lowest' })
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o.setName('sides').setDescription('Sides2-1000,default6').setMinValue(2).setMaxValue(1000),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('rpsseries')
      .setDescription('Play2-10 preselected RPS rounds against Luna;private score,no stakes.')
      .addStringOption((o) =>
        o
          .setName('moves')
          .setDescription('2-10 moves separated by |,e.g. rock|paper|scissors')
          .setMinLength(3)
          .setMaxLength(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('rps')
      .setDescription('Play one round of rock, paper, scissors against Luna.')
      .addStringOption((o) =>
        o
          .setName('move')
          .setDescription('Your move')
          .addChoices(...['rock', 'paper', 'scissors'].map((value) => ({ name: value, value })))
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('cards')
    .setDescription('Draw1-10 distinct cards from a fresh52card deck,no betting/saved game.')
    .addIntegerOption((o) =>
      o.setName('count').setDescription('Cards1-10,default1').setMinValue(1).setMaxValue(10),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('wordscramble')
    .setDescription(
      'Scramble your supplied ASCII word,answer in spoiler;no dictionary/guess tracking.',
    )
    .addStringOption((o) =>
      o
        .setName('word')
        .setDescription('3-20Englishletters,at least2distinct;kept private/not saved')
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('dicetarget')
    .setDescription('Roll dice and count values at or above an explicit target,no stakes.')
    .addIntegerOption((o) =>
      o
        .setName('target')
        .setDescription('Target2-sides')
        .setMinValue(2)
        .setMaxValue(1000)
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName('count').setDescription('Dice1-10,default1').setMinValue(1).setMaxValue(10),
    )
    .addIntegerOption((o) =>
      o.setName('sides').setDescription('Sides2-1000,default6').setMinValue(2).setMaxValue(1000),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('bracket')
    .setDescription(
      'Private randomized first-round single-elimination bracket2-16labels,no winners or assignments.',
    )
    .addStringOption((o) =>
      o
        .setName('labels')
        .setDescription('2-16distinct labels separatedby|,max40characters each')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(655),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('bingo')
    .setDescription(
      'Private fresh75ball5x5BINGOcard,freeNcenter,no called numbers/prizes/saved game.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('dominoes')
    .setDescription(
      'Private draw1-7unique double-six domino tiles from fresh28tile set,no bets/saved game.',
    )
    .addIntegerOption((o) =>
      o.setName('count').setDescription('Tiles1-7').setRequired(true).setMinValue(1).setMaxValue(7),
    ),
);
export default {
  category: 'fun',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    const locale = c.localization.locale(i.guildId),
      t = (key, params) => c.localization.t(i.guildId, key, params);
    const sub = i.options.getSubcommand();
    let text;
    if (['bracket', 'bingo', 'dominoes'].includes(sub)) {
      const report =
        sub === 'bracket'
          ? eliminationBracket(i.options.getString('labels', true))
          : sub === 'bingo'
            ? bingoCard()
            : drawDominoes(i.options.getInteger('count', true));
      await i.reply(
        lunaPayload(
          {
            content: t('funGame_' + sub),
            flags: MessageFlags.Ephemeral,
            files: [
              new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
                name: 'luna-' + sub + '.json',
              }),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    }
    if (sub === 'roundrobin') {
      const labels = parseChoices(i.options.getString('labels', true));
      if (labels.length > 10 || labels.some((v) => v.length > 30))
        throw new UserError('funChoicesInvalid');
      const rounds = roundRobin(labels.join('|'))
        .map(
          (r, n) =>
            `${n + 1}: ${r.pairs.map((p) => p.map(escapeMarkdown).join(' / ')).join('; ')}${r.bye === null ? '' : ` | ${t('funRoundBye', { label: escapeMarkdown(r.bye) })}`}`,
        )
        .join('\n');
      if (rounds.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funRoundRobin', { rounds });
    } else if (sub === 'dealhands') {
      const hands = dealHands(
        i.options.getInteger('players', true),
        i.options.getInteger('cards', true),
      )
        .map(
          (hand, n) =>
            `${n + 1}: ${hand.map((card) => card.rank + ' ' + t('funSuit_' + card.suit)).join(', ')}`,
        )
        .join('\n');
      text = t('funHands', { hands });
    } else if (sub === 'dicehistogram') {
      const report = rollHistogram(
        i.options.getInteger('sides', true),
        i.options.getInteger('count', true),
      );
      text = t('funHistogram', {
        ...report,
        faces: report.frequencies.map((count, n) => `${n + 1}: ${count}`).join(', '),
      });
    } else if (sub === 'pairs') {
      const r = pairLabels(i.options.getString('labels', true));
      const pairs = r.pairs
        .map((v, n) => `${n + 1}. ${v.map(escapeMarkdown).join(' / ')}`)
        .join('\n');
      if (pairs.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funPairs', { pairs, bye: r.bye === null ? t('funNoBye') : escapeMarkdown(r.bye) });
    } else if (sub === 'exchange') {
      const cycle = exchangeCycle(i.options.getString('labels', true))
        .map((v, n) => `${n + 1}. ${escapeMarkdown(v.giver)} -> ${escapeMarkdown(v.receiver)}`)
        .join('\n');
      if (cycle.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funExchange', { cycle });
    } else if (sub === 'weightedchoice') {
      const r = weightedChoice(
        i.options.getString('choices', true),
        i.options.getString('weights', true),
      );
      text = t('funWeightedChoice', { ...r, choice: escapeMarkdown(r.choice) });
    } else if (sub === 'cards')
      text = t('funCards', {
        cards: drawCards(i.options.getInteger('count') ?? 1)
          .map((v) => v.rank + ' ' + t('funSuit_' + v.suit))
          .join(', '),
      });
    else if (sub === 'wordscramble')
      text = t('funWordScramble', scrambleWord(i.options.getString('word', true)));
    else if (sub === 'dicetarget') {
      const r = rollTarget(
        i.options.getInteger('sides') ?? 6,
        i.options.getInteger('count') ?? 1,
        i.options.getInteger('target', true),
      );
      text = t('funDiceTarget', { ...r, rolls: r.rolls.join(', ') });
    } else if (sub === '8ball') {
      const question = i.options.getString('question', true);
      if (typeof question !== 'string' || !question.trim() || question.length > 300)
        throw new UserError('funQuestionInvalid');
      text = t('funBall', { answer: t(`funBall_${pick(BALL_ANSWERS)}`) });
    } else if (sub === 'coin')
      text = t('funCoin', { side: t(`funCoin_${pick(['heads', 'tails'])}`) });
    else if (sub === 'dice') {
      const { rolls, total } = rollDice(
        i.options.getInteger('sides') ?? 6,
        i.options.getInteger('count') ?? 1,
      );
      text = t('funDice', { rolls: rolls.join(', '), total });
    } else if (sub === 'choose')
      text = t('funChosen', {
        choice: escapeMarkdown(pick(parseChoices(i.options.getString('choices', true)))),
      });
    else if (sub === 'shuffle') {
      const choices = shuffleChoices(i.options.getString('choices', true))
        .map((value, n) => `${n + 1}. ${escapeMarkdown(value)}`)
        .join('\n');
      if (choices.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funShuffled', { choices });
    } else if (sub === 'teams') {
      const teams = splitTeams(
        i.options.getString('labels', true),
        i.options.getInteger('groups', true),
      );
      const lines = teams
        .map((group, n) =>
          t('funTeam', { number: n + 1, labels: group.map(escapeMarkdown).join(' | ') }),
        )
        .join('\n');
      if (lines.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funTeams', { teams: lines });
    } else if (sub === 'number') {
      const minimum = i.options.getInteger('minimum', true),
        maximum = i.options.getInteger('maximum', true);
      text = t('funNumber', { minimum, maximum, value: randomNumber(minimum, maximum) });
    } else if (sub === 'sample') {
      const selected = sampleChoices(
        i.options.getString('choices', true),
        i.options.getInteger('count', true),
      )
        .map((v, n) => `${n + 1}. ${escapeMarkdown(v)}`)
        .join('\n');
      if (selected.length > 1700) throw new UserError('funShuffleTooLong');
      text = t('funSample', { choices: selected });
    } else if (sub === 'dicekeep') {
      const r = rollKeep(
        i.options.getInteger('sides') ?? 6,
        i.options.getInteger('count', true),
        i.options.getInteger('keep', true),
        i.options.getString('mode', true),
      );
      text = t('funDiceKeep', {
        rolls: r.rolls.join(', '),
        kept: r.kept.join(', '),
        total: r.total,
        mode: t('funKeep_' + i.options.getString('mode', true)),
      });
    } else if (sub === 'rpsseries') {
      const r = playRpsSeries(i.options.getString('moves', true));
      const rounds = r.rounds
        .map(
          (round, n) =>
            `${n + 1}. ${t('funRps', { player: t('funMove_' + round.player), bot: t('funMove_' + round.bot), result: t('funRps_' + round.result) })}`,
        )
        .join('\n');
      text = t('funSeries', {
        rounds,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        result: t('funRps_' + r.result),
      });
    } else if (sub === 'truth')
      text = t('funOptional', { prompt: t(`funTruth_${pick(TRUTH_PROMPTS)}`) });
    else if (sub === 'dare')
      text = t('funOptional', { prompt: t(`funDare_${pick(DARE_PROMPTS)}`) });
    else if (sub === 'rps') {
      const { player, bot, result } = playRps(i.options.getString('move', true));
      text = t('funRps', {
        player: t(`funMove_${player}`),
        bot: t(`funMove_${bot}`),
        result: t(`funRps_${result}`),
      });
    } else throw new UserError('unknownCommand');
    await i.reply(
      lunaPayload(
        {
          content: text,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
