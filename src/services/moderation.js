import { translate } from './localization.js';
import { PermissionFlagsBits } from 'discord.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
export const actionPermissions = Object.freeze({
  warn: PermissionFlagsBits.ModerateMembers,
  warnings: PermissionFlagsBits.ModerateMembers,
  clearwarning: PermissionFlagsBits.ModerateMembers,
  editwarning: PermissionFlagsBits.ModerateMembers,
  exportwarnings: PermissionFlagsBits.ModerateMembers,
  clearwarns: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
});
export function parseDuration(value) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value ?? '');
  if (!match) throw new UserError('modDurationSyntax');
  const milliseconds = Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1000 || milliseconds > 28 * 86400000)
    throw new UserError('modDurationBounds');
  return milliseconds;
}
export class ModerationCases {
  constructor(db) {
    this.db = db;
  }
  begin({ guildId, targetId, actorId, action, reason, interactionId }) {
    const existing = this.db
      .prepare('SELECT id,status FROM moderation_cases WHERE interaction_id=?')
      .get(interactionId);
    if (existing) throw new UserError('modDuplicate', { id: existing.id, status: existing.status });
    const result = this.db
      .prepare(
        `INSERT INTO moderation_cases(guild_id,target_id,actor_id,action,reason,created_at,status,interaction_id) VALUES(?,?,?,?,?,?,'pending',?)`,
      )
      .run(guildId, targetId, actorId, action, reason, Date.now(), interactionId);
    return Number(result.lastInsertRowid);
  }
  finish(id, status) {
    if (!['completed', 'failed', 'uncertain'].includes(status))
      throw new Error('Invalid case outcome');
    const r = this.db
      .prepare("UPDATE moderation_cases SET status=? WHERE id=? AND status='pending'")
      .run(status, id);
    if (r.changes !== 1) throw new Error('Case not pending');
  }
  caseSummary(guildId) {
    return this.db
      .prepare(
        'SELECT status,COUNT(*) count FROM moderation_cases WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  caseSubject(guildId, kind, id, page = 1) {
    if (
      !['actor', 'target'].includes(kind) ||
      typeof id !== 'string' ||
      !/^\d{17,20}$/.test(id) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000
    )
      throw new UserError('caseHistoryInvalid');
    const column = kind === 'actor' ? 'actor_id' : 'target_id';
    return this.db.transaction(() => {
      const total = this.db
          .prepare(`SELECT COUNT(*) n FROM moderation_cases WHERE guild_id=? AND ${column}=?`)
          .get(guildId, id).n,
        pages = Math.max(1, Math.ceil(total / 10));
      if (page > pages) throw new UserError('caseHistoryInvalid');
      const rows = this.db
        .prepare(
          `SELECT id,action,actor_id,target_id,status FROM moderation_cases WHERE guild_id=? AND ${column}=? ORDER BY id DESC LIMIT 10 OFFSET ?`,
        )
        .all(guildId, id, (page - 1) * 10);
      return { total, pages, page, rows };
    })();
  }
  inspectCase(guildId, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('caseHistoryInvalid');
    const row = this.db
      .prepare(
        'SELECT id,action,actor_id,target_id,reason,status,created_at FROM moderation_cases WHERE guild_id=? AND id=?',
      )
      .get(guildId, id);
    if (!row) throw new UserError('caseHistoryInvalid');
    return row;
  }
  casePage(guildId, page = 1, state = null) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000 ||
      (state !== null && !['pending', 'completed', 'failed', 'uncertain'].includes(state))
    )
      throw new UserError('caseHistoryInvalid');
    return this.db.transaction(() => {
      const total = this.db
          .prepare(
            'SELECT count(*) n FROM moderation_cases WHERE guild_id=? AND (? IS NULL OR status=?)',
          )
          .get(guildId, state, state).n,
        pages = Math.max(1, Math.ceil(total / 10));
      if (page > pages) throw new UserError('caseHistoryInvalid');
      return {
        total,
        pages,
        page,
        rows: this.db
          .prepare(
            'SELECT id,action,target_id,status FROM moderation_cases WHERE guild_id=? AND (? IS NULL OR status=?) ORDER BY id DESC LIMIT 10 OFFSET ?',
          )
          .all(guildId, state, state, (page - 1) * 10),
      };
    })();
  }
  exportCases(guildId) {
    return this.db.transaction(() => {
      const total = this.db
          .prepare('SELECT count(*) n FROM moderation_cases WHERE guild_id=?')
          .get(guildId).n,
        cases = this.db
          .prepare(
            'SELECT id,action,actor_id,target_id,reason,status,created_at FROM moderation_cases WHERE guild_id=? ORDER BY id DESC LIMIT 100',
          )
          .all(guildId);
      return { total, truncated: total > cases.length, cases };
    })();
  }
  warn(record) {
    return this.db.transaction(() => {
      const id = this.begin(record);
      this.db
        .prepare(
          'INSERT INTO warnings(guild_id,target_id,actor_id,reason,created_at) VALUES(?,?,?,?,?)',
        )
        .run(record.guildId, record.targetId, record.actorId, record.reason, Date.now());
      this.finish(id, 'completed');
      return id;
    })();
  }
  warnings(guildId, targetId) {
    return this.db
      .prepare(
        'SELECT id,reason,created_at FROM warnings WHERE guild_id=? AND target_id=? AND cleared_at IS NULL ORDER BY id DESC LIMIT 10',
      )
      .all(guildId, targetId);
  }
  warningPage(guildId, targetId, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new UserError('modWarningPageInvalid');
    const total = this.db
        .prepare(
          'SELECT count(*) n FROM warnings WHERE guild_id=? AND target_id=? AND cleared_at IS NULL',
        )
        .get(guildId, targetId).n,
      pages = Math.max(1, Math.ceil(total / 2));
    if (page > pages) throw new UserError('modWarningPageInvalid');
    const rows = this.db
      .prepare(
        'SELECT id,reason,created_at FROM warnings WHERE guild_id=? AND target_id=? AND cleared_at IS NULL ORDER BY id DESC LIMIT 2 OFFSET ?',
      )
      .all(guildId, targetId, (page - 1) * 2);
    return { rows, total, page, pages };
  }
  activeWarning(id, guildId, targetId) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('modWarningIdInvalid');
    const row = this.db
      .prepare(
        'SELECT id,reason,created_at FROM warnings WHERE id=? AND guild_id=? AND target_id=? AND cleared_at IS NULL',
      )
      .get(id, guildId, targetId);
    if (!row) throw new UserError('modWarningIdInvalid');
    return row;
  }
  changeWarning(record, id, { clear = false } = {}) {
    return this.db.transaction(() => {
      this.activeWarning(id, record.guildId, record.targetId);
      const caseId = this.begin(record);
      const r = clear
        ? this.db
            .prepare(
              'UPDATE warnings SET cleared_at=? WHERE id=? AND guild_id=? AND target_id=? AND cleared_at IS NULL',
            )
            .run(Date.now(), id, record.guildId, record.targetId)
        : this.db
            .prepare(
              'UPDATE warnings SET reason=? WHERE id=? AND guild_id=? AND target_id=? AND cleared_at IS NULL',
            )
            .run(record.reason, id, record.guildId, record.targetId);
      if (r.changes !== 1) throw new UserError('modWarningIdInvalid');
      this.finish(caseId, 'completed');
      return { id: caseId, warningId: id };
    })();
  }
  exportWarnings(guildId, targetId) {
    const total = this.db
      .prepare(
        'SELECT count(*) n FROM warnings WHERE guild_id=? AND target_id=? AND cleared_at IS NULL',
      )
      .get(guildId, targetId).n;
    const rows = this.db
      .prepare(
        'SELECT id,reason,created_at FROM warnings WHERE guild_id=? AND target_id=? AND cleared_at IS NULL ORDER BY id DESC LIMIT 2000',
      )
      .all(guildId, targetId);
    return { total, truncated: total > rows.length, rows };
  }
  clearWarnings(record) {
    return this.db.transaction(() => {
      const id = this.begin(record);
      const count = this.db
        .prepare(
          'UPDATE warnings SET cleared_at=? WHERE guild_id=? AND target_id=? AND cleared_at IS NULL',
        )
        .run(Date.now(), record.guildId, record.targetId).changes;
      this.finish(id, 'completed');
      return { id, count };
    })();
  }
}
export async function moderate(interaction, context, input) {
  const { action, targetId } = input;
  if (!actionPermissions[action]) throw new UserError('modUnknown');
  if (!/^\d{17,20}$/.test(targetId ?? '')) throw new UserError('modIdInvalid');
  if (!interaction.inGuild()) throw new UserError('modGuildOnly');
  // Refresh caller and bot members to recheck current permissions and hierarchy.
  let [actor, bot] = await Promise.all([
    interaction.guild.members.fetch({ user: interaction.user.id, force: true }),
    interaction.guild.members.fetchMe({ force: true }),
  ]);
  const verifyIdentity = () => {
    if (
      interaction.guild.id !== interaction.guildId ||
      actor?.id !== interaction.user.id ||
      actor.guild?.id !== interaction.guildId ||
      !interaction.guild.client?.user?.id ||
      bot?.id !== interaction.guild.client.user.id ||
      bot.guild?.id !== interaction.guildId
    )
      throw new UserError('modIdentityInvalid');
  };
  verifyIdentity();
  if (!actor.permissions.has(actionPermissions[action])) throw new UserError('modActorPermission');
  const external = ['timeout', 'untimeout', 'kick', 'ban', 'unban'].includes(action);
  if (
    external &&
    (!bot.permissions.has(actionPermissions[action]) ||
      !interaction.appPermissions?.has(actionPermissions[action]))
  )
    throw new UserError('modBotPermission');
  if (targetId === interaction.guild.ownerId || targetId === actor.id || targetId === bot.id)
    throw new UserError('protectedTarget');
  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string')
    throw new UserError('modReasonText');
  const locale = context.localization?.locale(interaction.guildId) ?? 'en';
  const reason = (input.reason ?? translate(locale, 'noReason')).trim();
  if (!reason || reason.length > 400) throw new UserError('modReasonBounds');
  if (action !== 'unban') {
    let target;
    try {
      target = await interaction.guild.members.fetch({ user: targetId, force: true });
    } catch {
      throw new UserError('modTargetUnavailable');
    }
    if (target?.id !== targetId || target.guild?.id !== interaction.guildId)
      throw new UserError('modIdentityInvalid');
    enforceHierarchy(actor, bot, target, interaction.guild.ownerId);
    if (
      ['timeout', 'untimeout'].includes(action) &&
      (target.user.bot || target.permissions.has(PermissionFlagsBits.Administrator))
    )
      throw new UserError('modTimeoutProtected');
    input.target = target;
  }
  [actor, bot] = await Promise.all([
    interaction.guild.members.fetch({ user: interaction.user.id, force: true }),
    interaction.guild.members.fetchMe({ force: true }),
  ]);
  verifyIdentity();
  if (!actor.permissions.has(actionPermissions[action])) throw new UserError('modActorPermission');
  if (
    external &&
    (!bot.permissions.has(actionPermissions[action]) ||
      !interaction.appPermissions?.has(actionPermissions[action]))
  )
    throw new UserError('modBotPermission');
  if (action !== 'unban') enforceHierarchy(actor, bot, input.target, interaction.guild.ownerId);
  if (targetId === interaction.guild.ownerId || targetId === actor.id || targetId === bot.id)
    throw new UserError('protectedTarget');
  const record = {
    guildId: interaction.guildId,
    targetId,
    actorId: actor.id,
    action,
    reason,
    interactionId: interaction.id,
  };
  if (action === 'warnings') {
    const warningPage = context.cases.warningPage(interaction.guildId, targetId, input.page ?? 1);
    return { warnings: warningPage.rows, warningPage };
  }
  if (action === 'exportwarnings')
    return { warningExport: context.cases.exportWarnings(interaction.guildId, targetId) };
  if (['editwarning', 'clearwarning'].includes(action)) {
    if (input.confirm !== true) throw new UserError('modWarningConfirm');
    if (action === 'editwarning' && (typeof input.reason !== 'string' || !input.reason.trim()))
      throw new UserError('modReasonText');
    return context.cases.changeWarning(record, input.warningId, {
      clear: action === 'clearwarning',
    });
  }
  if (action === 'warn') return { id: context.cases.warn(record) };
  if (action === 'clearwarns') return context.cases.clearWarnings(record);
  const duration = action === 'timeout' ? parseDuration(input.duration) : undefined;
  const auditReason = `Luna | actor ${actor.id} | ${reason}`;
  const id = context.cases.begin(record); // Persistence must succeed before any external action.
  try {
    if (action === 'timeout') await input.target.timeout(duration, auditReason);
    if (action === 'untimeout') await input.target.timeout(null, auditReason);
    if (action === 'kick') await input.target.kick(auditReason);
    if (action === 'ban') await input.target.ban({ reason: auditReason, deleteMessageSeconds: 0 });
    if (action === 'unban') await interaction.guild.bans.remove(targetId, auditReason);
  } catch (error) {
    // A network error may occur after Discord accepted the change. Never auto-retry.
    const rejected = typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    context.cases.finish(id, rejected ? 'failed' : 'uncertain');
    throw new UserError('modActionUncertain', {
      action,
      id,
      status: rejected ? 'failed' : 'uncertain',
    });
  }
  try {
    context.cases.finish(id, 'completed');
  } catch {
    throw new UserError('modStorageIncomplete', { action, id });
  }
  return { id };
}
