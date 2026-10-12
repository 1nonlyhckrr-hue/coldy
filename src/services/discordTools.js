import { createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { resolveZonedTime } from './zonedTime.js';
import { UserError } from '../utils/errors.js';
export const TIMESTAMP_STYLES = ['t', 'T', 'd', 'D', 'f', 'F', 's', 'S', 'R'];
export function decodeSnowflake(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value))
    throw new UserError('toolsSnowflakeInvalid');
  const id = BigInt(value);
  if (id > (1n << 64n) - 1n) throw new UserError('toolsSnowflakeInvalid');
  const milliseconds = Number((id >> 22n) + 1420070400000n);
  return {
    id: value,
    milliseconds,
    iso: new Date(milliseconds).toISOString(),
    worker: Number((id >> 17n) & 31n),
    process: Number((id >> 12n) & 31n),
    increment: Number(id & 4095n),
  };
}
export function timestampMarkup(seconds, style) {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > 253402300799 ||
    !TIMESTAMP_STYLES.includes(style)
  )
    throw new UserError('toolsTimestampInvalid');
  return { markup: `<t:${seconds}:${style}>`, iso: new Date(seconds * 1000).toISOString() };
}
export function decodeColor(value) {
  if (typeof value !== 'string' || !/^#?[a-fA-F0-9]{6}$/.test(value))
    throw new UserError('toolsColorInvalid');
  const hex = value.replace('#', '').toUpperCase(),
    decimal = parseInt(hex, 16);
  return {
    hex: '#' + hex,
    decimal,
    red: (decimal >> 16) & 255,
    green: (decimal >> 8) & 255,
    blue: decimal & 255,
  };
}

export function localTimestamp(local, zone, style = 'f') {
  const r = resolveZonedTime(local, zone),
    seconds = r.dueAt / 1000;
  return { ...r, ...timestampMarkup(seconds, style), seconds };
}
export function showInZone(seconds, zone) {
  timestampMarkup(seconds, 'f');
  if (
    typeof zone !== 'string' ||
    zone.length > 80 ||
    !(zone === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone))
  )
    throw new UserError('automationZoneFormat');
  let f;
  try {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new UserError('automationZoneInvalid');
  }
  const p = Object.fromEntries(f.formatToParts(seconds * 1000).map((v) => [v.type, v.value]));
  return {
    zone: f.resolvedOptions().timeZone,
    local: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`,
  };
}
export function timeDifference(start, end) {
  timestampMarkup(start, 'f');
  timestampMarkup(end, 'f');
  const seconds = end - start,
    absolute = Math.abs(seconds);
  return {
    seconds,
    days: Math.floor(absolute / 86400),
    hours: Math.floor((absolute % 86400) / 3600),
    minutes: Math.floor((absolute % 3600) / 60),
    remainder: absolute % 60,
  };
}

export function decodePermissions(value) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
    BigInt(value) > (1n << 64n) - 1n
  )
    throw new UserError('toolsPermissionsInvalid');
  const bits = BigInt(value),
    entries = Object.entries(PermissionFlagsBits),
    known = entries.reduce((n, [, f]) => n | f, 0n);
  return {
    bits: value,
    flags: entries
      .filter(([, f]) => (bits & f) === f)
      .map(([name]) => name)
      .sort(),
    unknown: String(bits & ~known),
    administrator: (bits & PermissionFlagsBits.Administrator) !== 0n,
  };
}
export function rgbColor(red, green, blue) {
  if ([red, green, blue].some((v) => !Number.isInteger(v) || v < 0 || v > 255))
    throw new UserError('toolsColorInvalid');
  return decodeColor([red, green, blue].map((v) => v.toString(16).padStart(2, '0')).join(''));
}
export function isoTimestamp(value, style = 'f') {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new UserError('toolsIsoInvalid');
  const local = value.slice(0, 19),
    localMs = Date.parse(local + 'Z');
  if (!Number.isFinite(localMs) || new Date(localMs).toISOString().slice(0, 19) !== local)
    throw new UserError('toolsIsoInvalid');
  if (value.endsWith('Z') === false) {
    const offset = value.slice(-5),
      [h, m] = offset.split(':').map(Number);
    if (h > 14 || m > 59 || (h === 14 && m !== 0)) throw new UserError('toolsIsoInvalid');
  }
  const seconds = Date.parse(value) / 1000;
  try {
    return { seconds, ...timestampMarkup(seconds, style) };
  } catch {
    throw new UserError('toolsIsoInvalid');
  }
}

export function parseDuration(value) {
  if (typeof value !== 'string' || value.length > 80 || !/^(?:[1-9][0-9]*[dhms])+$/.test(value))
    throw new UserError('toolsDurationInvalid');
  const units = { d: 86400, h: 3600, m: 60, s: 1 };
  let seconds = 0,
    last = Infinity;
  for (const match of value.matchAll(/([1-9][0-9]*)([dhms])/g)) {
    const scale = units[match[2]],
      amount = Number(match[1]);
    if (scale >= last || !Number.isSafeInteger(amount)) throw new UserError('toolsDurationInvalid');
    seconds += amount * scale;
    last = scale;
    if (!Number.isSafeInteger(seconds) || seconds > 31536000)
      throw new UserError('toolsDurationInvalid');
  }
  return { seconds, ...timeDifference(0, seconds) };
}
export function textStatistics(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1200 || value.includes('\0'))
    throw new UserError('toolsTextInvalid');
  const segments = [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)];
  return {
    units: value.length,
    points: [...value].length,
    graphemes: segments.length,
    bytes: Buffer.byteLength(value, 'utf8'),
    lines: value.split(/\r\n|\r|\n/).length,
  };
}
export function escapeText(value) {
  textStatistics(value);
  // Backslash first; neutralize mentions separately, without changing the supplied text's intent.
  return value.replace(/[\\`*_~|>#[\]()]/g, '\\$&').replaceAll('@', '@\u200b');
}

export function textDigest(text) {
  textStatistics(text);
  return {
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}
export function formatJson(text) {
  if (typeof text !== 'string' || text.length < 1 || text.length > 1800)
    throw new UserError('toolsJsonInvalid');
  try {
    // Keep original number spelling/duplicate keys rather than silently rounding/dropping data.
    const tokens = text.match(/"(?:\\.|[^"\\])*"|[^"\s]+|\s+/g);
    if (!tokens || tokens.join('') !== text) throw Error('tokens');
    JSON.parse(text);
    const raw = text.match(
      /"(?:\\.|[^"\\])*"|true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[{}\[\],:]/g,
    );
    if (!raw) throw Error('tokens');
    let indent = 0,
      result = '',
      previous = '';
    const line = () => {
      result += '\n' + '  '.repeat(indent);
    };
    for (const token of raw) {
      if (token === '{' || token === '[') {
        result += token;
        indent++;
      } else if (token === '}' || token === ']') {
        indent--;
        if (previous !== '{' && previous !== '[') line();
        result += token;
      } else if (token === ',') {
        result += token;
        line();
      } else if (token === ':') result += ': ';
      else {
        if (previous === '{' || previous === '[') line();
        result += token;
      }
      previous = token;
    }
    return result + '\n';
  } catch {
    throw new UserError('toolsJsonInvalid');
  }
}
export function normalizeText(text, form) {
  textStatistics(text);
  if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(form)) throw new UserError('toolsNormalizeInvalid');
  return text.normalize(form);
}

