import { requireVoiceReady, voiceOccupancy } from './voiceReadiness.js';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export function privateVoiceOverwrites(guildId, botId, ownerId, publicAccess = false) {
  if (new Set([guildId, botId, ownerId]).size !== 3) throw new UserError('vmIdentityInvalid');
  return [
    {
      id: guildId,
      type: 0,
      ...(publicAccess
        ? { allow: [P.ViewChannel, P.Connect] }
        : { deny: [P.ViewChannel, P.Connect] }),
    },
    { id: botId, type: 1, allow: [P.ViewChannel, P.Connect, P.ManageChannels] },
    { id: ownerId, type: 1, allow: [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD] },
  ];
}
export function verifyPrivateVoice(channel, row, botId) {
  if (
    !channel ||
    channel.guildId !== row.guild_id ||
    channel.id !== row.channel_id ||
    channel.type !== ChannelType.GuildVoice
  )
    throw new UserError('vmChannelInvalid');
  const expected = privateVoiceOverwrites(row.guild_id, botId, row.owner_id, !!row.public_access),
    actual = channel.permissionOverwrites.cache;
  if (actual.size !== expected.length) throw new UserError('vmAccessChanged');
  for (const rule of expected) {
    const value = actual.get(rule.id),
      allow = (rule.allow ?? []).reduce((a, b) => a | b, 0n),
      deny = (rule.deny ?? []).reduce((a, b) => a | b, 0n);
    if (
      !value ||
      value.type !== rule.type ||
      value.allow.bitfield !== allow ||
      value.deny.bitfield !== deny
    )
      throw new UserError('vmAccessChanged');
  }
}
export class VoiceMaster {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  config(guildId) {
    return this.db
      .prepare('SELECT category_id FROM voice_master_config WHERE guild_id=?')
      .get(guildId);
  }
  resetSetup(guildId) {
    return this.db.prepare('DELETE FROM voice_master_config WHERE guild_id=?').run(guildId).changes;
  }
  records(guildId, page = 1, state = null) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000 ||
      (state !== null && !['creating', 'active', 'deleting', 'closed', 'uncertain'].includes(state))
    )
      throw new UserError('vmRecordsInvalid');
    return this.db.transaction(() => {
      const total = this.db
          .prepare(
            'SELECT count(*) n FROM voice_master_channels WHERE guild_id=? AND (? IS NULL OR status=?)',
          )
          .get(guildId, state, state).n,
        pages = Math.max(1, Math.ceil(total / 10));
      if (page > pages) throw new UserError('vmRecordsInvalid');
      return {
        total,
        pages,
        page,
        rows: this.db
          .prepare(
            'SELECT id,owner_id,channel_id,status,public_access FROM voice_master_channels WHERE guild_id=? AND (? IS NULL OR status=?) ORDER BY id DESC LIMIT 10 OFFSET ?',
          )
          .all(guildId, state, state, (page - 1) * 10),
      };
    })();
  }
  setup(guildId, categoryId) {
    if (!/^\d{17,20}$/.test(categoryId)) throw new UserError('vmCategoryInvalid');
    this.db
      .prepare(
        'INSERT INTO voice_master_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET category_id=excluded.category_id',
      )
      .run(guildId, categoryId);
  }
  owned(guildId, userId) {
    return this.db
      .prepare(
        "SELECT * FROM voice_master_channels WHERE guild_id=? AND owner_id=? AND status!='closed'",
      )
      .get(guildId, userId);
  }
  reserve(guildId, userId, interactionId) {
    return this.db.transaction(() => {
      if (this.owned(guildId, userId)) throw new UserError('vmAlreadyOpen');
      if (
        this.db
          .prepare(
            "SELECT count(*) n FROM voice_master_channels WHERE guild_id=? AND status!='closed'",
          )
          .get(guildId).n >= 50
      )
        throw new UserError('vmLimit');
      return Number(
        this.db
          .prepare(
            "INSERT INTO voice_master_channels(guild_id,owner_id,status,interaction_id,created_at) VALUES(?,?,'creating',?,?)",
          )
          .run(guildId, userId, interactionId, Date.now()).lastInsertRowid,
      );
    })();
  }
  created(id, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new TypeError('Missing voice channel identity');
    const result = this.db
      .prepare(
        "UPDATE voice_master_channels SET channel_id=? WHERE id=? AND status='creating' AND (channel_id IS NULL OR channel_id=?)",
      )
      .run(channelId, id, channelId);
    if (result.changes !== 1) throw new Error('Voice reservation not creating');
  }
  activate(id, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new TypeError('Missing voice channel identity');
    const result = this.db
      .prepare(
        "UPDATE voice_master_channels SET channel_id=?,status='active' WHERE id=? AND status='creating' AND (channel_id IS NULL OR channel_id=?)",
      )
      .run(channelId, id, channelId);
    if (result.changes !== 1) throw new Error('Voice reservation not creating');
  }
  creationUncertain(id) {
    return this.db
      .prepare(
        "UPDATE voice_master_channels SET status='uncertain' WHERE id=? AND status='creating'",
      )
      .run(id).changes;
  }
  transition(id, expected, status) {
    if (
      !['active', 'deleting'].includes(expected) ||
      !['deleting', 'closed', 'uncertain'].includes(status)
    )
      throw new TypeError('Invalid VoiceMaster transition');
    const result = this.db
      .prepare('UPDATE voice_master_channels SET status=? WHERE id=? AND status=?')
      .run(status, id, expected);
    if (result.changes !== 1) throw new Error('Voice state changed');
  }
  status(id, status) {
    if (!['deleting', 'closed', 'uncertain'].includes(status))
      throw new TypeError('Invalid VoiceMaster state');
    this.db.prepare('UPDATE voice_master_channels SET status=? WHERE id=?').run(status, id);
  }
  recover() {
    this.db
      .prepare(
        "UPDATE voice_master_channels SET status='uncertain' WHERE status IN ('creating','deleting')",
      )
      .run();
  }
}
function verifyVoiceActors(i, owner, bot) {
  if (
    i.guild?.id !== i.guildId ||
    owner?.id !== i.user.id ||
    owner.guild?.id !== i.guildId ||
    owner.user?.bot !== false
  )
    throw new UserError('customMemberMissing');
  if (!i.client?.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
    throw new UserError('vmBotPermission');
}
export async function openPrivateVoice(i, c) {
  requireVoiceReady(i, c);
  const key = `${i.guildId}:${i.user.id}`;
  if (c.voiceMaster.active.has(key)) throw new UserError('roleActionBusy');
  c.voiceMaster.active.add(key);
  try {
    const cfg = c.voiceMaster.config(i.guildId);
    if (!cfg) throw new UserError('vmNotConfigured');
    const category = await i.guild.channels.fetch(cfg.category_id, { force: true });
    const [owner, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    verifyVoiceActors(i, owner, bot);
    if (
      !category ||
      category.id !== cfg.category_id ||
      category.guildId !== i.guildId ||
      category.type !== ChannelType.GuildCategory
    )
      throw new UserError('vmCategoryInvalid');
    if (!category.permissionsFor(owner)?.has([P.ViewChannel, P.Connect]))
      throw new UserError('vmOwnerPermission');
    if (
      !bot.permissions.has([P.ManageChannels, P.ViewChannel, P.Connect]) ||
      !category.permissionsFor(bot)?.has([P.ViewChannel, P.ManageChannels, P.Connect])
    )
      throw new UserError('vmBotPermission');
    if (c.voiceMaster.config(i.guildId)?.category_id !== category.id)
      throw new UserError('customConfigChanged');
    requireVoiceReady(i, c);
    const id = c.voiceMaster.reserve(i.guildId, i.user.id, i.id);
    let channel;
    try {
      channel = await i.guild.channels.create({
        name: `luna-voice-${id}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: 1,
        permissionOverwrites: privateVoiceOverwrites(i.guildId, bot.id, i.user.id),
        reason: 'Luna private temporary voice channel',
      });
    } catch {
      c.voiceMaster.creationUncertain(id);
      throw new UserError('vmCreateUncertain', { id });
    }
    try {
      c.voiceMaster.created(id, channel.id);
      verifyPrivateVoice(
        channel,
        { guild_id: i.guildId, owner_id: i.user.id, channel_id: channel.id },
        bot.id,
      );
      c.voiceMaster.activate(id, channel.id);
    } catch {
      c.voiceMaster.creationUncertain(id);
      throw new UserError('vmCreateUncertain', { id });
    }
    return { id, channelId: channel.id };
  } finally {
    c.voiceMaster.active.delete(key);
  }
}
export async function editPrivateVoice(i, c, { action, name, limit, share, bitrate }) {
  requireVoiceReady(i, c);
  if (!['rename', 'limit', 'close', 'lock', 'unlock', 'bitrate', 'regionauto'].includes(action))
    throw new UserError('vmActionInvalid');
  if (
    action === 'rename' &&
    (typeof name !== 'string' ||
      !name.trim() ||
      name.length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(name))
  )
    throw new UserError('vmNameInvalid');
  if (action === 'limit' && (!Number.isInteger(limit) || limit < 1 || limit > 99))
    throw new UserError('vmUserLimitInvalid');
  if (action === 'bitrate' && (!Number.isSafeInteger(bitrate) || bitrate < 8000 || bitrate > 96000))
    throw new UserError('vmBitrateInvalid');
  if (action === 'unlock' && share !== true) throw new UserError('vmPublicConfirm');
  const key = `${i.guildId}:${i.user.id}`;
  if (c.voiceMaster.active.has(key)) throw new UserError('roleActionBusy');
  c.voiceMaster.active.add(key);
  try {
    const row = c.voiceMaster.owned(i.guildId, i.user.id);
    if (!row || row.status !== 'active') throw new UserError('vmNotActive');
    const channel = await i.guild.channels.fetch(row.channel_id, { force: true });
    const [owner, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    verifyVoiceActors(i, owner, bot);
    if (owner.id !== row.owner_id) throw new UserError('customMemberMissing');
    verifyPrivateVoice(channel, row, bot.id);
    if (
      !channel.permissionsFor(bot)?.has(P.ManageChannels) ||
      !i.appPermissions?.has(P.ManageChannels)
    )
      throw new UserError('vmBotPermission');
    if (
      ['close', 'lock', 'unlock', 'bitrate', 'regionauto'].includes(action) &&
      voiceOccupancy(i.guild, channel.id) !== 0
    )
      throw new UserError('vmNotEmpty');
    if (
      ['lock', 'unlock'].includes(action) &&
      (!bot.permissions.has(P.ManageRoles) || !channel.permissionsFor(bot)?.has(P.ManageRoles))
    )
      throw new UserError('vmBotPermission');
    const latest = c.voiceMaster.owned(i.guildId, i.user.id);
    if (latest?.id !== row.id || latest.status !== 'active') throw new UserError('vmNotActive');
    requireVoiceReady(i, c);
    const caseId = c.cases.begin({
      guildId: i.guildId,
      targetId: channel.id,
      actorId: i.user.id,
      action: `voicemaster_${action}`,
      reason: 'Owner requested private voice channel change',
      interactionId: i.id,
    });
    if (action === 'close') c.voiceMaster.transition(row.id, 'active', 'deleting');
    if (['lock', 'unlock', 'bitrate', 'regionauto'].includes(action))
      c.voiceMaster.transition(row.id, 'active', 'uncertain');
    try {
      if (action === 'rename') await channel.setName(name.trim(), 'Luna owner voice rename');
      else if (action === 'limit') await channel.setUserLimit(limit, 'Luna owner voice limit');
      else if (action === 'bitrate' || action === 'regionauto') {
        if (action === 'bitrate') await channel.setBitrate(bitrate, 'Luna owner voice bitrate');
        else await channel.setRTCRegion(null, 'Luna owner automatic voice region');
        const current = await i.guild.channels.fetch(row.channel_id, { force: true });
        verifyPrivateVoice(current, row, bot.id);
        if (action === 'bitrate' ? current.bitrate !== bitrate : current.rtcRegion !== null)
          throw new Error('Voice setting not observed');
      } else if (['lock', 'unlock'].includes(action)) {
        await channel.permissionOverwrites.set(
          privateVoiceOverwrites(i.guildId, bot.id, i.user.id, action === 'unlock'),
          'Luna owner confirmed voice access change',
        );
        const current = await i.guild.channels.fetch(row.channel_id, { force: true });
        verifyPrivateVoice(current, { ...row, public_access: action === 'unlock' ? 1 : 0 }, bot.id);
      } else await channel.delete('Luna owner closed empty private voice channel');
    } catch {
      if (action === 'close') {
        try {
          c.voiceMaster.transition(row.id, 'deleting', 'uncertain');
        } catch {}
      }
      c.cases.finish(caseId, 'uncertain');
      throw new UserError('vmEditUncertain', { id: caseId });
    }
    try {
      if (action === 'close') c.voiceMaster.transition(row.id, 'deleting', 'closed');
      if (['bitrate', 'regionauto'].includes(action)) {
        const result = c.voiceMaster.db
          .prepare(
            "UPDATE voice_master_channels SET status='active' WHERE id=? AND guild_id=? AND owner_id=? AND channel_id=? AND public_access=? AND status='uncertain'",
          )
          .run(row.id, row.guild_id, row.owner_id, row.channel_id, row.public_access);
        if (result.changes !== 1) throw new Error('Voice setting receipt changed');
      }
      if (['lock', 'unlock'].includes(action)) {
        const result = c.voiceMaster.db
          .prepare(
            "UPDATE voice_master_channels SET status='active',public_access=? WHERE id=? AND status='uncertain' AND guild_id=? AND owner_id=? AND channel_id=? AND public_access=?",
          )
          .run(
            action === 'unlock' ? 1 : 0,
            row.id,
            row.guild_id,
            row.owner_id,
            row.channel_id,
            row.public_access,
          );
        if (result.changes !== 1) throw new Error('Voice access receipt changed');
      }
      c.cases.finish(caseId, 'completed');
    } catch {
      throw new UserError('vmEditUncertain', { id: caseId });
    }
    return caseId;
  } finally {
    c.voiceMaster.active.delete(key);
  }
}

// Reconcile only an already recorded channel ID. Never search by name or adopt arbitrary channels.
export async function reconcilePrivateVoice(i, c, { confirm }) {
  requireVoiceReady(i, c);
  if (confirm !== true) throw new UserError('vmRepairConfirm');
  const key = `${i.guildId}:${i.user.id}`;
  if (c.voiceMaster.active.has(key)) throw new UserError('roleActionBusy');
  c.voiceMaster.active.add(key);
  try {
    const row = c.voiceMaster.owned(i.guildId, i.user.id);
    if (!row || !['active', 'uncertain'].includes(row.status)) throw new UserError('vmNotActive');
    if (!row.channel_id) throw new UserError('vmRepairNoId');
    let channel;
    try {
      channel = await i.guild.channels.fetch(row.channel_id, { force: true });
    } catch (error) {
      if (error.code === 10003 && error.status === 404) channel = null;
      else throw new UserError('vmRepairUnavailable');
    }
    const [owner, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    verifyVoiceActors(i, owner, bot);
    if (owner.id !== row.owner_id) throw new UserError('customMemberMissing');
    if (!bot.permissions.has(P.ManageChannels) || !i.appPermissions?.has(P.ManageChannels))
      throw new UserError('vmBotPermission');
    if (channel) {
      verifyPrivateVoice(channel, row, bot.id);
      if (!channel.permissionsFor(bot)?.has(P.ManageChannels))
        throw new UserError('vmBotPermission');
    }
    const latest = c.voiceMaster.owned(i.guildId, i.user.id);
    if (
      latest?.id !== row.id ||
      latest.status !== row.status ||
      latest.channel_id !== row.channel_id
    )
      throw new UserError('vmNotActive');
    requireVoiceReady(i, c);
    const caseId = c.cases.begin({
      guildId: i.guildId,
      targetId: row.channel_id,
      actorId: i.user.id,
      action: 'voicemaster_reconcile',
      reason: channel
        ? 'Owner verified tracked private voice channel exists'
        : 'Owner verified tracked private voice channel missing',
      interactionId: i.id,
    });
    c.voiceMaster.db.transaction(() => {
      const result = c.voiceMaster.db
        .prepare(
          'UPDATE voice_master_channels SET status=? WHERE id=? AND status=? AND channel_id=?',
        )
        .run(channel ? 'active' : 'closed', row.id, row.status, row.channel_id);
      if (result.changes !== 1) throw new UserError('vmNotActive');
      c.cases.finish(caseId, 'completed');
    })();
    return { caseId, status: channel ? 'active' : 'closed', channelId: row.channel_id };
  } finally {
    c.voiceMaster.active.delete(key);
  }
}
