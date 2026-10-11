import { UserError } from '../utils/errors.js';
const subjectId = /^\d{17,20}$/;
export const RECOVERY_COMMANDS = new Set(['permit', 'help']);
export class CommandRestrictions {
  constructor(db) {
    this.db = db;
  }
  validate(commandName, kind, id) {
    if (!/^[a-z0-9_-]{1,32}$/.test(commandName) || RECOVERY_COMMANDS.has(commandName))
      throw new UserError('permitProtected');
    if (!['user', 'role'].includes(kind) || !subjectId.test(id))
      throw new UserError('permitSubjectInvalid');
  }
  list(guildId, commandName) {
    return commandName
      ? this.db
          .prepare(
            'SELECT command_name,subject_kind,subject_id FROM command_restrictions WHERE guild_id=? AND command_name=? ORDER BY subject_kind,subject_id',
          )
          .all(guildId, commandName)
      : this.db
          .prepare(
            'SELECT command_name,subject_kind,subject_id FROM command_restrictions WHERE guild_id=? ORDER BY command_name,subject_kind,subject_id',
          )
          .all(guildId);
  }
  set(guildId, commandName, kind, id, blocked) {
    this.validate(commandName, kind, id);
    if (typeof blocked !== 'boolean') throw new TypeError('Invalid restriction state');
    return this.db.transaction(() => {
      if (blocked) {
        const existing = this.db
          .prepare(
            'SELECT 1 FROM command_restrictions WHERE guild_id=? AND command_name=? AND subject_kind=? AND subject_id=?',
          )
          .get(guildId, commandName, kind, id);
        if (!existing && this.list(guildId).length >= 100) throw new UserError('permitLimit');
        this.db
          .prepare('INSERT OR IGNORE INTO command_restrictions VALUES(?,?,?,?,?)')
          .run(guildId, commandName, kind, id, Date.now());
      } else
        this.db
          .prepare(
            'DELETE FROM command_restrictions WHERE guild_id=? AND command_name=? AND subject_kind=? AND subject_id=?',
          )
          .run(guildId, commandName, kind, id);
    })();
  }
  removeStored(guildId, commandName, kind, id) {
    this.validate(commandName, kind, id);
    return this.db
      .prepare(
        'DELETE FROM command_restrictions WHERE guild_id=? AND command_name=? AND subject_kind=? AND subject_id=?',
      )
      .run(guildId, commandName, kind, id).changes;
  }
  clear(guildId, commandName) {
    if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new UserError('permitCommandInvalid');
    return this.db
      .prepare('DELETE FROM command_restrictions WHERE guild_id=? AND command_name=?')
      .run(guildId, commandName).changes;
  }
  async ownStatus(i, commandName) {
    if (i.guild?.id !== i.guildId) throw new UserError('permitMemberMissing');
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (member?.id !== i.user.id || member.guild?.id !== i.guildId)
      throw new UserError('permitMemberMissing');
    if (RECOVERY_COMMANDS.has(commandName) || member.id === i.guild.ownerId) return 'exempt';
    return this.list(i.guildId, commandName).some((r) =>
      r.subject_kind === 'user' ? r.subject_id === member.id : member.roles.cache.has(r.subject_id),
    )
      ? 'denied'
      : 'notdenied';
  }
  async enforce(i, commandName) {
    if (RECOVERY_COMMANDS.has(commandName) || i.user.id === i.guild?.ownerId) return;
    const rows = this.list(i.guildId, commandName);
    if (!rows.length) return;
    // A configured restriction must never depend on a stale interaction member snapshot.
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      !member ||
      member.id !== i.user.id ||
      member.guild?.id !== i.guildId ||
      i.guild.id !== i.guildId
    )
      throw new UserError('permitMemberMissing');
    if (
      this.list(i.guildId, commandName).some((r) =>
        r.subject_kind === 'user'
          ? r.subject_id === member.id
          : member.roles.cache.has(r.subject_id),
      )
    )
      throw new UserError('permitDenied');
  }
}
