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

export function shuffleChoices(text, rng = randomInt) {
  const values = parseChoices(text);
  for (let n = values.length - 1; n > 0; n--) {
    const index = rng(n + 1);
    if (!Number.isInteger(index) || index < 0 || index > n)
      throw new TypeError('Invalid random result');
    [values[n], values[index]] = [values[index], values[n]];
  }
  return values;
}

export function splitTeams(text, count, rng = randomInt) {
  const values = shuffleChoices(text, rng);
  if (!Number.isInteger(count) || count < 2 || count > 5 || count > values.length)
    throw new UserError('funTeamsInvalid');
  const teams = Array.from({ length: count }, () => []);
  values.forEach((v, n) => teams[n % count].push(v));
  return teams;
}

export function randomNumber(minimum, maximum, rng = randomInt) {
  if (
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum < -1000000 ||
    maximum > 1000000 ||
    minimum > maximum
  )
    throw new UserError('funNumberInvalid');
  const index = rng(maximum - minimum + 1);
  if (!Number.isInteger(index) || index < 0 || index > maximum - minimum)
    throw new TypeError('Invalid random result');
  return minimum + index;
}
export function sampleChoices(text, count, rng = randomInt) {
  const values = parseChoices(text);
  if (!Number.isInteger(count) || count < 1 || count > values.length)
    throw new UserError('funSampleInvalid');
  return shuffleChoices(text, rng).slice(0, count);
}

export function rollKeep(sides, count, keep, mode, rng = randomInt) {
  if (!Number.isInteger(keep) || keep < 1 || keep > count || !['highest', 'lowest'].includes(mode))
    throw new UserError('funKeepInvalid');
  const { rolls } = rollDice(sides, count, rng),
    sorted = [...rolls].sort((a, b) => (mode === 'highest' ? b - a : a - b)),
    kept = sorted.slice(0, keep);
  return { rolls, kept, total: kept.reduce((a, b) => a + b, 0) };
}
export function playRpsSeries(text, rng = randomInt) {
  if (typeof text !== 'string' || text.length > 100 || /[\u0000-\u001f\u007f]/u.test(text))
    throw new UserError('funSeriesInvalid');
  const moves = text.split('|').map((s) => s.trim().toLowerCase());
  if (
    moves.length < 2 ||
    moves.length > 10 ||
    moves.some((s) => !['rock', 'paper', 'scissors'].includes(s))
  )
    throw new UserError('funSeriesInvalid');
  const rounds = moves.map((move) => playRps(move, rng)),
    wins = rounds.filter((r) => r.result === 'win').length,
    losses = rounds.filter((r) => r.result === 'lose').length,
    draws = rounds.length - wins - losses;
  return {
    rounds,
    wins,
    losses,
    draws,
    result: wins === losses ? 'draw' : wins > losses ? 'win' : 'lose',
  };
}
export function drawCards(count, rng = randomInt) {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new UserError('funCardsInvalid');
  const deck = ['clubs', 'diamonds', 'hearts', 'spades'].flatMap((suit) =>
    ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => ({
      suit,
      rank,
    })),
  );
  const drawn = [];
  for (let n = 0; n < count; n++) {
    const at = rng(deck.length);
    if (!Number.isInteger(at) || at < 0 || at >= deck.length)
      throw new TypeError('Invalid random result');
    drawn.push(deck.splice(at, 1)[0]);
  }
  return drawn;
}
export function scrambleWord(word, rng = randomInt) {
  if (
    typeof word !== 'string' ||
    !/^[a-zA-Z]{3,20}$/.test(word) ||
    new Set(word.toLowerCase()).size < 2
  )
    throw new UserError('funWordInvalid');
  const chars = [...word.toLowerCase()];
  for (let n = chars.length - 1; n > 0; n--) {
    const at = rng(n + 1);
    if (!Number.isInteger(at) || at < 0 || at > n) throw new TypeError('Invalid random result');
    [chars[n], chars[at]] = [chars[at], chars[n]];
  }
  const original = word.toLowerCase();
  if (chars.join('') === original) {
    const at = chars.findIndex((c) => c !== chars[0]);
    [chars[0], chars[at]] = [chars[at], chars[0]];
  }
  return { scrambled: chars.join(''), answer: original };
}
export function rollTarget(sides, count, target, rng = randomInt) {
  if (!Number.isInteger(target) || target < 2 || target > sides)
    throw new UserError('funTargetInvalid');
  const r = rollDice(sides, count, rng);
  return { ...r, target, successes: r.rolls.filter((v) => v >= target).length };
}

export function pairLabels(text, rng = randomInt) {
  const labels = shuffleChoices(text, rng),
    pairs = [];
  while (labels.length >= 2) pairs.push(labels.splice(0, 2));
  return { pairs, bye: labels[0] ?? null };
}
export function exchangeCycle(text, rng = randomInt) {
  const labels = shuffleChoices(text, rng);
  return labels.map((giver, n) => ({ giver, receiver: labels[(n + 1) % labels.length] }));
}
export function weightedChoice(text, weightsText, rng = randomInt) {
  const labels = parseChoices(text);
  if (
    typeof weightsText !== 'string' ||
    weightsText.length > 119 ||
    !/^([1-9][0-9]{0,3})(\|[1-9][0-9]{0,3})+$/.test(weightsText)
  )
    throw new UserError('funWeightsInvalid');
  const weights = weightsText.split('|').map(Number);
  if (weights.length !== labels.length || weights.some((v) => v > 1000))
    throw new UserError('funWeightsInvalid');
  const total = weights.reduce((a, b) => a + b, 0),
    at = rng(total);
  if (!Number.isInteger(at) || at < 0 || at >= total) throw new TypeError('Invalid random result');
  let cumulative = 0;
  for (let n = 0; n < labels.length; n++) {
    cumulative += weights[n];
    if (at < cumulative) return { choice: labels[n], weight: weights[n], total };
  }
  throw new TypeError('Invalid random result');
}
