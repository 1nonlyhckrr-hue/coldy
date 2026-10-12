import { UserError } from '../utils/errors.js';
// Who may run Emika's opt-in security commands: bot owners (OWNER_IDS), users a bot owner delegated
// in this server. Server Administrators get no automatic access. Nothing is granted by default.
export const SECURITY_FEATURES = [
  'all',
  'lockdown',
  'backup',
  'unban',
  'joinraid',
  'antinuke',
  'verification',
  'activity',
];
export class SecurityAccess {
  constructor(db) {
    this.db = db;
  }
  allow(guildId, userId, feature, grantedBy) {
    if (!SECURITY_FEATURES.includes(feature) || !/^\d{17,20}$/.test(userId))
      throw new UserError('securityAccessInvalid');
    this.db
      .prepare('INSERT OR REPLACE INTO security_access VALUES(?,?,?,?,?)')
      .run(guildId, userId, feature, grantedBy, Date.now());
  }
  revoke(guildId, userId, feature = null) {
    return feature
      ? this.db
          .prepare('DELETE FROM security_access WHERE guild_id=? AND user_id=? AND feature=?')
          .run(guildId, userId, feature).changes
      : this.db
          .prepare('DELETE FROM security_access WHERE guild_id=? AND user_id=?')
          .run(guildId, userId).changes;
  }
  list(guildId) {
    return this.db
      .prepare(
        'SELECT user_id,feature FROM security_access WHERE guild_id=? ORDER BY user_id,feature LIMIT 100',
      )
      .all(guildId);
  }
  delegated(guildId, userId, feature) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM security_access WHERE guild_id=? AND user_id=? AND feature IN (?, 'all')",
      )
      .get(guildId, userId, feature);
  }
}
export function isBotOwner(c, userId) {
  return c.config?.ownerIds?.includes(userId) === true;
}
/** Throws securityDenied unless the user is a bot owner, a delegate for this feature. */
export async function requireSecurityAccess(i, c, feature) {
  if (isBotOwner(c, i.user.id)) return 'owner';
  if (c.securityAccess.delegated(i.guildId, i.user.id, feature)) return 'delegate';
  throw new UserError('securityDenied');
}
