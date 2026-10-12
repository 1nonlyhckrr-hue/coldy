import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export async function memberList(i, c, { kind, page = 1, roleId = null }) {
  if (
    !['admins', 'bots', 'boosters', 'inrole'].includes(kind) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw new UserError('listPageInvalid');
  if (
    c.config.memberEventsEnabled !== true ||
    i.guild?.id !== i.guildId ||
    i.client?.isReady?.() !== true ||
    i.guild.available === false
  )
    throw new UserError('memberListEvents');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageGuild)
  )
    throw new UserError('userPermission');
  if (kind === 'inrole') {
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId))
      throw new UserError('listIdentityInvalid');
    const role = await i.guild.roles.fetch(roleId, { force: true });
    if (role?.id !== roleId || role.guild?.id !== i.guildId)
      throw new UserError('listIdentityInvalid');
  }
  const members = await i.guild.members.fetch({
    query: '',
    limit: 0,
    withPresences: false,
    time: 15000,
  });
  if (!members || typeof members.values !== 'function') throw new UserError('listIdentityInvalid');
  const rows = [...members.values()];
  if (
    rows.some(
      (r) =>
        !r ||
        r.guild?.id !== i.guildId ||
        !/^\d{17,20}$/.test(r.id) ||
        r.user?.id !== r.id ||
        typeof r.user?.bot !== 'boolean' ||
        typeof r.user.username !== 'string' ||
        r.user.username.length < 1 ||
        r.user.username.length > 128 ||
        /[\u0000-\u001f\u007f]/u.test(r.user.username) ||
        !r.user.username.isWellFormed() ||
        typeof r.permissions?.has !== 'function' ||
        (kind === 'inrole' && typeof r.roles?.cache?.has !== 'function') ||
        !(
          r.premiumSinceTimestamp === null ||
          (Number.isSafeInteger(r.premiumSinceTimestamp) && r.premiumSinceTimestamp > 0)
        ),
    )
  )
    throw new UserError('listIdentityInvalid');
  const current = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    current?.id !== i.user.id ||
    current.guild?.id !== i.guildId ||
    !current.permissions?.has(P.ManageGuild)
  )
    throw new UserError('userPermission');
  if (
    c.config.memberEventsEnabled !== true ||
    i.client.isReady() !== true ||
    i.guild.available === false
  )
    throw new UserError('memberListEvents');
  const filtered = rows.filter((r) =>
    kind === 'inrole'
      ? r.roles.cache.has(roleId)
      : kind === 'admins'
        ? r.permissions.has(P.Administrator)
        : kind === 'bots'
          ? r.user.bot
          : r.premiumSinceTimestamp !== null,
  );
  filtered.sort((a, b) => a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  if (page > pages) throw new UserError('listPageInvalid');
  return {
    kind,
    count: filtered.length,
    page,
    pages,
    records: filtered
      .slice((page - 1) * 10, page * 10)
      .map((r) => ({ id: r.id, username: r.user.username })),
  };
}
