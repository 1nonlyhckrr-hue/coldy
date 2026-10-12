import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { validateSelfRole } from './rolePanels.js';
import { requireVoiceReady } from './voiceReadiness.js';
import { UserError } from '../utils/errors.js';
export class VoiceRoles {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  get(guildId) {
    return this.db.prepare('SELECT * FROM vcrole_policy WHERE guild_id=?').get(guildId) ?? null;
  }
  set(guildId, roleId, actorId) {
    this.db
      .prepare(
        'INSERT INTO vcrole_policy VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET role_id=excluded.role_id,actor_id=excluded.actor_id,revision=excluded.revision',
      )
      .run(guildId, roleId, actorId, randomUUID());
  }
  remove(guildId) {
    return this.db.prepare('DELETE FROM vcrole_policy WHERE guild_id=?').run(guildId).changes;
  }
  grants(guildId, userId) {
    return this.db
      .prepare(
        'SELECT role_id,status FROM vcrole_grants WHERE guild_id=? AND user_id=? ORDER BY role_id',
      )
      .all(guildId, userId);
  }
  summary(guildId) {
    return this.db
      .prepare(
        'SELECT status,count(*) count FROM vcrole_grants WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  reserve(guildId, userId, roleId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO vcrole_grants VALUES(?,?,?,'adding')")
        .run(guildId, userId, roleId).changes === 1
    );
  }
  state(guildId, userId, roleId, status) {
    this.db
      .prepare('UPDATE vcrole_grants SET status=? WHERE guild_id=? AND user_id=? AND role_id=?')
      .run(status, guildId, userId, roleId);
  }
  erase(guildId, userId, roleId) {
    this.db
      .prepare('DELETE FROM vcrole_grants WHERE guild_id=? AND user_id=? AND role_id=?')
      .run(guildId, userId, roleId);
  }
  recover() {
    this.db
      .prepare("UPDATE vcrole_grants SET status='uncertain' WHERE status IN ('adding','removing')")
      .run();
  }
}
async function native(state, c, roleId, actorId = null) {
  requireVoiceReady({ guild: state.guild, client: state.client }, c);
  const [member, bot, role, actor] = await Promise.all([
    state.guild.members.fetch({ user: state.id, force: true }),
    state.guild.members.fetchMe({ force: true }),
    state.guild.roles.fetch(roleId, { force: true }),
    actorId ? state.guild.members.fetch({ user: actorId, force: true }) : null,
  ]);
  if (
    member?.id !== state.id ||
    member.guild?.id !== state.guild.id ||
    member.user?.bot !== false ||
    member.id === state.guild.ownerId ||
    member.voice?.channelId !== state.channelId ||
    bot?.id !== state.client?.user?.id ||
    bot.guild?.id !== state.guild.id ||
    role?.id !== roleId ||
    role.guild?.id !== state.guild.id ||
    role.managed !== false ||
    typeof member.roles?.cache?.has !== 'function' ||
    !bot.roles?.highest ||
    !member.roles?.highest ||
    bot.roles.highest.comparePositionTo(member.roles.highest) <= 0
  )
    throw new UserError('vcroleUnavailable');
  if (
    actorId &&
    (actor?.id !== actorId ||
      actor.guild?.id !== state.guild.id ||
      !actor.permissions?.has([P.ManageGuild, P.ManageRoles]))
  )
    throw new UserError('vcroleUnavailable');
  validateSelfRole(role, bot, actor ?? { id: state.guild.ownerId }, state.guild);
  return { member, bot, role };
}
export function createVoiceRoleHandler(c) {
  return async (oldState, state) => {
    if (
      c.config.voiceEventsEnabled !== true ||
      !state.guild ||
      oldState.guild?.id !== state.guild.id ||
      oldState.id !== state.id ||
      oldState.channelId === state.channelId ||
      !(
        state.channelId === null ||
        (typeof state.channelId === 'string' && /^\d{17,20}$/.test(state.channelId))
      )
    )
      return;
    const guildId = state.guild.id,
      key = guildId + ':' + state.id;
    if (c.voiceRoles.active.has(key)) return;
    c.voiceRoles.active.add(key);
    try {
      // Only remove membership whose successful grant Emika owns;pre-existing roles never recorded.
      if (state.channelId === null) {
        for (const record of c.voiceRoles.grants(guildId, state.id)) {
          if (record.status !== 'granted') continue;
          let started = false;
          try {
            let snapshot = await native(state, c, record.role_id);
            snapshot = await native(state, c, record.role_id);
            if (!snapshot.member.roles.cache.has(record.role_id)) {
              c.voiceRoles.erase(guildId, state.id, record.role_id);
              continue;
            }
            if (
              c.config.voiceEventsEnabled !== true ||
              c.voiceRoles.grants(guildId, state.id).find((r) => r.role_id === record.role_id)
                ?.status !== 'granted'
            )
              continue;
            c.voiceRoles.state(guildId, state.id, record.role_id, 'removing');
            started = true;
            await snapshot.member.roles.remove(snapshot.role, 'Emika VC role disconnect cleanup');
            const observed = await state.guild.members.fetch({ user: state.id, force: true });
            if (
              observed?.id === state.id &&
              observed.guild?.id === guildId &&
              observed.roles?.cache?.has(record.role_id) === false
            )
              c.voiceRoles.erase(guildId, state.id, record.role_id);
            else c.voiceRoles.state(guildId, state.id, record.role_id, 'uncertain');
          } catch {
            if (started) c.voiceRoles.state(guildId, state.id, record.role_id, 'uncertain');
          }
        }
        return;
      }
      const policy = c.voiceRoles.get(guildId);
      if (!policy) return;
      if (c.voiceRoles.grants(guildId, state.id).some((r) => r.role_id === policy.role_id)) return;
      let started = false;
      try {
        let snapshot = await native(state, c, policy.role_id, policy.actor_id);
        snapshot = await native(state, c, policy.role_id, policy.actor_id);
        if (snapshot.member.roles.cache.has(policy.role_id)) return;
        if (
          c.config.voiceEventsEnabled !== true ||
          c.voiceRoles.get(guildId)?.revision !== policy.revision
        )
          return;
        started = c.voiceRoles.reserve(guildId, state.id, policy.role_id);
        if (!started) return;
        await snapshot.member.roles.add(
          snapshot.role,
          'Emika VC role configured by ' + policy.actor_id,
        );
        const observed = await state.guild.members.fetch({ user: state.id, force: true });
        c.voiceRoles.state(
          guildId,
          state.id,
          policy.role_id,
          observed?.id === state.id &&
            observed.guild?.id === guildId &&
            observed.roles?.cache?.has(policy.role_id) === true &&
            observed.voice?.channelId === state.channelId
            ? 'granted'
            : 'uncertain',
        );
      } catch {
        if (started) c.voiceRoles.state(guildId, state.id, policy.role_id, 'uncertain');
      }
    } catch {
      c.logger?.warn({ guildId }, 'VC role unavailable;no automatic retry');
    } finally {
      c.voiceRoles.active.delete(key);
    }
  };
}
