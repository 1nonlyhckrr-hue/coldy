import { PermissionFlagsBits as P } from 'discord.js';
import { validateSelfRole } from './rolePanels.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
function protectedRole(c, guildId, roleId) {
  const db = c.cases.db;
  return (
    db
      .prepare('SELECT role_id FROM custom_created_roles WHERE guild_id=? AND role_id=?')
      .get(guildId, roleId) ||
    db
      .prepare('SELECT role_id FROM autorole_policy WHERE guild_id=? AND role_id=?')
      .get(guildId, roleId) ||
    db
      .prepare(
        'SELECT b.role_id FROM role_panel_buttons b JOIN role_panels p ON p.id=b.panel_id WHERE p.guild_id=? AND b.role_id=?',
      )
      .get(guildId, roleId)
  );
}
async function snapshot(i, c, roleId, targetId) {
  const [actor, bot, target, role] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.members.fetch({ user: targetId, force: true }),
    i.guild.roles.fetch(roleId, { force: true }),
  ]);
  if (
    i.guild?.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  if (
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('roleBotPermission');
  if (
    target?.id !== targetId ||
    target.guild?.id !== i.guildId ||
    target.user?.bot !== false ||
    typeof target.roles?.cache?.has !== 'function'
  )
    throw new UserError('protectedTarget');
  if (
    role?.id !== roleId ||
    role.guild?.id !== i.guildId ||
    role.managed !== false ||
    protectedRole(c, i.guildId, roleId)
  )
    throw new UserError('roleInvalid');
  validateSelfRole(role, bot, actor, i.guild);
  enforceHierarchy(actor, bot, target, i.guild.ownerId);
  return { actor, bot, target, role };
}
export async function assignSafeRole(i, c, { targetId, roleId, remove = false, confirm }) {
  if (confirm !== true) throw new UserError('safeRoleEditConfirm');
  if (
    ![targetId, roleId].every((v) => typeof v === 'string' && /^\d{17,20}$/.test(v)) ||
    typeof remove !== 'boolean'
  )
    throw new UserError('safeRoleEditInput');
  let state = await snapshot(i, c, roleId, targetId);
  state = await snapshot(i, c, roleId, targetId);
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('role_add','role_remove') AND status IN ('pending','uncertain')",
      )
      .get(i.guildId, targetId)
  )
    throw new UserError('safeRoleEditUncertain');
  if (state.target.roles.cache.has(roleId) === !remove) return { changed: false };
  const action = remove ? 'remove' : 'add';
  if (typeof state.target.roles[action] !== 'function') throw new UserError('roleInvalid');
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId,
    actorId: state.actor.id,
    action: 'role_' + action,
    reason: 'Confirmed safe member role ' + action,
    interactionId: i.id,
  });
  try {
    await state.target.roles[action](
      state.role,
      'Luna | actor ' + state.actor.id + ' | safe role ' + action,
    );
    const observed = await i.guild.members.fetch({ user: targetId, force: true });
    if (
      observed?.id !== targetId ||
      observed.guild?.id !== i.guildId ||
      observed.roles?.cache?.has(roleId) !== !remove
    )
      throw Error('Unverified role membership');
    c.cases.finish(id, 'completed');
    return { changed: true, id };
  } catch {
    try {
      c.cases.finish(id, 'uncertain');
    } catch {}
    throw new UserError('safeRoleEditUncertain');
  }
}
export async function createSafeRole(i, c, { name, confirm }) {
  if (confirm !== true) throw new UserError('safeRoleEditConfirm');
  if (
    typeof name !== 'string' ||
    !name ||
    name.trim() !== name ||
    name.length > 32 ||
    /[\u0000-\u001f\u007f@]/u.test(name) ||
    !name.isWellFormed()
  )
    throw new UserError('safeRoleEditInput');
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    i.guild?.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  if (
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has(P.ManageRoles) ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('roleBotPermission');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND action='role_create' AND status IN ('pending','uncertain')",
      )
      .get(i.guildId)
  )
    throw new UserError('safeRoleEditUncertain');
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: i.guildId,
    actorId: actor.id,
    action: 'role_create',
    reason: 'Confirmed unassigned zero-permission role creation',
    interactionId: i.id,
  });
  try {
    const created = await i.guild.roles.create({
      name,
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: 'Luna | actor ' + actor.id + ' | safe role create',
    });
    if (typeof created?.id !== 'string' || !/^\d{17,20}$/.test(created.id))
      throw Error('Missing role identity');
    const role = await i.guild.roles.fetch(created.id, { force: true });
    if (
      role?.id !== created.id ||
      role.guild?.id !== i.guildId ||
      role.managed !== false ||
      role.name !== name ||
      role.permissions?.bitfield !== 0n ||
      role.hoist !== false ||
      role.mentionable !== false
    )
      throw Error('Role creation not observed');
    c.cases.finish(id, 'completed');
    return { changed: true, id, roleId: created.id };
  } catch {
    try {
      c.cases.finish(id, 'uncertain');
    } catch {}
    throw new UserError('safeRoleEditUncertain');
  }
}
