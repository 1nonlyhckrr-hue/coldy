import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforcePermissions, enforceHierarchy } from '../src/utils/permissions.js';
const i = {
  inGuild: () => true,
  user: { id: 'owner' },
  memberPermissions: { has: () => true },
  appPermissions: { has: () => true },
};
test('guild only, owner only, and user permissions fail closed', () => {
  assert.throws(() => enforcePermissions({ ...i, inGuild: () => false }, {}, { ownerIds: [] }));
  assert.throws(() => enforcePermissions(i, { ownerOnly: true }, { ownerIds: [] }));
  assert.throws(() =>
    enforcePermissions(
      { ...i, memberPermissions: { has: () => false } },
      { userPermissions: ['BanMembers'] },
      { ownerIds: [] },
    ),
  );
});
test('bot permissions required separately', () =>
  assert.throws(() =>
    enforcePermissions(
      { ...i, appPermissions: null },
      { botPermissions: ['BanMembers'] },
      { ownerIds: [] },
    ),
  ));
test('permissioned owner passes', () =>
  assert.doesNotThrow(() =>
    enforcePermissions(
      i,
      { ownerOnly: true, userPermissions: ['BanMembers'] },
      { ownerIds: ['owner'] },
    ),
  ));
const member = (id, n) => ({
  id,
  roles: { highest: { position: n, comparePositionTo: (other) => n - other.position } },
});
test('hierarchy protects owner, self, equal roles and bot role', () => {
  assert.throws(() => enforceHierarchy(member('a', 3), member('b', 5), member('o', 1), 'o'));
  assert.throws(() => enforceHierarchy(member('a', 3), member('b', 5), member('t', 3), 'o'));
  assert.throws(() => enforceHierarchy(member('o', 1), member('b', 5), member('t', 5), 'o'));
  assert.doesNotThrow(() => enforceHierarchy(member('o', 1), member('b', 5), member('t', 4), 'o'));
});
