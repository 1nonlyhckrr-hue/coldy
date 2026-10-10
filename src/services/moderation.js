import { translate } from './localization.js';
import { PermissionFlagsBits } from 'discord.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
export const actionPermissions = Object.freeze({
  warn: PermissionFlagsBits.ModerateMembers,
  warnings: PermissionFlagsBits.ModerateMembers,
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
    this.db.prepare('UPDATE moderation_cases SET status=? WHERE id=?').run(status, id);
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
  const [actor, bot] = await Promise.all([
    interaction.guild.members.fetch({ user: interaction.user.id, force: true }),
    interaction.guild.members.fetchMe({ force: true }),
  ]);
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
    enforceHierarchy(actor, bot, target, interaction.guild.ownerId);
    if (
      ['timeout', 'untimeout'].includes(action) &&
      (target.user.bot || target.permissions.has(PermissionFlagsBits.Administrator))
    )
      throw new UserError('modTimeoutProtected');
    input.target = target;
  }
  const record = {
    guildId: interaction.guildId,
    targetId,
    actorId: actor.id,
    action,
    reason,
    interactionId: interaction.id,
  };
  if (action === 'warnings')
    return { warnings: context.cases.warnings(interaction.guildId, targetId) };
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
