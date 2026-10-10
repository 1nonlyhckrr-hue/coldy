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
