import { TextDecoder } from 'node:util';
import { URLSearchParams } from 'node:url';
import { UserError } from '../utils/errors.js';
function input(text) {
  if (
    typeof text !== 'string' ||
    text.length < 1 ||
    text.length > 1200 ||
    /[\u0000]/u.test(text) ||
    !text.isWellFormed()
  )
    throw new UserError('textInputInvalid');
  return text;
}
export function htmlEncode(text) {
  return input(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
export function htmlDecode(text) {
  return input(text).replace(
    /&(amp|lt|gt|quot|#39);/g,
    (c) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[c],
  );
}
export function numberLines(text) {
  const lines = input(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 100) throw new UserError('textLinesInvalid');
  return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
}
export function csvEncode(text) {
  let values;
  try {
    values = JSON.parse(input(text));
  } catch {
    throw new UserError('textCsvInvalid');
  }
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 50 ||
    values.some((v) => typeof v !== 'string' || v.includes('\0') || !v.isWellFormed())
  )
    throw new UserError('textCsvInvalid');
  return values.map((v) => '"' + v.replace(/"/g, '""') + '"').join(',');
}
export function csvDecode(text) {
  const source = input(text),
    fields = [];
  let position = 0;
  while (true) {
    let value = '';
    if (source[position] === '"') {
      position++;
      let closed = false;
      while (position < source.length) {
        const c = source[position++];
        if (c === '"') {
          if (source[position] === '"') {
            value += '"';
            position++;
          } else {
            closed = true;
            break;
          }
        } else value += c;
      }
      if (!closed) throw new UserError('textCsvInvalid');
      if (position < source.length && source[position] !== ',')
        throw new UserError('textCsvInvalid');
    } else {
      while (position < source.length && source[position] !== ',') {
        const c = source[position++];
        if (/["\r\n]/.test(c)) throw new UserError('textCsvInvalid');
        value += c;
      }
    }
    fields.push(value);
    if (fields.length > 50) throw new UserError('textCsvInvalid');
    if (position === source.length) break;
    position++;
    if (position === source.length) {
      fields.push('');
      if (fields.length > 50) throw new UserError('textCsvInvalid');
      break;
    }
  }
  return JSON.stringify(fields, null, 2) + '\n';
}
export function jsonQuote(text) {
  return JSON.stringify(input(text));
}
export function replaceLiteral(text, find, replacement) {
  const value = input(text);
  if (
    typeof find !== 'string' ||
    find.length < 1 ||
    find.length > 200 ||
    find.includes('\0') ||
    !find.isWellFormed() ||
    typeof replacement !== 'string' ||
    replacement.length > 200 ||
    replacement.includes('\0') ||
    !replacement.isWellFormed()
  )
    throw new UserError('textReplaceInvalid');
  let count = 0,
    position = 0,
    output = '';
  while (true) {
    const next = value.indexOf(find, position);
    if (next === -1) {
      output += value.slice(position);
      break;
    }
    count++;
    output += value.slice(position, next) + replacement;
    position = next + find.length;
  }
  return { count, text: output };
}
export function findLiteralLines(text, find) {
  const lines = input(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 100) throw new UserError('textLinesInvalid');
  if (
    typeof find !== 'string' ||
    find.length < 1 ||
    find.length > 200 ||
    /[\u0000\r\n]/u.test(find) ||
    !find.isWellFormed()
  )
    throw new UserError('textReplaceInvalid');
  return lines.flatMap((line, index) =>
    line.includes(find) ? [{ line: index + 1, text: line }] : [],
  );
}
export function sliceCodepoints(text, start, count) {
  const points = Array.from(input(text));
  if (
    !Number.isInteger(start) ||
    start < 1 ||
    start > 1200 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1200 ||
    start > points.length ||
    start - 1 + count > points.length
  )
    throw new UserError('textSliceInvalid');
  return points.slice(start - 1, start - 1 + count).join('');
}
export function queryEncode(text) {
  let pairs;
  try {
    pairs = JSON.parse(input(text));
  } catch {
    throw new UserError('textQueryInvalid');
  }
  if (
    !Array.isArray(pairs) ||
    pairs.length < 1 ||
    pairs.length > 50 ||
    pairs.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => typeof v !== 'string' || v.includes('\0') || !v.isWellFormed()),
    )
  )
    throw new UserError('textQueryInvalid');
  return new URLSearchParams(pairs).toString();
}
export function queryDecode(text) {
  const value = input(text);
  if (value.startsWith('?') || value.includes('#')) throw new UserError('textQueryInvalid');
  const pairs = value.split('&').map((part) => {
    const at = part.indexOf('='),
      raw = at === -1 ? [part, ''] : [part.slice(0, at), part.slice(at + 1)];
    try {
      return raw.map((v) => decodeURIComponent(v.replace(/\+/g, ' ')));
    } catch {
      throw new UserError('textQueryInvalid');
    }
  });
  if (pairs.length > 50 || pairs.some((p) => p.some((v) => v.includes('\0') || !v.isWellFormed())))
    throw new UserError('textQueryInvalid');
  return JSON.stringify(pairs, null, 2) + '\n';
}
export function urlParts(text) {
  const value = input(text);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserError('textUrlInvalid');
  }
  if (
    value !== value.trim() ||
    /[\u0001-\u0020\u007f\\]/u.test(value) ||
    !/^https?:\/\//i.test(value) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new UserError('textUrlInvalid');
  return (
    JSON.stringify(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        normalized: url.href,
      },
      null,
      2,
    ) + '\n'
  );
}
export function hexEncode(text) {
  return Buffer.from(input(text), 'utf8').toString('hex');
}
export function hexDecode(text) {
  const value = input(text);
  if (!/^(?:[a-fA-F0-9]{2})+$/.test(value)) throw new UserError('textHexInvalid');
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(value, 'hex'),
    );
  } catch {
    throw new UserError('textHexInvalid');
  }
  if (decoded.includes('\0') || !decoded.isWellFormed()) throw new UserError('textHexInvalid');
  return decoded;
}
export function jsonUnquote(text) {
  let value;
  try {
    value = JSON.parse(input(text));
  } catch {
    throw new UserError('textJsonStringInvalid');
  }
  if (typeof value !== 'string' || value.includes('\0') || !value.isWellFormed())
    throw new UserError('textJsonStringInvalid');
  return value;
}
function jsonDocument(text) {
  try {
    return JSON.parse(input(text));
  } catch {
    throw new UserError('textJsonDocumentInvalid');
  }
}
export function jsonKeys(text) {
  const value = jsonDocument(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new UserError('textJsonDocumentInvalid');
  return JSON.stringify(Object.keys(value), null, 2) + '\n';
}
export function jsonPointer(text, pointer) {
  const value = jsonDocument(text);
  if (
    typeof pointer !== 'string' ||
    pointer.length > 200 ||
    !pointer.isWellFormed() ||
    pointer.includes('\0') ||
    (pointer !== '' && !pointer.startsWith('/')) ||
    /~(?:[^01]|$)/u.test(pointer)
  )
    throw new UserError('textJsonPointerInvalid');
  let current = value;
  for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, key) ||
      (Array.isArray(current) && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      throw new UserError('textJsonPointerMissing');
    current = current[key];
  }
  return JSON.stringify(current, null, 2) + '\n';
}
export function jsonArrayTypes(text) {
  const value = jsonDocument(text);
  if (!Array.isArray(value)) throw new UserError('textJsonDocumentInvalid');
  const counts = { null: 0, boolean: 0, number: 0, string: 0, array: 0, object: 0 };
  for (const item of value)
    counts[item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item]++;
  return JSON.stringify({ length: value.length, counts }, null, 2) + '\n';
}
function separatorValue(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 200 ||
    value.includes('\0') ||
    !value.isWellFormed()
  )
    throw new UserError('textSeparatorInvalid');
  return value;
}
export function splitLiteral(text, separator) {
  const values = input(text).split(separatorValue(separator));
  return JSON.stringify(values, null, 2) + '\n';
}
export function joinStrings(text, separator) {
  let values;
  try {
    values = JSON.parse(input(text));
  } catch {
    throw new UserError('textJoinInvalid');
  }
  if (
    !Array.isArray(values) ||
    values.length > 100 ||
    values.some((v) => typeof v !== 'string' || v.includes('\0') || !v.isWellFormed())
  )
    throw new UserError('textJoinInvalid');
  if (
    typeof separator !== 'string' ||
    separator.length > 200 ||
    separator.includes('\0') ||
    !separator.isWellFormed()
  )
    throw new UserError('textSeparatorInvalid');
  return values.join(separator);
}
export function reverseLines(text) {
  const lines = input(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 100) throw new UserError('textLinesInvalid');
  return lines.reverse().join('\n');
}
export function indentLines(text, spaces, remove = false) {
  const lines = input(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 100) throw new UserError('textLinesInvalid');
  if (!Number.isInteger(spaces) || spaces < 1 || spaces > 16)
    throw new UserError('textIndentInvalid');
  return lines
    .map((line) =>
      remove ? line.replace(new RegExp('^ {0,' + spaces + '}'), '') : ' '.repeat(spaces) + line,
    )
    .join('\n');
}
export function lineEndings(text, style) {
  const value = input(text);
  if (!['lf', 'crlf'].includes(style)) throw new UserError('textLineEndingInvalid');
  return value.replace(/\r\n?|\n/g, style === 'lf' ? '\n' : '\r\n');
}
