import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
async function authority(i) {
  if (i.guild?.id !== i.guildId) throw new UserError('guildOnly');
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has([P.ManageGuild, P.BanMembers])
  )
    throw new UserError('userPermission');
  if (
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has(P.BanMembers) ||
    !i.appPermissions?.has(P.BanMembers)
  )
    throw new UserError('botPermission');
}
export async function banList(i, { after = null } = {}) {
  if (after !== null && (typeof after !== 'string' || !/^\d{17,20}$/.test(after)))
    throw new UserError('listIdentityInvalid');
  await authority(i);
  const bans = await i.guild.bans.fetch({
    limit: 100,
    cache: false,
    ...(after === null ? {} : { after }),
  });
  if (!bans || typeof bans.values !== 'function' || bans.size > 100)
    throw new UserError('listIdentityInvalid');
  const rows = [...bans.values()];
  if (
    rows.some(
      (r) =>
        r.guild?.id !== i.guildId ||
        !/^\d{17,20}$/.test(r.user?.id) ||
        typeof r.user.username !== 'string' ||
        !r.user.username ||
        r.user.username.length > 128 ||
        /[\u0000-\u001f\u007f]/u.test(r.user.username) ||
        !r.user.username.isWellFormed() ||
        (after !== null && BigInt(r.user.id) <= BigInt(after)),
    )
  )
    throw new UserError('listIdentityInvalid');
  if (new Set(rows.map((r) => r.user.id)).size !== rows.length)
    throw new UserError('listIdentityInvalid');
  await authority(i);
  rows.sort((a, b) => (BigInt(a.user.id) < BigInt(b.user.id) ? -1 : 1));
  return {
    records: rows.map((r) => ({ id: r.user.id, username: r.user.username })),
    nextAfter: rows.length === 100 ? rows.at(-1).user.id : null,
  };
}
