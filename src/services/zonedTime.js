import { UserError } from '../utils/errors.js';
export function resolveZonedTime(local, zone) {
  if (
    typeof local !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local) ||
    typeof zone !== 'string' ||
    zone.length > 80 ||
    !(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone) || zone === 'UTC')
  )
    throw new UserError('automationZoneFormat');
  const nominal = Date.parse(local + 'Z');
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== local)
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
  const stamp = (ms) => {
    const p = Object.fromEntries(f.formatToParts(ms).map((v) => [v.type, v.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const at = nominal + hours * 3600000;
    offsets.add(Date.parse(stamp(at) + 'Z') - at);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((ms) => stamp(ms) === local)
    .sort((a, b) => a - b);
  if (matches.length === 0) throw new UserError('automationZoneGap');
  if (matches.length !== 1) throw new UserError('automationZoneOverlap');
  return {
    dueAt: matches[0],
    zone: f.resolvedOptions().timeZone,
    iso: new Date(matches[0]).toISOString(),
  };
}
