import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveZonedTime } from '../src/services/zonedTime.js';
test('named timezone resolves exact local datetime into unique current runtime offset', () => {
  assert.equal(
    resolveZonedTime('2026-10-12T09:00:00', 'Asia/Kolkata').iso,
    '2026-10-12T03:30:00.000Z',
  );
  assert.equal(
    resolveZonedTime('2026-01-12T09:00:00', 'America/New_York').iso,
    '2026-01-12T14:00:00.000Z',
  );
  assert.equal(
    resolveZonedTime('2026-07-12T09:00:00', 'America/New_York').iso,
    '2026-07-12T13:00:00.000Z',
  );
  assert.equal(resolveZonedTime('2026-10-12T00:00:00', 'UTC').iso, '2026-10-12T00:00:00.000Z');
});
test('DST missing/ambiguous times reject instead of silently shifting or choosing one', () => {
  assert.throws(
    () => resolveZonedTime('2026-03-08T02:30:00', 'America/New_York'),
    /automationZoneGap/,
  );
  assert.throws(
    () => resolveZonedTime('2026-11-01T01:30:00', 'America/New_York'),
    /automationZoneOverlap/,
  );
  assert.throws(
    () => resolveZonedTime('2026-10-04T02:15:00', 'Australia/Lord_Howe'),
    /automationZoneGap/,
  );
  assert.throws(
    () => resolveZonedTime('2026-04-05T01:45:00', 'Australia/Lord_Howe'),
    /automationZoneOverlap/,
  );
});
test('strict calendar and zone input bounds reject normalized calendar/offset aliases', () => {
  for (const [local, zone] of [
    ['2026-02-30T09:00:00', 'UTC'],
    ['2026-10-12T25:00:00', 'UTC'],
    ['2026-10-12T09:00:00Z', 'UTC'],
    ['2026-10-12T09:00:00', '+05:30'],
    ['2026-10-12T09:00:00', 'Not/A_Zone'],
    ['2026-10-12T09:00:00', 'a'.repeat(81)],
  ])
    assert.throws(() => resolveZonedTime(local, zone));
});
