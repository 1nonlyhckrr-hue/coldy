import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { parseDuration } from './moderation.js';
export class Jail {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  config(g) {
    return this.db.prepare('SELECT * FROM jail_config WHERE guild_id=?').get(g) ?? null;
  }
  get(g, u) {
    return (
      this.db.prepare('SELECT * FROM jail_members WHERE guild_id=? AND user_id=?').get(g, u) ?? null
    );
  }
  expire(g) {
    this.db
      .prepare(
        "UPDATE jail_members SET status='expired' WHERE guild_id=? AND status='active' AND until_ms<=?",
      )
      .run(g, Date.now());
  }
  list(g) {
    this.expire(g);
    const total = this.db
      .prepare(
        "SELECT count(*) n FROM jail_members WHERE guild_id=? AND status NOT IN ('released','expired')",
      )
      .get(g).n;
    return {
      total,
      records: this.db
        .prepare(
          "SELECT user_id,until_ms,status FROM jail_members WHERE guild_id=? AND status NOT IN ('released','expired') ORDER BY until_ms LIMIT 25",
        )
        .all(g),
    };
  }
  setup(g, ch) {
    if (this.list(g).total || this.active.has(g)) throw new UserError('jailBlocked');
    this.db
      .prepare(
        'INSERT INTO jail_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id',
      )
      .run(g, ch);
  }
  reset(g) {
    if (this.list(g).total || this.active.has(g)) throw new UserError('jailBlocked');
    this.db.prepare('DELETE FROM jail_config WHERE guild_id=?').run(g);
  }
  recover() {
    this.db
      .prepare(
        "UPDATE jail_members SET status='uncertain' WHERE status IN ('applying','releasing')",
      )
      .run();
  }
}
export async function jailAuthority(i, owner = false) {
  const guild = await i.guild?.fetch();
  if (guild?.id !== i.guildId || (owner && guild.ownerId !== i.user.id))
    throw new UserError('jailUnavailable');
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ModerateMembers) ||
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has(P.ModerateMembers) ||
    !i.appPermissions?.has(P.ModerateMembers)
  )
    throw new UserError('jailUnavailable');
  return { actor, bot, ownerId: guild.ownerId };
}
async function target(i, u) {
  const { actor, bot, ownerId } = await jailAuthority(i),
    member = await i.guild.members.fetch({ user: u, force: true });
  if (
    member?.id !== u ||
    member.guild?.id !== i.guildId ||
    member.user?.bot !== false ||
    member.moderatable !== true ||
    member.permissions?.has(P.Administrator) ||
    !Number.isSafeInteger(member.communicationDisabledUntilTimestamp ?? 0)
  )
    throw new UserError('jailUnavailable');
  enforceHierarchy(actor, bot, member, ownerId);
  return member;
}
export async function setupJail(i, c, { channelId, confirm }) {
  if (confirm !== true) throw new UserError('jailConfirm');
  await jailAuthority(i, true);
  const ch = await i.guild.channels.fetch(channelId, { force: true });
  if (ch?.id !== channelId || ch.guildId !== i.guildId || ch.type !== ChannelType.GuildText)
    throw new UserError('jailInput');
  c.jail.setup(i.guildId, channelId);
}
export async function changeJail(
  i,
  c,
  { userId, release = false, duration, reason = 'Confirmed bounded timeout jail', confirm },
) {
  if (confirm !== true) throw new UserError('jailConfirm');
  if (
    !/^\d{17,20}$/.test(userId) ||
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 400 ||
    /[\u0000-\u001f\u007f]/u.test(reason)
  )
    throw new UserError('jailInput');
  const j = c.jail,
    g = i.guildId,
    key = g + ':' + userId;
  if (j.active.has(g)) throw new UserError('jailBlocked');
  await jailAuthority(i);
  if (!j.config(g)) throw new UserError('jailInput');
  const ms = release ? null : parseDuration(duration);
  if (j.active.has(g)) throw new UserError('jailBlocked');
  j.active.add(g);
  try {
    if (
      c.cases.db
        .prepare(
          "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('jail_release','jail_timeout') AND status IN ('pending','uncertain') LIMIT 1",
        )
        .get(g, userId)
    )
      throw new UserError('jailBlocked');
    j.expire(g);
    const before = await target(i, userId),
      row = j.get(g, userId),
      existing = before.communicationDisabledUntilTimestamp ?? 0;
    let until;
    if (release) {
      if (row?.status !== 'active' || row.until_ms <= Date.now() || existing !== row.until_ms)
        throw new UserError('jailBlocked');
      until = null;
    } else {
      if (
        (row && !['expired', 'released'].includes(row.status)) ||
        existing > Date.now() ||
        j.list(g).total >= 100
      )
        throw new UserError('jailBlocked');
      until = Date.now() + ms;
    }
    const caseId = c.cases.begin({
      guildId: g,
      targetId: userId,
      actorId: i.user.id,
      action: release ? 'jail_release' : 'jail_timeout',
      reason,
      interactionId: i.id,
    });
    j.db
      .prepare(
        'INSERT INTO jail_members VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET until_ms=excluded.until_ms,status=excluded.status,case_id=excluded.case_id,reason=excluded.reason',
      )
      .run(
        g,
        userId,
        release ? row.until_ms : until,
        release ? 'releasing' : 'applying',
        caseId,
        reason,
      );
    try {
      const current = await target(i, userId);
      if ((current.communicationDisabledUntilTimestamp ?? 0) !== existing || !j.config(g))
        throw Error('State changed');
      if (until !== null && until <= Date.now()) throw Error('Deadline elapsed');
      await current.disableCommunicationUntil(
        until,
        `Emika | ${i.user.id} | ${release ? 'release' : 'bounded jail'}`,
      );
      const observed = await target(i, userId);
      if ((observed.communicationDisabledUntilTimestamp ?? 0) !== (until ?? 0))
        throw Error('Effect unverified');
      j.db
        .prepare('UPDATE jail_members SET status=? WHERE guild_id=? AND user_id=?')
        .run(release ? 'released' : 'active', g, userId);
      c.cases.finish(caseId, 'completed');
    } catch {
      j.db
        .prepare("UPDATE jail_members SET status='uncertain' WHERE guild_id=? AND user_id=?")
        .run(g, userId);
      try {
        c.cases.finish(caseId, 'uncertain');
      } catch {
        /*Pending blocks retry*/
      }
      throw new UserError('jailBlocked');
    }
    return { userId, status: release ? 'released' : 'active', until, caseId, key };
  } finally {
    j.active.delete(g);
  }
}
