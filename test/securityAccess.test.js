import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { SecurityAccess, requireSecurityAccess } from '../src/services/securityAccess.js';
const owner = '100000000000000001',
  delegate = '100000000000000002',
  admin = '100000000000000003',
  nobody = '100000000000000004';
function inter(userId, perms = []) {
  return {
    user: { id: userId },
    guildId: 'g',
    guild: {
      members: {
        fetch: async () => ({ id: userId, permissions: { has: (f) => perms.includes(f) } }),
      },
    },
  };
}
test('nobody is allowed by default; owner and delegates are; Administrators are not', async () => {
  const db = openDatabase(':memory:');
  try {
    const c = { config: { ownerIds: [owner] }, securityAccess: new SecurityAccess(db) };
    await assert.rejects(() => requireSecurityAccess(inter(nobody), c, 'lockdown'), {
      message: 'securityDenied',
    });
    await assert.rejects(
      () => requireSecurityAccess(inter(nobody, [P.ManageGuild]), c, 'lockdown'),
      {
        message: 'securityDenied',
      },
    );
    assert.equal(await requireSecurityAccess(inter(owner), c, 'lockdown'), 'owner');
    await assert.rejects(
      () => requireSecurityAccess(inter(admin, [P.Administrator]), c, 'lockdown'),
      { message: 'securityDenied' },
    );
    c.securityAccess.allow('g', delegate, 'lockdown', owner);
    assert.equal(await requireSecurityAccess(inter(delegate), c, 'lockdown'), 'delegate');
    assert.equal(c.securityAccess.delegated('other', delegate, 'lockdown'), false);
    assert.equal(c.securityAccess.revoke('g', delegate, 'lockdown'), 1);
    await assert.rejects(() => requireSecurityAccess(inter(delegate), c, 'lockdown'), {
      message: 'securityDenied',
    });
    c.securityAccess.allow('g', delegate, 'all', owner);
    assert.equal(await requireSecurityAccess(inter(delegate), c, 'lockdown'), 'delegate');
    assert.equal(c.securityAccess.list('g').length, 1);
    assert.equal(c.securityAccess.revoke('g', delegate), 1);
    assert.throws(() => c.securityAccess.allow('g', delegate, 'nope', owner), {
      message: 'securityAccessInvalid',
    });
    assert.throws(() => c.securityAccess.allow('g', 'x', 'all', owner), {
      message: 'securityAccessInvalid',
    });
  } finally {
    db.close();
  }
});
