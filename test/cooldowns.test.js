import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cooldowns } from '../src/services/cooldowns.js';
test('cooldowns expire, isolate users and stay bounded', () => {
  let now = 100;
  const c = new Cooldowns(() => now, 2);
  assert.equal(c.acquire('a', 1000), 0);
  assert.equal(c.acquire('a', 1000), 1000);
  assert.equal(c.acquire('b', 1000), 0);
  c.acquire('c', 1000);
  assert.equal(c.entries.size, 2);
  now = 1200;
  assert.equal(c.acquire('b', 1000), 0);
  assert.equal(c.entries.size, 1);
});

test('cooldown saturation refuses new keys without evicting active protection', () => {
  let now = 100;
  const c = new Cooldowns(() => now, 2);
  assert.equal(c.acquire('a', 1000), 0);
  assert.equal(c.acquire('b', 2000), 0);
  assert.equal(c.acquire('new', 500), 1000);
  assert.equal(c.acquire('a', 1000), 1000);
  assert(!c.entries.has('new'));
  assert(c.entries.has('a'));
  now = 1100;
  assert.equal(c.acquire('new', 500), 0);
  assert.equal(c.acquire('b', 2000), 1000);
  assert.equal(c.entries.size, 2);
});
test('cooldown invalid configuration/key/duration does not poison or bypass existing guards', () => {
  for (const max of [0, -1, 1.5, 100001, NaN, '2'])
    assert.throws(() => new Cooldowns(() => 100, max), /configuration/);
  assert.throws(() => new Cooldowns(100, 2), /configuration/);
  const c = new Cooldowns(() => 100, 2);
  c.acquire('safe', 1000);
  const before = [...c.entries];
  for (const duration of [0, -1, NaN, Infinity, 1.5, 86400001, '1000'])
    assert.throws(() => c.acquire('new', duration), /request/);
  for (const key of ['', null, {}, 'a'.repeat(501)])
    assert.throws(() => c.acquire(key, 1000), /request/);
  assert.deepEqual([...c.entries], before);
  assert.equal(c.acquire('safe', 1000), 1000);
});
test('cooldown invalid clock fails before cleanup/mutation and valid boundary expires exactly', () => {
  let now = 100;
  const c = new Cooldowns(() => now, 2);
  c.acquire('safe', 1000);
  const before = [...c.entries];
  for (const bad of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER]) {
    now = bad;
    assert.throws(() => c.acquire('new', 1000), /clock/);
    assert.deepEqual([...c.entries], before);
  }
  now = 1100;
  assert.equal(c.acquire('safe', 1), 0);
  assert.equal(c.acquire('safe', 1), 1);
  now++;
  assert.equal(c.acquire('safe', 1), 0);
});

test('cooldown negative and fractional clocks refuse before cleanup or guard changes', () => {
  let clock = 1000;
  const c = new Cooldowns(() => clock);
  assert.equal(c.acquire('existing', 100), 0);
  const before = [...c.entries];
  for (const value of [-1, -1000, -0.5, 1000.5]) {
    clock = value;
    assert.throws(() => c.acquire('new', 100), /clock/);
    assert.deepEqual([...c.entries], before);
  }
  clock = 1001;
  assert.equal(c.acquire('existing', 100), 99);
});
test('cooldown accepts zero clock and safe maximum expiry boundary without overflow', () => {
  let clock = 0;
  const c = new Cooldowns(() => clock);
  assert.equal(c.acquire('zero', 1), 0);
  clock = 1;
  assert.equal(c.acquire('zero', 1), 0);
  clock = Number.MAX_SAFE_INTEGER - 1;
  assert.equal(c.acquire('maximum', 1), 0);
  const before = [...c.entries];
  assert.throws(() => c.acquire('overflow', 2), /clock/);
  assert.deepEqual([...c.entries], before);
});
