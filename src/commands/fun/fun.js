import { SlashCommandBuilder, InteractionContextType, MessageFlags, escapeMarkdown } from 'discord.js';
import { BALL_ANSWERS, TRUTH_PROMPTS, DARE_PROMPTS, pick, rollDice, parseChoices, playRps } from '../../services/fun.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder().setName('fun').setDescription('Safe solo games and random choices.').setContexts(InteractionContextType.Guild)
  .addSubcommand(s => s.setName('8ball').setDescription('Get a playful random answer, not advice.').addStringOption(o => o.setName('question').setDescription('A question for the 8-ball').setMinLength(1).setMaxLength(300).setRequired(true)))
  .addSubcommand(s => s.setName('coin').setDescription('Flip a coin.'))
  .addSubcommand(s => s.setName('dice').setDescription('Roll up to ten dice.').addIntegerOption(o => o.setName('sides').setDescription('Sides per die (2-1000)').setMinValue(2).setMaxValue(1000)).addIntegerOption(o => o.setName('count').setDescription('Dice count (1-10)').setMinValue(1).setMaxValue(10)))
  .addSubcommand(s => s.setName('choose').setDescription('Pick one of 2-20 choices separated by |.').addStringOption(o => o.setName('choices').setDescription('Example: tea | coffee | juice').setMinLength(3).setMaxLength(1800).setRequired(true)))
  .addSubcommand(s => s.setName('truth').setDescription('Get an optional, low-pressure reflection prompt.'))
  .addSubcommand(s => s.setName('dare').setDescription('Get an optional, safe solo activity.'))
  .addSubcommand(s => s.setName('rps').setDescription('Play one round of rock, paper, scissors against Luna.').addStringOption(o => o.setName('move').setDescription('Your move').addChoices(...['rock', 'paper', 'scissors'].map(value => ({ name: value, value }))).setRequired(true)));
export default { category: 'fun', data, cooldownMs: 5000, async execute(i, c) {
  const locale = c.localization.locale(i.guildId), t = (key, params) => c.localization.t(i.guildId, key, params);
  const sub = i.options.getSubcommand();
  let text;
  if (sub === '8ball') {
    const question = i.options.getString('question', true);
    if (typeof question !== 'string' || !question.trim() || question.length > 300) throw new UserError('funQuestionInvalid');
    text = t('funBall', { answer: t(`funBall_${pick(BALL_ANSWERS)}`) });
  } else if (sub === 'coin') text = t('funCoin', { side: t(`funCoin_${pick(['heads', 'tails'])}`) });
  else if (sub === 'dice') {
    const { rolls, total } = rollDice(i.options.getInteger('sides') ?? 6, i.options.getInteger('count') ?? 1);
    text = t('funDice', { rolls: rolls.join(', '), total });
  } else if (sub === 'choose') text = t('funChosen', { choice: escapeMarkdown(pick(parseChoices(i.options.getString('choices', true)))) });
  else if (sub === 'truth') text = t('funOptional', { prompt: t(`funTruth_${pick(TRUTH_PROMPTS)}`) });
  else if (sub === 'dare') text = t('funOptional', { prompt: t(`funDare_${pick(DARE_PROMPTS)}`) });
  else if (sub === 'rps') {
    const { player, bot, result } = playRps(i.options.getString('move', true));
    text = t('funRps', { player: t(`funMove_${player}`), bot: t(`funMove_${bot}`), result: t(`funRps_${result}`) });
  } else throw new UserError('unknownCommand');
  await i.reply(lunaPayload({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [], repliedUser: false } }, { locale }));
} };
