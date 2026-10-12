import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { validateSelfRole } from './rolePanels.js';
export class CustomRoles {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  creationSummary(guildId) {
    return this.db
      .prepare(
        'SELECT status,COUNT(*) count FROM custom_created_roles WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  exportCreation(guildId, ownerId) {
    const row = this.created(guildId, ownerId);
    return row
      ? {
          roleId: row.role_id,
          name: row.name,
          color: row.color,
          status: row.status,
          createdAt: row.created_at,
        }
      : null;
  }
  exportPolicy(guildId) {
    return {
      creationEnabled: this.creationEnabled(guildId),
      requiredRoleId: this.required(guildId) ?? null,
      mappings: this.list(guildId).map((r) => ({ name: r.name, roleId: r.role_id })),
    };
  }
  creationEnabled(guildId) {
    return (
      this.db
        .prepare('SELECT enabled FROM custom_role_creation_config WHERE guild_id=?')
        .get(guildId)?.enabled === 1
    );
  }
  setCreation(guildId, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid creation mode');
    this.db
      .prepare(
        'INSERT INTO custom_role_creation_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled',
      )
      .run(guildId, Number(enabled));
  }
  created(guildId, ownerId) {
    return this.db
      .prepare('SELECT * FROM custom_created_roles WHERE guild_id=? AND owner_id=?')
      .get(guildId, ownerId);
  }
  creations(guildId, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 5) throw new UserError('customCreationInput');
    return {
      count: this.db
        .prepare('SELECT count(*) n FROM custom_created_roles WHERE guild_id=?')
        .get(guildId).n,
      rows: this.db
        .prepare(
          'SELECT owner_id,role_id,status FROM custom_created_roles WHERE guild_id=? ORDER BY owner_id LIMIT 10 OFFSET ?',
        )
        .all(guildId, (page - 1) * 10),
    };
  }
  reserveCreation(guildId, ownerId, name, color, interactionId) {
    return this.db.transaction(() => {
      if (!this.creationEnabled(guildId)) throw new UserError('customCreationDisabled');
      if (this.created(guildId, ownerId)) throw new UserError('customCreationExists');
      if (
        this.db.prepare('SELECT count(*) n FROM custom_created_roles WHERE guild_id=?').get(guildId)
          .n >= 50
      )
        throw new UserError('customCreationLimit');
      this.db
        .prepare("INSERT INTO custom_created_roles VALUES(?,?,NULL,?,?,'creating',?,?)")
        .run(guildId, ownerId, name, color, interactionId, Date.now());
    })();
  }
  recordObserved(guildId, ownerId, roleId) {
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId))
      throw new UserError('customRoleInvalid');
    const result = this.db
      .prepare(
        "UPDATE custom_created_roles SET role_id=? WHERE guild_id=? AND owner_id=? AND status='creating' AND role_id IS NULL",
      )
      .run(roleId, guildId, ownerId);
    if (result.changes !== 1) throw new Error('Observed creation not recorded');
  }
  recordCreated(guildId, ownerId, roleId) {
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId))
      throw new UserError('customRoleInvalid');
    const result = this.db
      .prepare(
        "UPDATE custom_created_roles SET role_id=?,status='created' WHERE guild_id=? AND owner_id=? AND status='creating' AND role_id=?",
      )
      .run(roleId, guildId, ownerId, roleId);
    if (result.changes !== 1) throw new Error('Creation record not finalized');
  }
  creationUncertain(guildId, ownerId) {
    return (
      this.db
        .prepare(
          "UPDATE custom_created_roles SET status='uncertain' WHERE guild_id=? AND owner_id=? AND status='creating'",
        )
        .run(guildId, ownerId).changes === 1
    );
  }
  recoverCreation() {
    this.db
      .prepare("UPDATE custom_created_roles SET status='uncertain' WHERE status='creating'")
      .run();
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
  renameMapping(guildId, name, newName) {
    this.validateName(name);
    this.validateName(newName);
    return this.db.transaction(() => {
      const row = this.get(guildId, name);
      if (!row) throw new UserError('customMappingMissing');
      if (name === newName) return false;
      if (this.get(guildId, newName)) throw new UserError('customMappingExists');
      const r = this.db
        .prepare('UPDATE custom_role_mappings SET name=? WHERE guild_id=? AND name=? AND role_id=?')
        .run(newName, guildId, name, row.role_id);
      if (r.changes !== 1) throw new UserError('customConfigChanged');
      return true;
    })();
  }
  unmapRole(guildId, roleId) {
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId))
      throw new UserError('customRoleInvalid');
    return this.db
      .prepare('DELETE FROM custom_role_mappings WHERE guild_id=? AND role_id=?')
      .run(guildId, roleId).changes;
  }
  clearRequired(guildId) {
    return this.db.prepare('DELETE FROM custom_role_config WHERE guild_id=?').run(guildId).changes;
  }
  resetConfig(guildId) {
    return this.db.transaction(() => {
      const count = this.clearMappings(guildId);
      this.clearRequired(guildId);
      this.db.prepare('DELETE FROM custom_role_creation_config WHERE guild_id=?').run(guildId);
      return count;
    })();
  }
  clearMappings(guildId) {
    return this.db.prepare('DELETE FROM custom_role_mappings WHERE guild_id=?').run(guildId)
      .changes;
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
    const required = c.customRoles.required(i.guildId);
    if (claim && required) {
      const gate = await i.guild.roles.fetch(required, { force: true });
      if (gate?.id !== required || gate.guild?.id !== i.guildId)
        throw new UserError('customRequiredMissing');
    }
    const [member, bot, role] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
      i.guild.roles.fetch(mapping.role_id, { force: true }),
    ]);
    if (i.guild?.id !== i.guildId || member?.id !== i.user.id || member.guild?.id !== i.guildId)
      throw new UserError('customMemberMissing');
    if (!i.client?.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
      throw new UserError('roleBotPermission');
    if (role?.id !== mapping.role_id) throw new UserError('roleInvalid');
    validateSelfRole(role, bot, { id: i.guild.ownerId }, i.guild);
    if (claim && required && !member.roles.cache.has(required))
      throw new UserError('customRequiredMissing');
    if (!bot.permissions.has(P.ManageRoles) || !i.appPermissions?.has(P.ManageRoles))
      throw new UserError('roleBotPermission');
    // Refresh config after asynchronous fetches. Do not act on a renamed mapping or changed gate.
    const latest = c.customRoles.get(i.guildId, name);
    if (
      !latest ||
      latest.role_id !== role.id ||
      (claim && c.customRoles.required(i.guildId) !== required)
    )
      throw new UserError('customConfigChanged');
    if (member.roles.cache.has(role.id) === claim) return { changed: false };
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

export async function createOwnRole(i, c, { name, color = 0 }) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 32 ||
    /[\u0000-\u001f\u007f@]/u.test(name) ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffff
  )
    throw new UserError('customCreationInput');
  const key = `create:${i.guildId}:${i.user.id}`;
  if (c.customRoles.active.has(key)) throw new UserError('roleActionBusy');
  c.customRoles.active.add(key);
  try {
    if (!c.customRoles.creationEnabled(i.guildId)) throw new UserError('customCreationDisabled');
    let [member, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    if (
      i.guild.id !== i.guildId ||
      member?.id !== i.user.id ||
      member.guild?.id !== i.guildId ||
      member.user?.bot !== false
    )
      throw new UserError('customMemberMissing');
    if (bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
      throw new UserError('roleBotPermission');
    if (!bot.permissions.has(P.ManageRoles) || !i.appPermissions?.has(P.ManageRoles))
      throw new UserError('roleBotPermission');
    const gate = c.customRoles.required(i.guildId);
    if (gate) {
      const role = await i.guild.roles.fetch(gate, { force: true });
      if (role?.id !== gate || role.guild.id !== i.guildId || !member.roles.cache.has(gate))
        throw new UserError('customRequiredMissing');
    }
    if (gate) {
      [member, bot] = await Promise.all([
        i.guild.members.fetch({ user: i.user.id, force: true }),
        i.guild.members.fetchMe({ force: true }),
      ]);
      if (
        i.guild.id !== i.guildId ||
        member?.id !== i.user.id ||
        member.guild?.id !== i.guildId ||
        member.user?.bot !== false
      )
        throw new UserError('customMemberMissing');
      if (
        bot?.id !== i.client.user.id ||
        bot.guild?.id !== i.guildId ||
        !bot.permissions.has(P.ManageRoles) ||
        !i.appPermissions?.has(P.ManageRoles)
      )
        throw new UserError('roleBotPermission');
      if (!member.roles.cache.has(gate)) throw new UserError('customRequiredMissing');
    }
    if (!c.customRoles.creationEnabled(i.guildId) || c.customRoles.required(i.guildId) !== gate)
      throw new UserError('customConfigChanged');
    c.customRoles.reserveCreation(i.guildId, i.user.id, name.trim(), color, i.id);
    try {
      const result = await i.guild.roles.create({
        name: name.trim(),
        permissions: 0n,
        colors: { primaryColor: color },
        hoist: false,
        mentionable: false,
        reason: 'Luna opt-in member role creation;unassigned',
      });
      if (!result || !/^\d{17,20}$/.test(result.id)) throw new Error('Invalid created role');
      // Preserve the observed ID even if subsequent shape checks or finalization fail.
      c.customRoles.recordObserved(i.guildId, i.user.id, result.id);
      const [role, currentBot] = await Promise.all([
        i.guild.roles.fetch(result.id, { force: true }),
        i.guild.members.fetchMe({ force: true }),
      ]);
      if (
        currentBot?.id !== i.client.user.id ||
        currentBot.guild?.id !== i.guildId ||
        !currentBot.permissions.has(P.ManageRoles) ||
        !role ||
        role.id !== result.id ||
        role.guild.id !== i.guildId ||
        role.managed ||
        role.name !== name.trim() ||
        role.permissions.bitfield !== 0n ||
        role.hoist ||
        role.mentionable ||
        role.colors.primaryColor !== color ||
        currentBot.roles.highest.comparePositionTo(role) <= 0
      )
        throw new Error('Created role not verified');
      c.customRoles.recordCreated(i.guildId, i.user.id, role.id);
      return { roleId: role.id };
    } catch {
      c.customRoles.creationUncertain(i.guildId, i.user.id);
      throw new UserError('customCreationUncertain');
    }
  } finally {
    c.customRoles.active.delete(key);
  }
}

export async function ownRoleEffect(i, c, { claim }) {
  if (typeof claim !== 'boolean') throw new TypeError('Invalid role action');
  const key = `create:${i.guildId}:${i.user.id}`;
  if (c.customRoles.active.has(key)) throw new UserError('roleActionBusy');
  c.customRoles.active.add(key);
  try {
    const row = c.customRoles.created(i.guildId, i.user.id);
    if (!row || row.status !== 'created' || !row.role_id)
      throw new UserError('customOwnUnavailable');
    if (
      c.customRoles.db
        .prepare(
          "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('customrole_own_claim','customrole_own_release','customrole_style') AND status IN ('pending','uncertain') LIMIT 1",
        )
        .get(i.guildId, i.user.id)
    )
      throw new UserError('customOwnUncertain');
    const gate = c.customRoles.required(i.guildId);
    if (claim) {
      if (!c.customRoles.creationEnabled(i.guildId)) throw new UserError('customCreationDisabled');
      if (gate) {
        const required = await i.guild.roles.fetch(gate, { force: true });
        if (required?.id !== gate || required.guild?.id !== i.guildId)
          throw new UserError('customRequiredMissing');
      }
    }
    const [member, bot, role] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
      i.guild.roles.fetch(row.role_id, { force: true }),
    ]);
    if (
      i.guild.id !== i.guildId ||
      member?.id !== i.user.id ||
      member.guild?.id !== i.guildId ||
      member.user?.bot !== false
    )
      throw new UserError('customMemberMissing');
    if (
      bot?.id !== i.client.user.id ||
      bot.guild?.id !== i.guildId ||
      !bot.permissions.has(P.ManageRoles) ||
      !i.appPermissions?.has(P.ManageRoles)
    )
      throw new UserError('roleBotPermission');
    if (
      !role ||
      role.id !== row.role_id ||
      role.guild.id !== i.guildId ||
      role.id === i.guildId ||
      role.managed ||
      role.permissions.bitfield !== 0n ||
      role.hoist ||
      role.mentionable ||
      bot.roles.highest.comparePositionTo(role) <= 0
    )
      throw new UserError('customOwnUnsafe');
    if (claim && gate && !member.roles.cache.has(gate))
      throw new UserError('customRequiredMissing');
    const latest = c.customRoles.created(i.guildId, i.user.id);
    if (
      !latest ||
      latest.status !== 'created' ||
      latest.role_id !== role.id ||
      (claim &&
        (!c.customRoles.creationEnabled(i.guildId) || c.customRoles.required(i.guildId) !== gate))
    )
      throw new UserError('customConfigChanged');
    if (member.roles.cache.has(role.id) === claim) return { changed: false };
    const id = c.cases.begin({
      guildId: i.guildId,
      targetId: member.id,
      actorId: member.id,
      action: claim ? 'customrole_own_claim' : 'customrole_own_release',
      reason: 'Self-service created role;zero permissions',
      interactionId: i.id,
    });
    try {
      if (claim) await member.roles.add(role, 'Luna zero-permission created role self claim');
      else await member.roles.remove(role, 'Luna created role self release');
    } catch (error) {
      const rejected = typeof error.code === 'number' && error.status >= 400 && error.status < 500;
      c.cases.finish(id, rejected ? 'failed' : 'uncertain');
      throw new UserError('customOwnUncertain');
    }
    try {
      c.cases.finish(id, 'completed');
    } catch {
      throw new UserError('customOwnUncertain');
    }
    return { changed: true, id };
  } finally {
    c.customRoles.active.delete(key);
  }
}

