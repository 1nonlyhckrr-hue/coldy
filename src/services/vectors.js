import { UserError } from '../utils/errors.js';
function vector(text) {
  let values;
  try {
    if (typeof text !== 'string' || text.length > 200) throw Error();
    values = JSON.parse(text);
  } catch {
    throw new UserError('vectorInputInvalid');
  }
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 4 ||
    values.some((v) => !Number.isSafeInteger(v) || Math.abs(v) > 1000000)
  )
    throw new UserError('vectorInputInvalid');
  return values.map(BigInt);
}
function pair(left, right) {
  const a = vector(left),
    b = vector(right);
  if (a.length !== b.length) throw new UserError('vectorDimensionsInvalid');
  return [a, b];
}
export function dotProduct(left, right) {
  const [a, b] = pair(left, right);
  return { dimensions: a.length, dot: String(a.reduce((sum, v, n) => sum + v * b[n], 0n)) };
}
export function crossProduct(left, right) {
  const [a, b] = pair(left, right);
  if (a.length !== 3) throw new UserError('vectorCrossInvalid');
  return {
    dimensions: 3,
    values: [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]].map(
      String,
    ),
  };
}
export function squaredNorm(text) {
  const a = vector(text);
  return { dimensions: a.length, squaredNorm: String(a.reduce((sum, v) => sum + v * v, 0n)) };
}
function reducedFraction(n, d) {
  let a = n < 0n ? -n : n,
    b = d;
  while (b) [a, b] = [b, a % b];
  return { numerator: String(n / a), denominator: String(d / a) };
}
export function squaredDistance(left, right) {
  const [a, b] = pair(left, right);
  return {
    dimensions: a.length,
    squaredDistance: String(a.reduce((sum, v, n) => sum + (v - b[n]) ** 2n, 0n)),
  };
}
export function projectVector(text, onto) {
  const [a, b] = pair(text, onto),
    denominator = b.reduce((sum, v) => sum + v * v, 0n);
  if (denominator === 0n) throw new UserError('vectorZeroInvalid');
  const dot = a.reduce((sum, v, n) => sum + v * b[n], 0n);
  return { dimensions: a.length, values: b.map((v) => reducedFraction(v * dot, denominator)) };
}
export function rejectVector(text, onto) {
  const [a, b] = pair(text, onto),
    denominator = b.reduce((sum, v) => sum + v * v, 0n);
  if (denominator === 0n) throw new UserError('vectorZeroInvalid');
  const dot = a.reduce((sum, v, n) => sum + v * b[n], 0n);
  return {
    dimensions: a.length,
    values: a.map((v, n) => reducedFraction(v * denominator - b[n] * dot, denominator)),
  };
}