export function encodeBase64(text) {
  textStatistics(text);
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.toString('utf8') !== text) throw new UserError('toolsEncodingInvalid');
  return bytes.toString('base64');
}
export function decodeBase64(text) {
  if (
    typeof text !== 'string' ||
    text.length < 1 ||
    text.length > 1600 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
  )
    throw new UserError('toolsEncodingInvalid');
  const bytes = Buffer.from(text, 'base64'),
    output = bytes.toString('utf8');
  if (bytes.toString('base64') !== text || !Buffer.from(output, 'utf8').equals(bytes))
    throw new UserError('toolsEncodingInvalid');
  textStatistics(output);
  return output;
}
export function urlComponent(text, direction) {
  textStatistics(text);
  if (!['encode', 'decode'].includes(direction)) throw new UserError('toolsEncodingInvalid');
  try {
    const out = direction === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text);
    if (out.includes('\0') || out.length > 3600) throw Error('invalid');
    return out;
  } catch {
    throw new UserError('toolsEncodingInvalid');
  }
}

export function integerStatistics(text) {
  if (
    typeof text !== 'string' ||
    text.length > 219 ||
    !/^-?(?:0|[1-9][0-9]*)(?:\|-?(?:0|[1-9][0-9]*)){1,19}$/.test(text)
  )
    throw new UserError('toolsIntegerInvalid');
  const values = text.split('|').map(Number);
  if (values.some((v) => !Number.isSafeInteger(v) || Math.abs(v) > 1000000))
    throw new UserError('toolsIntegerInvalid');
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length,
    total = values.reduce((a, b) => a + b, 0);
  return {
    count: n,
    total,
    minimum: sorted[0],
    maximum: sorted[n - 1],
    mean: total / n,
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
  };
}
export function integerFactors(a, b) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    a < 1 ||
    b < 1 ||
    a > 1000000000 ||
    b > 1000000000
  )
    throw new UserError('toolsIntegerInvalid');
  let x = a,
    y = b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return { gcd: x, lcm: ((BigInt(a) / BigInt(x)) * BigInt(b)).toString() };
}
export function convertIntegerBase(text, from, to) {
  if (
    typeof text !== 'string' ||
    text.length < 1 ||
    text.length > 64 ||
    ![2, 8, 10, 16].includes(from) ||
    ![2, 8, 10, 16].includes(to)
  )
    throw new UserError('toolsIntegerInvalid');
  const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-fA-F]+$/ };
  if (!valid[from].test(text)) throw new UserError('toolsIntegerInvalid');
  let value = 0n;
  for (const digit of text) {
    value = value * BigInt(from) + BigInt(parseInt(digit, 16));
    if (value > (1n << 64n) - 1n) throw new UserError('toolsIntegerInvalid');
  }
  return { from, to, value: value.toString(to).toUpperCase() };
}

function suppliedLines(text) {
  textStatistics(text);
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 100) throw new UserError('toolsTextInvalid');
  return lines;
}
export function sortTextLines(text, direction) {
  const lines = suppliedLines(text);
  if (!['ascending', 'descending'].includes(direction)) throw new UserError('toolsTextInvalid');
  const sorted = lines.sort((a, b) =>
    a === b ? 0 : (a < b ? -1 : 1) * (direction === 'ascending' ? 1 : -1),
  );
  return sorted.join('\n');
}
export function uniqueTextLines(text) {
  return [...new Set(suppliedLines(text))].join('\n');
}
export function compareTextLines(left, right) {
  const a = new Set(suppliedLines(left)),
    b = new Set(suppliedLines(right));
  return {
    onlyLeft: [...a].filter((v) => !b.has(v)),
    onlyRight: [...b].filter((v) => !a.has(v)),
    common: [...a].filter((v) => b.has(v)),
  };
}