// Reconcile only a previously observed creation ID. Never attach a supplied or guessed role.
export async function reconcileCreation(i, c, { ownerId, confirm }) {
  if (confirm !== true) throw new UserError('customReconcileConfirm');
  const key = `create:${i.guildId}:${ownerId}`;
  if (c.customRoles.active.has(key)) throw new UserError('roleActionBusy');
  c.customRoles.active.add(key);
  try {
    const row = c.customRoles.created(i.guildId, ownerId);
    if (!row || row.status !== 'uncertain' || !row.role_id)
      throw new UserError('customReconcileUnavailable');
    if (
      c.cases.db
        .prepare(
          "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='customrole_style' AND status IN ('pending','uncertain') LIMIT 1",
        )
        .get(i.guildId, ownerId)
    )
      throw new UserError('customStyleUncertain');
    const role = await i.guild.roles.fetch(row.role_id, { force: true });
    const [actor, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions.has(P.ManageRoles)
    )
      throw new UserError('roleActorPermission');
    if (
      bot?.id !== i.client.user.id ||
      bot.guild?.id !== i.guildId ||
      !bot.permissions.has(P.ManageRoles) ||
      !i.appPermissions?.has(P.ManageRoles)
    )
      throw new UserError('roleBotPermission');
    if (
      !role ||
      role.id !== row.role_id ||
      role.guild.id !== i.guildId ||
      role.id === i.guildId ||
      role.managed ||
      role.permissions.bitfield !== 0n ||
      role.hoist ||
      role.mentionable ||
      role.name !== row.name ||
      role.colors.primaryColor !== row.color ||
      bot.roles.highest.comparePositionTo(role) <= 0 ||
      (actor.id !== i.guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)
    )
      throw new UserError('customOwnUnsafe');
    const result = c.customRoles.db
      .prepare(
        "UPDATE custom_created_roles SET status='created' WHERE guild_id=? AND owner_id=? AND status='uncertain' AND role_id=? AND name=? AND color=?",
      )
      .run(i.guildId, ownerId, row.role_id, row.name, row.color);
    if (result.changes !== 1) throw new UserError('customConfigChanged');
    return { roleId: role.id };
  } finally {
    c.customRoles.active.delete(key);
  }
}

