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
  filtered(guildId, { commandName = null, kind = null } = {}) {
    if (
      commandName !== null &&
      (typeof commandName !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(commandName))
    )
      throw new UserError('permitCommandInvalid');
    if (kind !== null && !['user', 'role'].includes(kind))
      throw new UserError('permitSubjectInvalid');
    return this.list(guildId, commandName).filter((r) => kind === null || r.subject_kind === kind);
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
  clearCombined(guildId, commandName = null) {
    if (
      commandName !== null &&
      (typeof commandName !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(commandName))
    )
      throw new UserError('permitCommandInvalid');
    return this.db.transaction(() => {
      const subjects = this.db
        .prepare(
          'DELETE FROM command_restrictions WHERE guild_id=? AND (? IS NULL OR command_name=?)',
        )
        .run(guildId, commandName, commandName).changes;
      const channels = this.db
        .prepare(
          'DELETE FROM command_channel_restrictions WHERE guild_id=? AND (? IS NULL OR command_name=?)',
        )
        .run(guildId, commandName, commandName).changes;
      return { subjects, channels };
    })();
  }
  clearScope(guildId, kind, id) {
    if (
      !['user', 'role', 'channel'].includes(kind) ||
      typeof id !== 'string' ||
      !subjectId.test(id)
    )
      throw new UserError('permitSubjectInvalid');
    return kind === 'channel'
      ? this.db
          .prepare('DELETE FROM command_channel_restrictions WHERE guild_id=? AND channel_id=?')
          .run(guildId, id).changes
      : this.db
          .prepare(
            'DELETE FROM command_restrictions WHERE guild_id=? AND subject_kind=? AND subject_id=?',
          )
          .run(guildId, kind, id).changes;
  }
  commandCounts(guildId) {
    const rules = this.exportRules(guildId),
      counts = new Map();
    for (const [kind, rows] of [
      ['subjects', rules.subjects],
      ['channels', rules.channels],
    ])
      for (const row of rows) {
        const count = counts.get(row.command_name) ?? {
          command: row.command_name,
          subjects: 0,
          channels: 0,
        };
        count[kind]++;
        counts.set(row.command_name, count);
      }
    return [...counts.values()].sort((a, b) =>
      a.command < b.command ? -1 : a.command > b.command ? 1 : 0,
    );
  }
  exportCommand(guildId, name) {
    if (typeof name !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(name))
      throw new UserError('permitCommandInvalid');
    return { subjects: this.list(guildId, name), channels: this.channelRules(guildId, name) };
  }
  clearObsolete(guildId, installed) {
    if (!(installed instanceof Map)) throw new TypeError('Installed registry required');
    return this.db.transaction(() => {
      const names = new Set(
        [...this.list(guildId), ...this.channelRules(guildId)]
          .map((row) => row.command_name)
          .filter((name) => !installed.has(name) && !RECOVERY_COMMANDS.has(name)),
      );
      let subjects = 0,
        channels = 0;
      for (const name of names) {
        const result = this.clearCombined(guildId, name);
        subjects += result.subjects;
        channels += result.channels;
      }
      return { subjects, channels, commands: names.size };
    })();
  }
  summary(guildId) {
    const rules = this.exportRules(guildId),
      all = [...rules.subjects, ...rules.channels];
    return {
      subjects: rules.subjects.length,
      users: rules.subjects.filter((r) => r.subject_kind === 'user').length,
      roles: rules.subjects.filter((r) => r.subject_kind === 'role').length,
      channels: rules.channels.length,
      commands: new Set(all.map((r) => r.command_name)).size,
    };
  }
  searchStored(guildId, id) {
    if (typeof id !== 'string' || !subjectId.test(id)) throw new UserError('permitSubjectInvalid');
    const rules = this.exportRules(guildId);
    return {
      subjects: rules.subjects.filter((r) => r.subject_id === id),
      channels: rules.channels.filter((r) => r.channel_id === id),
    };
  }
  obsolete(guildId, installed) {
    if (!(installed instanceof Map)) throw new TypeError('Installed registry required');
    const rules = this.exportRules(guildId);
    return {
      subjects: rules.subjects.filter((r) => !installed.has(r.command_name)),
      channels: rules.channels.filter((r) => !installed.has(r.command_name)),
    };
  }
  exportRules(guildId) {
    return { subjects: this.list(guildId), channels: this.channelRules(guildId) };
  }
  channelRules(guildId, commandName = null) {
    if (
      commandName !== null &&
      (typeof commandName !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(commandName))
    )
      throw new UserError('permitCommandInvalid');
    return this.db
      .prepare(
        'SELECT command_name,channel_id FROM command_channel_restrictions WHERE guild_id=? AND (? IS NULL OR command_name=?) ORDER BY command_name,channel_id',
      )
      .all(guildId, commandName, commandName);
  }
  setChannel(guildId, commandName, channelId, blocked) {
    this.validate(commandName, 'user', channelId);
    if (typeof blocked !== 'boolean') throw new TypeError('Invalid restriction state');
    return this.db.transaction(() => {
      if (blocked) {
        const existing = this.db
          .prepare(
            'SELECT 1 FROM command_channel_restrictions WHERE guild_id=? AND command_name=? AND channel_id=?',
          )
          .get(guildId, commandName, channelId);
        if (!existing && this.channelRules(guildId).length >= 100)
          throw new UserError('permitLimit');
        return this.db
          .prepare('INSERT OR IGNORE INTO command_channel_restrictions VALUES(?,?,?,?)')
          .run(guildId, commandName, channelId, Date.now()).changes;
      }
      return this.db
        .prepare(
          'DELETE FROM command_channel_restrictions WHERE guild_id=? AND command_name=? AND channel_id=?',
        )
        .run(guildId, commandName, channelId).changes;
    })();
  }
  channelDenied(i, commandName) {
    return this.channelRules(i.guildId, commandName).some((r) => r.channel_id === i.channelId);
  }
  async ownStatus(i, commandName) {
    if (i.guild?.id !== i.guildId) throw new UserError('permitMemberMissing');
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (member?.id !== i.user.id || member.guild?.id !== i.guildId)
      throw new UserError('permitMemberMissing');
    if (RECOVERY_COMMANDS.has(commandName) || member.id === i.guild.ownerId) return 'exempt';
    return this.channelDenied(i, commandName) ||
      this.list(i.guildId, commandName).some((r) =>
        r.subject_kind === 'user'
          ? r.subject_id === member.id
          : member.roles.cache.has(r.subject_id),
      )
      ? 'denied'
      : 'notdenied';
  }
  async enforce(i, commandName) {
    if (RECOVERY_COMMANDS.has(commandName) || i.user.id === i.guild?.ownerId) return;
    if (this.channelDenied(i, commandName)) throw new UserError('permitDenied');
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
