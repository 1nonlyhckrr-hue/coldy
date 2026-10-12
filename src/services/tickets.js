import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
const read = P.ViewChannel | P.ReadMessageHistory,
  write = read | P.SendMessages | P.AttachFiles | P.EmbedLinks;
export function ticketOverwrites(guildId, botId, ownerId, supportRoleId, closed = false) {
  if (new Set([guildId, botId, ownerId, supportRoleId]).size !== 4)
    throw new UserError('ticketIdentityInvalid');
  return [
    { id: guildId, type: 0, deny: [P.ViewChannel] },
    {
      id: botId,
      type: 1,
      allow: [read | P.SendMessages | P.EmbedLinks | P.AttachFiles | P.ManageChannels],
    },
    { id: supportRoleId, type: 0, allow: [write] },
    {
      id: ownerId,
      type: 1,
      allow: [closed ? read : write],
      ...(closed ? { deny: [P.SendMessages] } : {}),
    },
  ];
}
export class Tickets {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  config(guildId) {
    return this.db.prepare('SELECT * FROM ticket_config WHERE guild_id=?').get(guildId);
  }
  summary(guildId) {
    return {
      states: this.db
        .prepare(
          'SELECT status,COUNT(*) count FROM tickets WHERE guild_id=? GROUP BY status ORDER BY status',
        )
        .all(guildId),
      storedTranscripts: this.db
        .prepare(
          'SELECT COUNT(*) n FROM ticket_transcripts t JOIN tickets k ON k.id=t.ticket_id WHERE k.guild_id=?',
        )
        .get(guildId).n,
    };
  }
  exportConfig(guildId) {
    const cfg = this.config(guildId);
    return {
      categoryId: cfg?.category_id ?? null,
      supportRoleId: cfg?.support_role_id ?? null,
      retentionDays: this.retention(guildId),
    };
  }
  exportOwn(guildId, ownerId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND owner_id=?')
        .get(guildId, ownerId).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id,status,created_at FROM tickets WHERE guild_id=? AND owner_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId, ownerId);
      return { total, truncated: total > records.length, records };
    })();
  }
  exportRecords(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM tickets WHERE guild_id=?')
        .get(guildId).n;
      const records = this.db
        .prepare(
          'SELECT id,channel_id AS channelId,status,created_at AS createdAt FROM tickets WHERE guild_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId);
      return { total, truncated: total > records.length, records };
    })();
  }
  transcriptMetadata(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare(
          'SELECT COUNT(*) n FROM ticket_transcripts t JOIN tickets k ON k.id=t.ticket_id WHERE k.guild_id=?',
        )
        .get(guildId).n;
      const records = this.db
        .prepare(
          'SELECT t.ticket_id AS ticketId,t.message_count AS messageCount,t.truncated,t.created_at AS createdAt FROM ticket_transcripts t JOIN tickets k ON k.id=t.ticket_id WHERE k.guild_id=? ORDER BY t.created_at DESC,t.ticket_id DESC LIMIT 100',
        )
        .all(guildId);
      return { total, truncated: total > records.length, records };
    })();
  }
  claimSummary(guildId) {
    return this.db
      .prepare(
        'SELECT status,(claimed_by IS NOT NULL) AS claimed,COUNT(*) AS count FROM tickets WHERE guild_id=? GROUP BY status,claimed ORDER BY status,claimed',
      )
      .all(guildId);
  }
  resetSetup(guildId) {
    return this.db.prepare('DELETE FROM ticket_config WHERE guild_id=?').run(guildId).changes;
  }
  forgetAllTranscripts(guildId) {
    return this.db
      .prepare(
        'DELETE FROM ticket_transcripts WHERE ticket_id IN (SELECT id FROM tickets WHERE guild_id=?)',
      )
      .run(guildId).changes;
  }
  forgetById(guildId, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new UserError('ticketStoredIdInvalid');
    return this.db.transaction(() => {
      if (!this.get(id, guildId)) throw new UserError('ticketStoredIdInvalid');
      return this.forgetTranscript(id, guildId);
    })();
  }
  forgetUserTranscripts(guildId, ownerId) {
    if (typeof ownerId !== 'string' || !/^\d{17,20}$/.test(ownerId))
      throw new UserError('ticketStoredIdInvalid');
    return this.db
      .prepare(
        'DELETE FROM ticket_transcripts WHERE ticket_id IN (SELECT id FROM tickets WHERE guild_id=? AND owner_id=?)',
      )
      .run(guildId, ownerId).changes;
  }
  forgetClosedTranscripts(guildId) {
    return this.db
      .prepare(
        "DELETE FROM ticket_transcripts WHERE ticket_id IN (SELECT id FROM tickets WHERE guild_id=? AND status='closed')",
      )
      .run(guildId).changes;
  }
  releaseClaims(guildId) {
    return this.db
      .prepare(
        "UPDATE tickets SET claimed_by=NULL WHERE guild_id=? AND status='open' AND claimed_by IS NOT NULL",
      )
      .run(guildId).changes;
  }
  configure(guildId, categoryId, supportRoleId) {
    this.db
      .prepare(
        'INSERT INTO ticket_config VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET category_id=excluded.category_id,support_role_id=excluded.support_role_id,updated_at=excluded.updated_at',
      )
      .run(guildId, categoryId, supportRoleId, Date.now());
  }
  reserve(guildId, ownerId, supportRoleId, interactionId) {
    return this.db.transaction(() => {
      if (
        this.db
          .prepare(
            "SELECT id FROM tickets WHERE guild_id=? AND owner_id=? AND status IN ('creating','open','closing','reopening','uncertain')",
          )
          .get(guildId, ownerId)
      )
        throw new UserError('ticketAlreadyOpen');
      if (
        this.db
          .prepare("SELECT count(*) n FROM tickets WHERE guild_id=? AND status!='closed'")
          .get(guildId).n >= 100
      )
        throw new UserError('ticketLimit');
      return Number(
        this.db
          .prepare(
            "INSERT INTO tickets(guild_id,owner_id,support_role_id,status,interaction_id,created_at) VALUES(?,?,?,'creating',?,?)",
          )
          .run(guildId, ownerId, supportRoleId, interactionId, Date.now()).lastInsertRowid,
      );
    })();
  }
  get(id, guildId) {
    return this.db.prepare('SELECT * FROM tickets WHERE id=? AND guild_id=?').get(id, guildId);
  }
  ownRecords(guildId, ownerId) {
    return this.db
      .prepare(
        'SELECT id,channel_id,status FROM tickets WHERE guild_id=? AND owner_id=? ORDER BY id DESC LIMIT 10',
      )
      .all(guildId, ownerId);
  }
  queue(guildId, page = 1, { state = null, unclaimed = false } = {}) {
    if (
      state !== null &&
      !['creating', 'open', 'closing', 'reopening', 'uncertain'].includes(state)
    )
      throw new UserError('ticketQueueFilterInvalid');
    if (typeof unclaimed !== 'boolean') throw new UserError('ticketQueueFilterInvalid');
    if (!Number.isInteger(page) || page < 1 || page > 10)
      throw new UserError('ticketQueuePageInvalid');
    return this.db
      .prepare(
        "SELECT id,channel_id,status,claimed_by FROM tickets WHERE guild_id=? AND status!='closed' AND (? IS NULL OR status=?) AND (?=0 OR claimed_by IS NULL) ORDER BY id ASC LIMIT 10 OFFSET ?",
      )
      .all(guildId, state, state, unclaimed ? 1 : 0, (page - 1) * 10);
  }
  byChannel(channelId, guildId) {
    return this.db
      .prepare('SELECT * FROM tickets WHERE channel_id=? AND guild_id=?')
      .get(channelId, guildId);
  }
  activate(id, channelId) {
    if (typeof channelId !== 'string' || !channelId.trim())
      throw new TypeError('Missing ticket channel identity');
    const result = this.db
      .prepare("UPDATE tickets SET channel_id=?,status='open' WHERE id=? AND status='creating'")
      .run(channelId, id);
    if (result.changes !== 1) throw new Error('Ticket reservation not creating');
  }
  transition(id, from, to) {
    if (!['open', 'closing', 'closed', 'reopening', 'uncertain'].includes(to))
      throw new Error('Invalid ticket state');
    const r = this.db
      .prepare('UPDATE tickets SET status=? WHERE id=? AND status=?')
      .run(to, id, from);
    if (!r.changes) throw new UserError('ticketStateInvalid');
  }
  uncertain(id, expected = null) {
    if (expected !== null && !['creating', 'open', 'closing', 'reopening'].includes(expected))
      throw new TypeError('Invalid uncertain source state');
    return (
      this.db
        .prepare(
          "UPDATE tickets SET status='uncertain' WHERE id=? AND status IN ('creating','open','closing','reopening') AND (? IS NULL OR status=?)",
        )
        .run(id, expected, expected).changes === 1
    );
  }
  claim(id, actorId) {
    const r = this.db
      .prepare(
        "UPDATE tickets SET claimed_by=? WHERE id=? AND status='open' AND (claimed_by IS NULL OR claimed_by=?)",
      )
      .run(actorId, id, actorId);
    if (!r.changes) throw new UserError('ticketClaimUnavailable');
  }
  unclaim(id, guildId, actorId) {
    const result = this.db
      .prepare(
        "UPDATE tickets SET claimed_by=NULL WHERE id=? AND guild_id=? AND status='open' AND claimed_by=?",
      )
      .run(id, guildId, actorId);
    if (!result.changes) throw new UserError('ticketUnclaimInvalid');
  }
  retention(guildId) {
    return (
      this.db.prepare('SELECT days FROM ticket_retention WHERE guild_id=?').get(guildId)?.days ?? 30
    );
  }
  setRetention(guildId, days) {
    if (!Number.isInteger(days) || days < 1 || days > 30)
      throw new UserError('ticketRetentionInvalid');
    return this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO ticket_retention VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET days=excluded.days',
        )
        .run(guildId, days);
      return this.cleanupTranscripts(guildId);
    })();
  }
  cleanupTranscripts(guildId = null) {
    return this.db
      .prepare(
        'DELETE FROM ticket_transcripts WHERE ticket_id IN (SELECT t.id FROM tickets t LEFT JOIN ticket_retention r ON r.guild_id=t.guild_id JOIN ticket_transcripts x ON x.ticket_id=t.id WHERE x.created_at<?-COALESCE(r.days,30)*86400000 AND (? IS NULL OR t.guild_id=?))',
      )
      .run(this.now(), guildId, guildId).changes;
  }
  forgetTranscript(id, guildId) {
    return this.db
      .prepare(
        'DELETE FROM ticket_transcripts WHERE ticket_id=? AND ticket_id IN (SELECT id FROM tickets WHERE guild_id=?)',
      )
      .run(id, guildId).changes;
  }
  transcript(id) {
    this.cleanupTranscripts();
    return this.db.prepare('SELECT * FROM ticket_transcripts WHERE ticket_id=?').get(id);
  }
  saveTranscript(id, record) {
    this.cleanupTranscripts();
    this.db
      .prepare(
        'INSERT INTO ticket_transcripts VALUES(?,?,?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET body=excluded.body,message_count=excluded.message_count,truncated=excluded.truncated,created_at=excluded.created_at',
      )
      .run(id, record.body, record.count, record.truncated ? 1 : 0, this.now());
  }
  recover() {
    this.cleanupTranscripts();
    this.db
      .prepare(
        "UPDATE tickets SET status='uncertain' WHERE status IN ('creating','closing','reopening')",
      )
      .run();
    this.db.prepare("UPDATE ticket_panels SET status='uncertain' WHERE status='pending'").run();
  }
  reservePanel(guildId, channelId, interactionId) {
    return Number(
      this.db
        .prepare(
          "INSERT INTO ticket_panels(guild_id,channel_id,status,interaction_id) VALUES(?,?,'pending',?)",
        )
        .run(guildId, channelId, interactionId).lastInsertRowid,
    );
  }
  panel(id, guildId) {
    return this.db
      .prepare('SELECT * FROM ticket_panels WHERE id=? AND guild_id=?')
      .get(id, guildId);
  }
  panelSent(id, messageId) {
    if (typeof messageId !== 'string' || !messageId.trim())
      throw new TypeError('Missing ticket panel message identity');
    const result = this.db
      .prepare(
        "UPDATE ticket_panels SET message_id=?,status='active' WHERE id=? AND status='pending'",
      )
      .run(messageId, id);
    if (result.changes !== 1) throw new Error('Ticket panel reservation not pending');
  }
  panelUncertain(id) {
    return (
      this.db
        .prepare("UPDATE ticket_panels SET status='uncertain' WHERE id=? AND status='pending'")
        .run(id).changes === 1
    );
  }
}
export async function requireTicketManager(i) {
  if (!i.guildId || i.guild?.id !== i.guildId) throw new UserError('userPermission');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageGuild)
  )
    throw new UserError('userPermission');
  return actor;
}
export function requireTicketBot(guild, bot) {
  if (
    !guild?.id ||
    !guild.client?.user?.id ||
    bot?.id !== guild.client.user.id ||
    bot.guild?.id !== guild.id
  )
    throw new UserError('ticketBotPermission');
  return bot;
}
export async function validateTicketConfig(guild, categoryId, supportRoleId) {
  const [category, role, bot] = await Promise.all([
    guild.channels.fetch(categoryId, { force: true }),
    guild.roles.fetch(supportRoleId, { force: true }),
    guild.members.fetchMe({ force: true }),
  ]);
  if (
    !category ||
    category.id !== categoryId ||
    category.guildId !== guild.id ||
    category.type !== ChannelType.GuildCategory
  )
    throw new UserError('ticketCategoryInvalid');
  if (
    !role ||
    role.id !== supportRoleId ||
    role.guild.id !== guild.id ||
    role.id === guild.id ||
    role.managed
  )
    throw new UserError('ticketSupportInvalid');
  requireTicketBot(guild, bot);
  if (
    !bot.permissions.has([
      P.ManageChannels,
      P.ViewChannel,
      P.SendMessages,
      P.EmbedLinks,
      P.ReadMessageHistory,
    ])
  )
    throw new UserError('ticketBotPermission');
  return { category, role, bot };
}
export async function requireTicketAccess(i, ticket, { staff = false } = {}) {
  if (!ticket) throw new UserError('ticketNotFound');
  if (i.guild?.id !== i.guildId || ticket.guild_id !== i.guildId)
    throw new UserError('ticketAccessDenied');
  const member = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (member?.id !== i.user.id || member.guild?.id !== i.guildId)
    throw new UserError('ticketAccessDenied');
  const isStaff =
    i.user.id === i.guild.ownerId ||
    member.permissions.has(P.ManageGuild) ||
    member.roles.cache.has(ticket.support_role_id);
  if (!isStaff && (staff || ticket.owner_id !== i.user.id))
    throw new UserError('ticketAccessDenied');
  return member;
}
export async function verifyTicketPrivacy(channel, ticket, botId) {
  if (
    !channel ||
    channel.guildId !== ticket.guild_id ||
    channel.id !== ticket.channel_id ||
    channel.type !== ChannelType.GuildText
  )
    throw new UserError('ticketChannelInvalid');
  const expected = ticketOverwrites(
    ticket.guild_id,
    botId,
    ticket.owner_id,
    ticket.support_role_id,
    ticket.status === 'closed',
  );
  const actual = channel.permissionOverwrites.cache;
  if (actual.size !== expected.length) throw new UserError('ticketPrivacyMismatch');
  for (const rule of expected) {
    const a = actual.get(rule.id);
    if (!a || a.type !== rule.type) throw new UserError('ticketPrivacyMismatch');
    const allow = (rule.allow ?? []).reduce((x, y) => x | y, 0n),
      deny = (rule.deny ?? []).reduce((x, y) => x | y, 0n);
    if (a.allow.bitfield !== allow || a.deny.bitfield !== deny)
      throw new UserError('ticketPrivacyMismatch');
  }
}
