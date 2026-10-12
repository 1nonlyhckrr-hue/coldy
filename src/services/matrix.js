import { UserError } from '../utils/errors.js';
function parseMatrix(text) {
  let rows;
  try {
    if (typeof text !== 'string' || text.length > 1200) throw Error();
    rows = JSON.parse(text);
  } catch {
    throw new UserError('matrixInputInvalid');
  }
  if (
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 4 ||
    rows.some(
      (row) =>
        !Array.isArray(row) ||
        row.length < 1 ||
        row.length > 4 ||
        row.length !== rows[0].length ||
        row.some((v) => !Number.isSafeInteger(v) || Math.abs(v) > 1000000),
    )
  )
    throw new UserError('matrixInputInvalid');
  return rows.map((row) => row.map(BigInt));
}
export function transposeMatrix(text) {
  const rows = parseMatrix(text);
  return {
    rows: rows[0].length,
    columns: rows.length,
    values: rows[0].map((_, c) => rows.map((row) => String(row[c]))),
  };
}
export function multiplyMatrices(left, right) {
  const a = parseMatrix(left),
    b = parseMatrix(right);
  if (a[0].length !== b.length) throw new UserError('matrixDimensionsInvalid');
  const values = a.map((row) =>
    b[0].map((_, c) => String(row.reduce((sum, v, n) => sum + v * b[n][c], 0n))),
  );
  return { rows: a.length, columns: b[0].length, values };
}
function determinant(rows) {
  if (rows.length === 1) return rows[0][0];
  return rows[0].reduce(
    (sum, v, c) =>
      sum +
      (c % 2 ? -v : v) * determinant(rows.slice(1).map((row) => row.filter((_, n) => n !== c))),
    0n,
  );
}
export function matrixDeterminant(text) {
  const rows = parseMatrix(text);
  if (rows.length !== rows[0].length) throw new UserError('matrixSquareInvalid');
  return { size: rows.length, determinant: String(determinant(rows)) };
}
function reportMatrix(rows) {
  return { rows: rows.length, columns: rows[0].length, values: rows.map((row) => row.map(String)) };
}
export function addMatrices(left, right) {
  const a = parseMatrix(left),
    b = parseMatrix(right);
  if (a.length !== b.length || a[0].length !== b[0].length)
    throw new UserError('matrixEqualShapeInvalid');
  return reportMatrix(a.map((row, r) => row.map((v, c) => v + b[r][c])));
}
export function scaleMatrix(text, scalar) {
  const a = parseMatrix(text);
  if (!Number.isSafeInteger(scalar) || Math.abs(scalar) > 1000000)
    throw new UserError('matrixScalarInvalid');
  return reportMatrix(a.map((row) => row.map((v) => v * BigInt(scalar))));
}
export function powerMatrix(text, exponent) {
  const a = parseMatrix(text);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 10)
    throw new UserError('matrixPowerInvalid');
  let result = a.map((row, r) => row.map((_, c) => (r === c ? 1n : 0n)));
  for (let n = 0; n < exponent; n++)
    result = result.map((row) =>
      a[0].map((_, c) => row.reduce((sum, v, k) => sum + v * a[k][c], 0n)),
    );
  return reportMatrix(result);
}
function fraction(n, d = 1n) {
  if (d === 0n) throw new UserError('matrixSingularInvalid');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let a = n < 0n ? -n : n,
    b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
function subtractFraction(a, b) {
  return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
}
function multiplyFraction(a, b) {
  return fraction(a.n * b.n, a.d * b.d);
}
function divideFraction(a, b) {
  return fraction(a.n * b.d, a.d * b.n);
}
function rationalElimination(rows, coefficientColumns) {
  const values = rows.map((row) => row.map((v) => fraction(v)));
  let rank = 0;
  for (let column = 0; column < coefficientColumns && rank < values.length; column++) {
    const pivot = values.findIndex((row, n) => n >= rank && row[column].n !== 0n);
    if (pivot < 0) continue;
    [values[rank], values[pivot]] = [values[pivot], values[rank]];
    const divisor = values[rank][column];
    values[rank] = values[rank].map((v) => divideFraction(v, divisor));
    for (let row = 0; row < values.length; row++) {
      if (row === rank) continue;
      const factor = values[row][column];
      values[row] = values[row].map((v, c) =>
        subtractFraction(v, multiplyFraction(factor, values[rank][c])),
      );
    }
    rank++;
  }
  return { rank, values };
}
function rationalOutput(rows) {
  return rows.map((row) => row.map((v) => ({ numerator: String(v.n), denominator: String(v.d) })));
}
export function matrixRank(text) {
  const a = parseMatrix(text);
  return { rows: a.length, columns: a[0].length, rank: rationalElimination(a, a[0].length).rank };
}
export function inverseMatrix(text) {
  const a = parseMatrix(text);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  const augmented = a.map((row, r) => [...row, ...row.map((_, c) => (r === c ? 1n : 0n))]);
  const reduced = rationalElimination(augmented, a.length);
  if (reduced.rank !== a.length) throw new UserError('matrixSingularInvalid');
  return {
    rows: a.length,
    columns: a.length,
    values: rationalOutput(reduced.values.map((row) => row.slice(a.length))),
  };
}
export function solveMatrix(text, right) {
  const a = parseMatrix(text),
    b = parseMatrix(right);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  if (b.length !== a.length || b[0].length !== 1) throw new UserError('matrixVectorInvalid');
  const reduced = rationalElimination(
    a.map((row, n) => [...row, b[n][0]]),
    a.length,
  );
  if (reduced.rank !== a.length) throw new UserError('matrixSingularInvalid');
  return {
    variables: a.length,
    values: rationalOutput(reduced.values.map((row) => [row[a.length]])).map((row) => row[0]),
  };
}
export function matrixTrace(text) {
  const a = parseMatrix(text);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  return { size: a.length, trace: String(a.reduce((sum, row, n) => sum + row[n], 0n)) };
}
function reducedMatrix(text) {
  const a = parseMatrix(text);
  const reduced = rationalElimination(a, a[0].length);
  const pivotColumns = reduced.values
    .slice(0, reduced.rank)
    .map((row) => row.findIndex((v) => v.n !== 0n));
  return { a, ...reduced, pivotColumns };
}
export function matrixRref(text) {
  const result = reducedMatrix(text);
  return {
    rows: result.a.length,
    columns: result.a[0].length,
    rank: result.rank,
    pivotColumns: result.pivotColumns,
    values: rationalOutput(result.values),
  };
}
export function matrixNullspace(text) {
  const result = reducedMatrix(text),
    columns = result.a[0].length;
  const freeColumns = Array.from({ length: columns }, (_, n) => n).filter(
    (n) => !result.pivotColumns.includes(n),
  );
  const basis = freeColumns.map((free) => {
    const vector = Array.from({ length: columns }, (_, n) => fraction(n === free ? 1n : 0n));
    result.pivotColumns.forEach((pivot, row) => {
      vector[pivot] = fraction(-result.values[row][free].n, result.values[row][free].d);
    });
    return vector;
  });
  return {
    rows: result.a.length,
    columns,
    rank: result.rank,
    nullity: freeColumns.length,
    freeColumns,
    basis: rationalOutput(basis),
  };
}
export function subtractMatrices(left, right) {
  const a = parseMatrix(left),
    b = parseMatrix(right);
  if (a.length !== b.length || a[0].length !== b[0].length)
    throw new UserError('matrixEqualShapeInvalid');
  return reportMatrix(a.map((row, r) => row.map((v, c) => v - b[r][c])));
}
function cofactors(rows) {
  return rows.map((row, r) =>
    row.map((_, c) =>
      rows.length === 1
        ? 1n
        : ((r + c) % 2 ? -1n : 1n) *
          determinant(rows.filter((_, n) => n !== r).map((v) => v.filter((_, n) => n !== c))),
    ),
  );
}
export function cofactorMatrix(text) {
  const a = parseMatrix(text);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  return reportMatrix(cofactors(a));
}
export function adjugateMatrix(text) {
  const a = parseMatrix(text);
  if (a.length !== a[0].length) throw new UserError('matrixSquareInvalid');
  const c = cofactors(a);
  return reportMatrix(c[0].map((_, n) => c.map((row) => row[n])));
}
export function matrixRowspace(text) {
  const result = reducedMatrix(text);
  return {
    rows: result.a.length,
    columns: result.a[0].length,
    rank: result.rank,
    basis: rationalOutput(result.values.slice(0, result.rank)),
  };
}
export function matrixColumnspace(text) {
  const result = reducedMatrix(text);
  return {
    rows: result.a.length,
    columns: result.a[0].length,
    rank: result.rank,
    pivotColumns: result.pivotColumns,
    basis: result.pivotColumns.map((c) => result.a.map((row) => String(row[c]))),
  };
}
export function solveGeneralMatrix(text, right) {
  const a = parseMatrix(text),
    b = parseMatrix(right);
  if (b.length !== a.length || b[0].length !== 1) throw new UserError('matrixVectorInvalid');
  const columns = a[0].length;
  const reduced = rationalElimination(
    a.map((row, n) => [...row, b[n][0]]),
    columns,
  );
  if (
    reduced.values.some(
      (row) => row.slice(0, columns).every((v) => v.n === 0n) && row[columns].n !== 0n,
    )
  )
    return { rows: a.length, columns, rank: reduced.rank, status: 'inconsistent' };
  const pivotColumns = reduced.values
    .slice(0, reduced.rank)
    .map((row) => row.slice(0, columns).findIndex((v) => v.n !== 0n));
  const particular = Array.from({ length: columns }, () => fraction(0n));
  pivotColumns.forEach((pivot, row) => {
    particular[pivot] = reduced.values[row][columns];
  });
  const nullspace = matrixNullspace(text);
  return {
    rows: a.length,
    columns,
    rank: reduced.rank,
    status: nullspace.nullity ? 'infinite' : 'unique',
    particular: rationalOutput([particular])[0],
    freeColumns: nullspace.freeColumns,
    basis: nullspace.basis,
  };
}
