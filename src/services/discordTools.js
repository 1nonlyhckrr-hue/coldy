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
