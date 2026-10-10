import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { validateSelfRole } from './rolePanels.js';
export class CustomRoles {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  validateName(name) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{0,23}$/.test(name))
      throw new UserError('customNameInvalid');
  }
  list(guildId) {
    return this.db
      .prepare('SELECT name,role_id FROM custom_role_mappings WHERE guild_id=? ORDER BY name')
      .all(guildId);
  }
  get(guildId, name) {
    return this.db
      .prepare('SELECT name,role_id FROM custom_role_mappings WHERE guild_id=? AND name=?')
      .get(guildId, name);
  }
  required(guildId) {
    return (
      this.db
        .prepare('SELECT required_role_id FROM custom_role_config WHERE guild_id=?')
        .get(guildId)?.required_role_id ?? null
    );
  }
  setRequired(guildId, roleId) {
    if (roleId !== null && !/^\d{17,20}$/.test(roleId)) throw new UserError('customRoleInvalid');
    if (roleId && this.list(guildId).some((r) => r.role_id === roleId))
      throw new UserError('customGateOverlap');
    this.db
      .prepare(
        'INSERT INTO custom_role_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET required_role_id=excluded.required_role_id',
      )
      .run(guildId, roleId);
  }
  map(guildId, name, roleId) {
    this.validateName(name);
    if (!/^\d{17,20}$/.test(roleId)) throw new UserError('customRoleInvalid');
    return this.db.transaction(() => {
      if (this.required(guildId) === roleId) throw new UserError('customGateOverlap');
      const rows = this.list(guildId),
        existing = rows.find((r) => r.name === name);
      if (!existing && rows.length >= 20) throw new UserError('customLimit');
      if (rows.some((r) => r.role_id === roleId && r.name !== name))
        throw new UserError('customRoleMapped');
      this.db
        .prepare(
          'INSERT INTO custom_role_mappings VALUES(?,?,?,?) ON CONFLICT(guild_id,name) DO UPDATE SET role_id=excluded.role_id,created_at=excluded.created_at',
        )
        .run(guildId, name, roleId, Date.now());
    })();
  }
  unmap(guildId, name) {
    this.validateName(name);
    return this.db
      .prepare('DELETE FROM custom_role_mappings WHERE guild_id=? AND name=?')
      .run(guildId, name).changes;
  }
}
export async function customRoleEffect(i, c, { name, claim }) {
  c.customRoles.validateName(name);
  if (typeof claim !== 'boolean') throw new TypeError('Invalid role action');
  const key = `${i.guildId}:${i.user.id}`;
  if (c.customRoles.active.has(key)) throw new UserError('roleActionBusy');
  c.customRoles.active.add(key);
  try {
    const mapping = c.customRoles.get(i.guildId, name);
    if (!mapping) throw new UserError('customMappingMissing');
    const [member, bot, role] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
      i.guild.roles.fetch(mapping.role_id, { force: true }),
    ]);
    if (!member || member.id !== i.user.id) throw new UserError('customMemberMissing');
    if (role?.id !== mapping.role_id) throw new UserError('roleInvalid');
    validateSelfRole(role, bot, { id: i.guild.ownerId }, i.guild);
    const required = c.customRoles.required(i.guildId);
    // Gate only claims. Members must always be able to release a role after gate loss.
    if (claim && required) {
      const gate = await i.guild.roles.fetch(required, { force: true });
      if (
        !gate ||
        gate.id !== required ||
        gate.guild.id !== i.guildId ||
        !member.roles.cache.has(required)
      )
        throw new UserError('customRequiredMissing');
    }
    if (!bot.permissions.has(P.ManageRoles) || !i.appPermissions?.has(P.ManageRoles))
      throw new UserError('roleBotPermission');
    const has = member.roles.cache.has(role.id);
    if (has === claim) return { changed: false };
    // Refresh config after asynchronous fetches. Do not act on a renamed mapping or changed gate.
    const latest = c.customRoles.get(i.guildId, name);
    if (
      !latest ||
      latest.role_id !== role.id ||
      (claim && c.customRoles.required(i.guildId) !== required)
    )
      throw new UserError('customConfigChanged');
    const id = c.cases.begin({
      guildId: i.guildId,
      targetId: member.id,
      actorId: member.id,
      action: claim ? 'customrole_claim' : 'customrole_release',
      reason: `Configured mapping: ${name}`,
      interactionId: i.id,
    });
    try {
      if (claim) await member.roles.add(role, 'Luna configured self-service role');
      else await member.roles.remove(role, 'Luna self-service role release');
    } catch (error) {
      const rejected = typeof error.code === 'number' && error.status >= 400 && error.status < 500;
      c.cases.finish(id, rejected ? 'failed' : 'uncertain');
      throw new UserError('customEffectUncertain', { id });
    }
    try {
      c.cases.finish(id, 'completed');
    } catch {
      throw new UserError('customStorageIncomplete', { id });
    }
    return { changed: true, id };
  } finally {
    c.customRoles.active.delete(key);
  }
}
