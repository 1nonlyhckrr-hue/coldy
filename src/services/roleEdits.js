import { PermissionFlagsBits as P } from 'discord.js';
import { validateSelfRole } from './rolePanels.js';
import { UserError } from '../utils/errors.js';
export async function editSafeRole(i, c, { roleId, action, value, confirm }) {
  if (confirm !== true) throw new UserError('safeRoleEditConfirm');
  if (!/^\d{17,20}$/.test(roleId) || !['rename', 'color', 'mentionable'].includes(action))
    throw new UserError('safeRoleEditInput');
  if (
    (action === 'rename' &&
      (typeof value !== 'string' ||
        !value ||
        value.trim() !== value ||
        value.length > 32 ||
        /[\u0000-\u001f\u007f@]/u.test(value))) ||
    (action === 'color' && (!Number.isInteger(value) || value < 0 || value > 0xffffff)) ||
    (action === 'mentionable' && typeof value !== 'boolean')
  )
    throw new UserError('safeRoleEditInput');
  const role = await i.guild.roles.fetch(roleId, { force: true });
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  if (
    bot?.id !== i.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('roleBotPermission');
  if (role?.id !== roleId || role.guild?.id !== i.guildId || role.managed !== false)
    throw new UserError('roleInvalid');
  validateSelfRole(role, bot, actor, i.guild);
  // Created self-service roles have their own stored style/uncertainty workflow.
  if (
    c.cases.db
      .prepare('SELECT owner_id FROM custom_created_roles WHERE guild_id=? AND role_id=? LIMIT 1')
      .get(i.guildId, roleId)
  )
    throw new UserError('safeRoleCreatedManaged');
  const property = { rename: 'name', color: 'color', mentionable: 'mentionable' }[action],
    before = action === 'color' ? role.colors?.primaryColor : role[property];
  if (
    (action === 'color' && (!Number.isInteger(before) || before < 0 || before > 0xffffff)) ||
    (action === 'rename' && typeof before !== 'string') ||
    (action === 'mentionable' && typeof before !== 'boolean')
  )
    throw new UserError('safeRoleEditInput');
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action IN ('role_rename','role_color','role_mentionable') AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, roleId)
  )
    throw new UserError('safeRoleEditUncertain');
  if (before === value) return { changed: false };
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId: roleId,
    actorId: actor.id,
    action: 'role_' + action,
    reason: 'Confirmed safe-role metadata edit',
    interactionId: i.id,
  });
  let accepted = false;
  try {
    const patch = { reason: `Luna | actor ${actor.id} | safe role ${action}` };
    if (action === 'color') patch.colors = { primaryColor: value };
    else patch[property] = value;
    await role.edit(patch);
    accepted = true;
    const latest = await i.guild.roles.fetch(roleId, { force: true });
    if (
      latest?.id !== roleId ||
      latest.guild?.id !== i.guildId ||
      latest.managed !== false ||
      (action === 'color' ? latest.colors?.primaryColor : latest[property]) !== value
    )
      throw Error('Role setting not observed');
    validateSelfRole(latest, bot, actor, i.guild);
  } catch (error) {
    const rejected =
      !accepted && typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    try {
      c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    } catch {
      /*Pending blocks retry*/
    }
    throw new UserError('safeRoleEditUncertain');
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('safeRoleEditUncertain');
  }
  return { changed: true, id };
}