// Cosmetic edits are restricted to the caller's observed zero-permission created role.
export async function styleOwnRole(i, c, { name, color, confirm }) {
  if (confirm !== true) throw new UserError('customStyleConfirm');
  if (
    (name !== undefined &&
      (typeof name !== 'string' ||
        name.trim() !== name ||
        !name ||
        name.length > 32 ||
        /[\u0000-\u001f\u007f@]/u.test(name))) ||
    (color !== undefined && (!Number.isInteger(color) || color < 0 || color > 0xffffff)) ||
    (name === undefined && color === undefined)
  )
    throw new UserError('customCreationInput');
  const key = `create:${i.guildId}:${i.user.id}`;
  if (c.customRoles.active.has(key)) throw new UserError('roleActionBusy');
  c.customRoles.active.add(key);
  try {
    const row = c.customRoles.created(i.guildId, i.user.id),
      gate = c.customRoles.required(i.guildId);
    if (!row || row.status !== 'created' || !row.role_id)
      throw new UserError('customOwnUnavailable');
    if (!c.customRoles.creationEnabled(i.guildId)) throw new UserError('customCreationDisabled');
    if (
      c.cases.db
        .prepare(
          "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('customrole_own_claim','customrole_own_release','customrole_style') AND status IN ('pending','uncertain') LIMIT 1",
        )
        .get(i.guildId, i.user.id)
    )
      throw new UserError('customOwnUncertain');
    const role = await i.guild.roles.fetch(row.role_id, { force: true });
    if (gate) {
      const required = await i.guild.roles.fetch(gate, { force: true });
      if (required?.id !== gate || required.guild?.id !== i.guildId)
        throw new UserError('customRequiredMissing');
    }
    const [member, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    if (
      i.guild.id !== i.guildId ||
      member?.id !== i.user.id ||
      member.guild?.id !== i.guildId ||
      member.user?.bot !== false
    )
      throw new UserError('customMemberMissing');
    if (
      bot?.id !== i.client.user.id ||
      bot.guild?.id !== i.guildId ||
      !bot.permissions?.has(P.ManageRoles) ||
      !i.appPermissions?.has(P.ManageRoles)
    )
      throw new UserError('roleBotPermission');
    if (
      !role ||
      role.id !== row.role_id ||
      role.guild?.id !== i.guildId ||
      role.id === i.guildId ||
      role.managed !== false ||
      role.permissions?.bitfield !== 0n ||
      role.hoist !== false ||
      role.mentionable !== false ||
      role.name !== row.name ||
      role.colors?.primaryColor !== row.color ||
      bot.roles.highest.comparePositionTo(role) <= 0
    )
      throw new UserError('customOwnUnsafe');
    if (gate && !member.roles.cache.has(gate)) throw new UserError('customRequiredMissing');
    const latest = c.customRoles.created(i.guildId, i.user.id);
    if (
      !latest ||
      latest.status !== 'created' ||
      latest.role_id !== row.role_id ||
      latest.name !== row.name ||
      latest.color !== row.color ||
      !c.customRoles.creationEnabled(i.guildId) ||
      c.customRoles.required(i.guildId) !== gate
    )
      throw new UserError('customConfigChanged');
    const wantedName = name ?? row.name,
      wantedColor = color ?? row.color;
    if (wantedName === row.name && wantedColor === row.color) return { changed: false };
    const id = c.cases.db.transaction(() => {
      const id = c.cases.begin({
        guildId: i.guildId,
        targetId: member.id,
        actorId: member.id,
        action: 'customrole_style',
        reason: 'Explicit own-role cosmetic update;zero permissions',
        interactionId: i.id,
      });
      const r = c.customRoles.db
        .prepare(
          "UPDATE custom_created_roles SET status='uncertain',name=?,color=? WHERE guild_id=? AND owner_id=? AND status='created' AND role_id=? AND name=? AND color=?",
        )
        .run(wantedName, wantedColor, i.guildId, i.user.id, row.role_id, row.name, row.color);
      if (r.changes !== 1) throw new UserError('customConfigChanged');
      return id;
    })();
    try {
      await role.edit({
        ...(name !== undefined ? { name: wantedName } : {}),
        ...(color !== undefined ? { colors: { primaryColor: wantedColor } } : {}),
        reason: 'Luna explicit self cosmetic update',
      });
      const observed = await i.guild.roles.fetch(row.role_id, { force: true });
      if (
        observed?.id !== row.role_id ||
        observed.guild?.id !== i.guildId ||
        observed.name !== wantedName ||
        observed.colors?.primaryColor !== wantedColor ||
        observed.managed !== false ||
        observed.permissions?.bitfield !== 0n ||
        observed.hoist !== false ||
        observed.mentionable !== false
      )
        throw Error('Own role edit not observed');
      c.cases.db.transaction(() => {
        c.cases.finish(id, 'completed');
        const r = c.customRoles.db
          .prepare(
            "UPDATE custom_created_roles SET status='created' WHERE guild_id=? AND owner_id=? AND status='uncertain' AND role_id=? AND name=? AND color=?",
          )
          .run(i.guildId, i.user.id, row.role_id, wantedName, wantedColor);
        if (r.changes !== 1) throw Error('Style not finalized');
      })();
    } catch {
      try {
        c.cases.finish(id, 'uncertain');
      } catch {
        /* Pending receipt also blocks retry. */
      }
      throw new UserError('customStyleUncertain');
    }
    return { changed: true, id };
  } finally {
    c.customRoles.active.delete(key);
  }
}
