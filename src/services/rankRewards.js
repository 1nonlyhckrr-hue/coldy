import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { validateSelfRole } from './rolePanels.js';
import { UserError } from '../utils/errors.js';
export class RankRewards {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  rules(g) {
    return this.db
      .prepare('SELECT * FROM rank_reward_rules WHERE guild_id=? ORDER BY kind,threshold,role_id')
      .all(g);
  }
  put(g, role, kind, threshold) {
    if (
      this.active.has(g) ||
      (this.rules(g).length >= 10 && !this.rules(g).some((r) => r.role_id === role))
    )
      throw new UserError('rankRewardBlocked');
    this.db
      .prepare(
        'INSERT INTO rank_reward_rules VALUES(?,?,?,?,?) ON CONFLICT(guild_id,role_id) DO UPDATE SET kind=excluded.kind,threshold=excluded.threshold,revision=excluded.revision',
      )
      .run(g, role, kind, threshold, randomUUID());
  }
  remove(g, role) {
    if (this.active.has(g)) throw new UserError('rankRewardBlocked');
    return this.db
      .prepare('DELETE FROM rank_reward_rules WHERE guild_id=? AND role_id=?')
      .run(g, role).changes;
  }
  receipt(g, u, role) {
    return this.db
      .prepare('SELECT * FROM rank_reward_receipts WHERE guild_id=? AND user_id=? AND role_id=?')
      .get(g, u, role);
  }
  reserve(g, u, r) {
    this.db
      .prepare("INSERT INTO rank_reward_receipts VALUES(?,?,?,?,'reserved')")
      .run(g, u, r.role_id, r.revision);
  }
  mark(g, u, role, status) {
    this.db
      .prepare(
        'UPDATE rank_reward_receipts SET status=? WHERE guild_id=? AND user_id=? AND role_id=?',
      )
      .run(status, g, u, role);
  }
  recover() {
    this.db
      .prepare("UPDATE rank_reward_receipts SET status='uncertain' WHERE status='reserved'")
      .run();
  }
}
async function authority(i, owner = false) {
  const guild = await i.guild?.fetch();
  if (guild?.id !== i.guildId || (owner && guild.ownerId !== i.user.id))
    throw new UserError('rankRewardUnavailable');
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    actor.user?.bot !== false ||
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has(P.ManageRoles) ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('rankRewardUnavailable');
  return { actor, bot, guild };
}
async function roleCheck(i, id, owner = false) {
  const { actor, bot, guild } = await authority(i, owner),
    role = await i.guild.roles.fetch(id, { force: true });
  if (
    role?.id !== id ||
    role.guild?.id !== i.guildId ||
    role.managed !== false ||
    role.permissions?.bitfield !== 0n ||
    role.id === i.guildId
  )
    throw new UserError('rankRewardRole');
  validateSelfRole(role, bot, owner ? actor : { id: guild.ownerId }, guild);
  return { actor, role };
}
function metric(i, c, r) {
  const service = r.kind === 'messages' ? c.messageRanks : c.voiceRanks;
  if (!service.config(i.guildId).enabled || service.optedOut(i.guildId, i.user.id))
    throw new UserError('rankRewardPrivate');
  service.cleanup();
  const count = service.stats(i.guildId, i.user.id).retained;
  return r.kind === 'messages' ? count : Math.floor(count / 60000);
}
export async function configureRankReward(i, c, { roleId, kind, threshold, confirm }) {
  if (confirm !== true) throw new UserError('rankRewardConfirm');
  if (
    !/^\d{17,20}$/.test(roleId) ||
    !['messages', 'voice-minutes'].includes(kind) ||
    !Number.isSafeInteger(threshold) ||
    threshold < 1 ||
    threshold > 900000
  )
    throw new UserError('rankRewardInput');
  await roleCheck(i, roleId, true);
  c.rankRewards.put(i.guildId, roleId, kind, threshold);
}
export async function removeRankReward(i, c, { roleId, confirm }) {
  if (confirm !== true) throw new UserError('rankRewardConfirm');
  if (!/^\d{17,20}$/.test(roleId)) throw new UserError('rankRewardInput');
  await authority(i, true);
  return c.rankRewards.remove(i.guildId, roleId);
}
export async function eligibleRankRewards(i, c) {
  await authority(i);
  return c.rankRewards.rules(i.guildId).map((r) => {
    let count = null;
    try {
      count = metric(i, c, r);
    } catch {
      /*Privacy/disabled tracking never discloses counts*/
    }
    return {
      roleId: r.role_id,
      kind: r.kind,
      threshold: r.threshold,
      count,
      eligible: count !== null && count >= r.threshold,
      status: c.rankRewards.receipt(i.guildId, i.user.id, r.role_id)?.status ?? 'unclaimed',
    };
  });
}
export async function claimRankReward(i, c, { roleId, confirm }) {
  if (confirm !== true) throw new UserError('rankRewardConfirm');
  if (!/^\d{17,20}$/.test(roleId)) throw new UserError('rankRewardInput');
  const rr = c.rankRewards,
    g = i.guildId,
    u = i.user.id;
  if (rr.active.has(g)) throw new UserError('rankRewardBlocked');
  rr.active.add(g);
  try {
    const rule = rr.rules(g).find((r) => r.role_id === roleId);
    if (!rule || rr.receipt(g, u, roleId)) throw new UserError('rankRewardBlocked');
    const { actor } = await roleCheck(i, roleId);
    if (actor.roles.cache.has(roleId) || metric(i, c, rule) < rule.threshold)
      throw new UserError('rankRewardInput');
    rr.reserve(g, u, rule);
    try {
      const { actor: current } = await roleCheck(i, roleId);
      if (
        rr.rules(g).find((r) => r.role_id === roleId)?.revision !== rule.revision ||
        metric(i, c, rule) < rule.threshold ||
        current.roles.cache.has(roleId)
      )
        throw Error('Policy/member state changed');
      await current.roles.add(roleId, 'Emika member confirmed retained activity reward');
      const observed = await i.guild.members.fetch({ user: u, force: true });
      if (observed?.id !== u || observed.guild?.id !== g || !observed.roles.cache.has(roleId))
        throw Error('Role grant not observed');
      await roleCheck(i, roleId);
      if (
        rr.rules(g).find((r) => r.role_id === roleId)?.revision !== rule.revision ||
        metric(i, c, rule) < rule.threshold
      )
        throw Error('Policy changed after grant');
      rr.mark(g, u, roleId, 'granted');
    } catch {
      rr.mark(g, u, roleId, 'uncertain');
      throw new UserError('rankRewardBlocked');
    }
    return { roleId, status: 'granted' };
  } finally {
    rr.active.delete(g);
  }
}
