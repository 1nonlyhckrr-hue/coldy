import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
const AGE = 13 * 86400000;
export class PurgePlans {
  constructor(db) {
    this.db = db;
  }
  get(id, guildId, actorId) {
    return this.db
      .prepare('SELECT * FROM purge_plans WHERE id=? AND guild_id=? AND actor_id=?')
      .get(id, guildId, actorId);
  }
  reserve(i, channelId, ids, now) {
    return this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM purge_plans WHERE created_at<? AND status='preview'")
        .run(now - 86400000);
      if (
        this.db
          .prepare("SELECT count(*) n FROM purge_plans WHERE guild_id=? AND status='preview'")
          .get(i.guildId).n >= 50
      )
        throw new UserError('purgePlanLimit');
      return Number(
        this.db
          .prepare(
            "INSERT INTO purge_plans(guild_id,actor_id,channel_id,ids_json,status,created_at,interaction_id) VALUES(?,?,?,?,'preview',?,?)",
          )
          .run(i.guildId, i.user.id, channelId, JSON.stringify(ids), now, i.id).lastInsertRowid,
      );
    })();
  }
  claim(id, now) {
    const r = this.db
      .prepare(
        "UPDATE purge_plans SET status='executing' WHERE id=? AND status='preview' AND created_at>=?",
      )
      .run(id, now - 120000);
    if (r.changes !== 1) throw new UserError('purgePlanExpired');
  }
  finish(id, status) {
    if (!['completed', 'uncertain'].includes(status)) throw new TypeError('Invalid purge state');
    const result = this.db
      .prepare("UPDATE purge_plans SET status=? WHERE id=? AND status='executing'")
      .run(status, id);
    if (result.changes !== 1) throw new Error('Purge plan not executing');
  }
  recover() {
    this.db.prepare("UPDATE purge_plans SET status='uncertain' WHERE status='executing'").run();
  }
}
async function access(i, channelId) {
  const [actor, bot, channel] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    i.guild.channels.fetch(channelId, { force: true }),
  ]);
  if (i.guild?.id !== i.guildId || actor?.id !== i.user.id || actor.guild?.id !== i.guildId)
    throw new UserError('userPermission');
  if (!i.client?.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
    throw new UserError('purgeBotPermission');
  if (
    !channel ||
    channel.id !== channelId ||
    channel.guildId !== i.guildId ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
  )
    throw new UserError('purgeChannelInvalid');
  if (!channel.permissionsFor(actor)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages]))
    throw new UserError('userPermission');
  if (
    !i.appPermissions?.has(P.ManageMessages) ||
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages])
  )
    throw new UserError('purgeBotPermission');
  return channel;
}
function eligible(m, i, channelId, now) {
  return (
    !!m &&
    /^\d{17,20}$/.test(m.id) &&
    m.guildId === i.guildId &&
    m.channelId === channelId &&
    !m.pinned &&
    !m.system &&
    Number.isFinite(m.createdTimestamp) &&
    m.createdTimestamp <= now &&
    m.createdTimestamp > now - AGE
  );
}
export async function previewPurge(i, c, { channelId, count }, now = Date.now()) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10)
    throw new UserError('purgeCountInvalid');
  const channel = await access(i, channelId);
  const messages = await channel.messages.fetch({ limit: count, cache: false });
  const ids = [...messages.values()].filter((m) => eligible(m, i, channelId, now)).map((m) => m.id);
  if (!ids.length) throw new UserError('purgeEmpty');
  if (new Set(ids).size !== ids.length || ids.length > count) throw new UserError('purgeChanged');
  return { id: c.purgePlans.reserve(i, channelId, ids, now), ids, channelId };
}
export async function confirmPurge(i, c, { id, confirm }, now = Date.now()) {
  if (confirm !== true) throw new UserError('purgeConfirmRequired');
  const row = c.purgePlans.get(id, i.guildId, i.user.id);
  if (!row || row.status !== 'preview' || row.created_at < now - 120000)
    throw new UserError('purgePlanExpired');
  const channel = await access(i, row.channel_id),
    ids = JSON.parse(row.ids_json);
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length)
    throw new UserError('purgeChanged');
  // Force-fetch each exact previewed ID. Do not replace disappeared messages with new messages.
  for (const message of ids) {
    let m;
    try {
      m = await channel.messages.fetch({ message, force: true, cache: false });
    } catch {
      throw new UserError('purgeChanged');
    }
    if (!m || m.id !== message || !eligible(m, i, row.channel_id, now))
      throw new UserError('purgeChanged');
  }
  const verified = await access(i, row.channel_id);
  const current = c.purgePlans.get(row.id, i.guildId, i.user.id);
  if (
    !current ||
    current.status !== 'preview' ||
    ['guild_id', 'actor_id', 'channel_id', 'ids_json', 'created_at', 'interaction_id'].some(
      (key) => current[key] !== row[key],
    )
  )
    throw new UserError('purgeChanged');
  c.purgePlans.claim(row.id, now);
  let caseId;
  try {
    caseId = c.cases.begin({
      guildId: i.guildId,
      targetId: row.channel_id,
      actorId: i.user.id,
      action: 'purge',
      reason: `Confirmed preview #${row.id}: ${ids.length} exact message IDs`,
      interactionId: i.id,
    });
  } catch (error) {
    c.purgePlans.finish(row.id, 'uncertain');
    throw error;
  }
  try {
    const deleted = await verified.bulkDelete(ids, false);
    if (
      !deleted ||
      (deleted.size !== ids.length && !(ids.length === 1 && deleted.size === 0)) ||
      typeof deleted.has !== 'function' ||
      (deleted.size !== 0 && ids.some((messageId) => !deleted.has(messageId)))
    )
      throw new Error('Missing exact purge deletion receipt');
  } catch {
    try {
      c.purgePlans.finish(row.id, 'uncertain');
    } catch {}
    try {
      c.cases.finish(caseId, 'uncertain');
    } catch {}
    throw new UserError('purgeUncertain', { id: caseId });
  }
  try {
    c.purgePlans.db.transaction(() => {
      c.purgePlans.finish(row.id, 'completed');
      c.cases.finish(caseId, 'completed');
    })();
  } catch {
    throw new UserError('purgeUncertain', { id: caseId });
  }
  return { caseId, count: ids.length };
}
