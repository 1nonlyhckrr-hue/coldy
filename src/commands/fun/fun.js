import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import {
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
} from '../../services/fun.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('fun')
  .setDescription('Safe solo games and random choices.')
  .setContexts(InteractionContextType.Guild)
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
export default {
  category: 'fun',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    const locale = c.localization.locale(i.guildId),
      t = (key, params) => c.localization.t(i.guildId, key, params);
    const sub = i.options.getSubcommand();
    let text;
    if (sub === '8ball') {
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
