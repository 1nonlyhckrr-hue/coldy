import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { validateSelfRole } from './rolePanels.js';
import { UserError } from '../utils/errors.js';
const snowflake = (v) => typeof v === 'string' && /^\d{17,20}$/.test(v);
export class AutoRoles {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  list(guildId, kind = null) {
    return this.db
      .prepare(
        'SELECT kind,role_id,actor_id,revision FROM autorole_policy WHERE guild_id=? AND (? IS NULL OR kind=?) ORDER BY kind,role_id',
      )
      .all(guildId, kind, kind);
  }
  add(guildId, kind, roleId, actorId) {
    if (!['humans', 'bots'].includes(kind) || ![guildId, roleId, actorId].every(snowflake))
      throw new UserError('autoroleInput');
    this.db.transaction(() => {
      if (
        !this.db
          .prepare('SELECT role_id FROM autorole_policy WHERE guild_id=? AND kind=? AND role_id=?')
          .get(guildId, kind, roleId) &&
        this.list(guildId, kind).length >= 10
      )
        throw new UserError('autoroleLimit');
      this.db
        .prepare(
          'INSERT INTO autorole_policy VALUES(?,?,?,?,?) ON CONFLICT(guild_id,kind,role_id) DO UPDATE SET actor_id=excluded.actor_id,revision=excluded.revision',
        )
        .run(guildId, kind, roleId, actorId, randomUUID());
    })();
  }
  remove(guildId, kind, roleId) {
    if (!['humans', 'bots'].includes(kind) || !snowflake(roleId))
      throw new UserError('autoroleInput');
    return this.db
      .prepare('DELETE FROM autorole_policy WHERE guild_id=? AND kind=? AND role_id=?')
      .run(guildId, kind, roleId).changes;
  }
  reset(guildId, kind) {
    if (!['humans', 'bots', 'all'].includes(kind)) throw new UserError('autoroleInput');
    return this.db
      .prepare("DELETE FROM autorole_policy WHERE guild_id=? AND (?='all' OR kind=?)")
      .run(guildId, kind, kind).changes;
  }
  matches(guildId, row) {
    return (
      this.db
        .prepare('SELECT revision FROM autorole_policy WHERE guild_id=? AND kind=? AND role_id=?')
        .get(guildId, row.kind, row.role_id)?.revision === row.revision
    );
  }
  reserve(key, guildId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO autorole_receipts VALUES(?,?,'reserved',?)")
        .run(key, guildId, this.now()).changes === 1
    );
  }
  finish(key, status) {
    this.db
      .prepare("UPDATE autorole_receipts SET status=? WHERE event_key=? AND status='reserved'")
      .run(status, key);
  }
  recover() {
    this.db
      .prepare("UPDATE autorole_receipts SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup() {
    this.db
      .prepare('DELETE FROM autorole_receipts WHERE created_at<?')
      .run(this.now() - 30 * 86400000);
  }
}
export async function autoroleManager(i, c) {
  if (i.guild?.id !== i.guildId) throw new UserError('guildOnly');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has([P.ManageGuild, P.ManageRoles])
  )
    throw new UserError('userPermission');
  return actor;
}
export function createAutoRoleHandler(c) {
  return async (event) => {
    const now = c.autoroles.now();
    if (
      c.config.memberEventsEnabled !== true ||
      !event.guild ||
      !snowflake(event.id) ||
      typeof event.user?.bot !== 'boolean' ||
      !Number.isSafeInteger(event.joinedTimestamp) ||
      event.joinedTimestamp <= now - 300000 ||
      event.joinedTimestamp > now
    )
      return;
    const guildId = event.guild.id,
      kind = event.user.bot ? 'bots' : 'humans';
    for (const row of c.autoroles.list(guildId, kind)) {
      let key,
        reserved = false;
      try {
        const [member, bot, actor, role] = await Promise.all([
          event.guild.members.fetch({ user: event.id, force: true }),
          event.guild.members.fetchMe({ force: true }),
          event.guild.members.fetch({ user: row.actor_id, force: true }),
          event.guild.roles.fetch(row.role_id, { force: true }),
        ]);
        if (
          member?.id !== event.id ||
          member.guild?.id !== guildId ||
          member.user?.bot !== event.user.bot ||
          member.joinedTimestamp !== event.joinedTimestamp ||
          member.id === event.guild.ownerId ||
          bot?.id !== event.client?.user?.id ||
          bot.guild?.id !== guildId ||
          actor?.id !== row.actor_id ||
          actor.guild?.id !== guildId ||
          !actor.permissions?.has([P.ManageGuild, P.ManageRoles]) ||
          !member.roles?.cache ||
          typeof member.roles.add !== 'function' ||
          !(
            bot.roles?.highest &&
            member.roles?.highest &&
            typeof bot.roles.highest.comparePositionTo === 'function' &&
            bot.roles.highest.comparePositionTo(member.roles.highest) > 0
          )
        )
          continue;
        if (role?.id !== row.role_id) continue;
        validateSelfRole(role, bot, actor, event.guild);
        if (member.roles.cache.has(row.role_id)) continue;
        // Force a second pass after all role lookups and reject changed join/policy/authority.
        const [current, currentBot, currentActor, currentRole] = await Promise.all([
          event.guild.members.fetch({ user: event.id, force: true }),
          event.guild.members.fetchMe({ force: true }),
          event.guild.members.fetch({ user: row.actor_id, force: true }),
          event.guild.roles.fetch(row.role_id, { force: true }),
        ]);
        if (
          c.config.memberEventsEnabled !== true ||
          !c.autoroles.matches(guildId, row) ||
          current?.id !== event.id ||
          current.guild?.id !== guildId ||
          current.joinedTimestamp !== event.joinedTimestamp ||
          current.user?.bot !== event.user.bot ||
          currentBot?.id !== event.client.user.id ||
          currentBot.guild?.id !== guildId ||
          currentActor?.id !== row.actor_id ||
          currentActor.guild?.id !== guildId ||
          !currentActor.permissions?.has([P.ManageGuild, P.ManageRoles]) ||
          currentRole?.id !== row.role_id ||
          current.roles.cache.has(row.role_id) ||
          currentBot.roles.highest.comparePositionTo(current.roles.highest) <= 0 ||
          c.autoroles.now() - event.joinedTimestamp >= 300000
        )
          continue;
        validateSelfRole(currentRole, currentBot, currentActor, event.guild);
        key = guildId + ':' + event.id + ':' + event.joinedTimestamp + ':' + row.role_id;
        reserved = c.autoroles.reserve(key, guildId);
        if (!reserved) continue;
        await current.roles.add(currentRole, 'Luna AutoRole configured by ' + row.actor_id);
        const observed = await event.guild.members.fetch({ user: event.id, force: true });
        c.autoroles.finish(
          key,
          observed?.id === event.id &&
            observed.guild?.id === guildId &&
            observed.joinedTimestamp === event.joinedTimestamp &&
            observed.roles?.cache?.has(row.role_id) === true
            ? 'completed'
            : 'uncertain',
        );
      } catch {
        if (reserved) {
          try {
            c.autoroles.finish(key, 'uncertain');
          } catch {}
        }
        c.logger?.warn({ guildId }, 'AutoRole unavailable;no automatic retry');
      }
    }
  };
}
