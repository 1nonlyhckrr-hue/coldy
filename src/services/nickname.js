import { PermissionFlagsBits as P } from 'discord.js';
import { enforceHierarchy } from '../utils/permissions.js';
import { UserError } from '../utils/errors.js';
export async function setNickname(i, c, { targetId, nickname, confirm }) {
  if (confirm !== true) throw new UserError('nicknameConfirm');
  if (
    !/^\d{17,20}$/.test(targetId) ||
    !(
      nickname === null ||
      (typeof nickname === 'string' &&
        nickname.trim() === nickname &&
        nickname.length > 0 &&
        nickname.length <= 32 &&
        !/[\u0000-\u001f\u007f@]/u.test(nickname))
    )
  )
    throw new UserError('nicknameInput');
  const [actor, bot, target] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.members.fetch({ user: targetId, force: true }),
  ]);
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions.has(P.ManageNicknames)
  )
    throw new UserError('userPermission');
  if (
    bot?.id !== i.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions.has(P.ManageNicknames) ||
    !i.appPermissions?.has(P.ManageNicknames)
  )
    throw new UserError('botPermission');
  if (target?.id !== targetId || target.guild?.id !== i.guildId)
    throw new UserError('modTargetUnavailable');
  enforceHierarchy(actor, bot, target, i.guild.ownerId);
  if (
    c.cases.db
      .prepare(
        "SELECT id FROM moderation_cases WHERE guild_id=? AND target_id=? AND action='nickname' AND status IN ('pending','uncertain') LIMIT 1",
      )
      .get(i.guildId, targetId)
  )
    throw new UserError('nicknameUncertain');
  if (target.nickname === nickname) return { changed: false };
  const id = c.cases.begin({
    guildId: i.guildId,
    targetId,
    actorId: actor.id,
    action: 'nickname',
    reason: nickname === null ? 'Explicit nickname reset' : 'Explicit nickname update',
    interactionId: i.id,
  });
  let accepted = false;
  try {
    await target.setNickname(nickname, `Luna | actor ${actor.id} | explicit nickname`);
    accepted = true;
    const latest = await i.guild.members.fetch({ user: targetId, force: true });
    if (latest?.id !== targetId || latest.guild?.id !== i.guildId || latest.nickname !== nickname)
      throw Error('Nickname verification failed');
  } catch (error) {
    const rejected =
      !accepted && typeof error.code === 'number' && error.status >= 400 && error.status < 500;
    c.cases.finish(id, rejected ? 'failed' : 'uncertain');
    throw new UserError('nicknameUncertain');
  }
  try {
    c.cases.finish(id, 'completed');
  } catch {
    throw new UserError('nicknameUncertain');
  }
  return { changed: true, id };
}
