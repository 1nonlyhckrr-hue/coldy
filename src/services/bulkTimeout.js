import { PermissionFlagsBits as P } from 'discord.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
export class BulkTimeout {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  get(id, g, u) {
    return this.db
      .prepare('SELECT * FROM bulk_timeout_plans WHERE id=? AND guild_id=? AND actor_id=?')
      .get(id, g, u);
  }
  reserve(i, rows) {
    this.db
      .prepare("DELETE FROM bulk_timeout_plans WHERE status='preview' AND created_at<?")
      .run(Date.now() - 86400000);
    if (
      this.db
        .prepare("SELECT count(*) n FROM bulk_timeout_plans WHERE guild_id=? AND status='preview'")
        .get(i.guildId).n >= 25
    )
      throw new UserError('bulkTimeoutBlocked');
    return Number(
      this.db
        .prepare(
          "INSERT INTO bulk_timeout_plans(guild_id,actor_id,rows_json,status,created_at) VALUES(?,?,?,'preview',?)",
        )
        .run(i.guildId, i.user.id, JSON.stringify(rows), Date.now()).lastInsertRowid,
    );
  }
  mark(id, status) {
    this.db.prepare('UPDATE bulk_timeout_plans SET status=? WHERE id=?').run(status, id);
  }
  recover() {
    this.db
      .prepare("UPDATE bulk_timeout_plans SET status='uncertain' WHERE status='executing'")
      .run();
  }
}
async function member(i, u) {
  const guild = await i.guild?.fetch(),
    [actor, bot, target] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
      i.guild.members.fetch({ user: u, force: true }),
    ]);
  if (
    guild?.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    target?.id !== u ||
    target.guild?.id !== i.guildId ||
    target.user?.bot !== false ||
    target.moderatable !== true ||
    target.permissions?.has(P.Administrator) ||
    !actor.permissions?.has(P.ModerateMembers) ||
    !bot.permissions?.has(P.ModerateMembers) ||
    !i.appPermissions?.has(P.ModerateMembers)
  )
    throw new UserError('bulkTimeoutUnavailable');
  enforceHierarchy(actor, bot, target, guild.ownerId);
  return target;
}
export async function previewBulkTimeout(i, c, ids) {
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 10 ||
    new Set(ids).size !== ids.length ||
    ids.some((u) => typeof u !== 'string' || !/^\d{17,20}$/.test(u))
  )
    throw new UserError('bulkTimeoutInput');
  const rows = [];
  for (const u of ids) {
    if (
      c.cases.db
        .prepare(
          "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='bulk_timeout_clear' AND status IN ('pending','uncertain') LIMIT 1",
        )
        .get(i.guildId, u)
    )
      throw new UserError('bulkTimeoutBlocked');
    const m = await member(i, u),
      until = m.communicationDisabledUntilTimestamp;
    if (!Number.isSafeInteger(until) || until <= Date.now())
      throw new UserError('bulkTimeoutInput');
    rows.push({ userId: u, until });
  }
  return { id: c.bulkTimeout.reserve(i, rows), rows, expiresInSeconds: 120 };
}
export async function confirmBulkTimeout(i, c, { id, confirm }) {
  if (confirm !== true) throw new UserError('bulkTimeoutConfirm');
  const b = c.bulkTimeout,
    row = b.get(id, i.guildId, i.user.id);
  if (
    !row ||
    row.status !== 'preview' ||
    row.created_at < Date.now() - 120000 ||
    b.active.has(i.guildId)
  )
    throw new UserError('bulkTimeoutBlocked');
  const rows = JSON.parse(row.rows_json);
  if (
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 10 ||
    new Set(rows.map((r) => r.userId)).size !== rows.length
  )
    throw new UserError('bulkTimeoutBlocked');
  b.active.add(i.guildId);
  try {
    for (const r of rows) {
      if (
        c.cases.db
          .prepare(
            "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='bulk_timeout_clear' AND status IN ('pending','uncertain') LIMIT 1",
          )
          .get(i.guildId, r.userId)
      )
        throw new UserError('bulkTimeoutBlocked');
      const m = await member(i, r.userId);
      if (m.communicationDisabledUntilTimestamp !== r.until || r.until <= Date.now())
        throw new UserError('bulkTimeoutBlocked');
    }
    const current = b.get(id, i.guildId, i.user.id);
    if (
      current?.status !== 'preview' ||
      current.rows_json !== row.rows_json ||
      current.created_at < Date.now() - 120000
    )
      throw new UserError('bulkTimeoutBlocked');
    b.mark(id, 'executing');
    const completed = [];
    try {
      for (const r of rows) {
        const m = await member(i, r.userId);
        if (m.communicationDisabledUntilTimestamp !== r.until || r.until <= Date.now())
          throw Error('Timeout changed');
        const caseId = c.cases.begin({
          guildId: i.guildId,
          targetId: r.userId,
          actorId: i.user.id,
          action: 'bulk_timeout_clear',
          reason: `Confirmed exact timeout preview ${id}`,
          interactionId: i.id + ':' + r.userId,
        });
        try {
          const fresh = await member(i, r.userId);
          if (fresh.communicationDisabledUntilTimestamp !== r.until) throw Error('Deadline drift');
          await fresh.disableCommunicationUntil(null, 'Luna exact confirmed bulk timeout clear');
          const observed = await member(i, r.userId);
          if ((observed.communicationDisabledUntilTimestamp ?? 0) !== 0)
            throw Error('Clear not observed');
          c.cases.finish(caseId, 'completed');
          completed.push(r.userId);
        } catch {
          try {
            c.cases.finish(caseId, 'uncertain');
          } catch {
            /*Pending*/
          }
          throw Error('Unverified clear');
        }
      }
      b.mark(id, 'completed');
      return { id, completed };
    } catch {
      b.mark(id, 'uncertain');
      throw new UserError('bulkTimeoutBlocked');
    }
  } finally {
    b.active.delete(i.guildId);
  }
}
