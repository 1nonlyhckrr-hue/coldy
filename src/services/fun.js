import { randomInt } from 'node:crypto';
import { UserError } from '../utils/errors.js';
export const BALL_ANSWERS = [
  'yes',
  'no',
  'maybe',
  'later',
  'likely',
  'unlikely',
  'unclear',
  'askAgain',
];
export const TRUTH_PROMPTS = ['skill', 'memory', 'habit', 'dream', 'gratitude', 'lesson'];
export const DARE_PROMPTS = ['stretch', 'draw', 'kindness', 'tidy', 'hum', 'water'];
export function pick(values, rng = randomInt) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100)
    throw new TypeError('Invalid random selection');
  const index = rng(values.length);
  if (!Number.isInteger(index) || index < 0 || index >= values.length)
    throw new TypeError('Invalid random result');
  return values[index];
}
export function rollDice(sides, count, rng = randomInt) {
  if (
    !Number.isInteger(sides) ||
    sides < 2 ||
    sides > 1000 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10
  )
    throw new UserError('funDiceInvalid');
  const rolls = Array.from({ length: count }, () => {
    const value = rng(sides);
    if (!Number.isInteger(value) || value < 0 || value >= sides)
      throw new TypeError('Invalid random result');
    return value + 1;
  });
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
}
export function parseChoices(text) {
  if (typeof text !== 'string' || text.length > 1800 || /[\u0000-\u001f\u007f]/u.test(text))
    throw new UserError('funChoicesInvalid');
  const values = text.split('|').map((s) => s.trim());
  if (
    values.length < 2 ||
    values.length > 20 ||
    values.some((s) => !s || s.length > 100 || /[\u0000-\u001f\u007f]/u.test(s))
  )
    throw new UserError('funChoicesInvalid');
  if (new Set(values.map((s) => s.toLowerCase())).size !== values.length)
    throw new UserError('funChoicesDuplicate');
  return values;
}
export function playRps(player, rng = randomInt) {
  const moves = ['rock', 'paper', 'scissors'];
  if (!moves.includes(player)) throw new UserError('funMoveInvalid');
  const bot = pick(moves, rng);
  const result =
    player === bot
      ? 'draw'
      : { rock: 'scissors', paper: 'rock', scissors: 'paper' }[player] === bot
        ? 'win'
        : 'lose';
  return { player, bot, result };
}
