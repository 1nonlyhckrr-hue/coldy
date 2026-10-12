import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openPrivateVoice, verifyPrivateVoice } from './voiceMaster.js';
import { requireVoiceReady, voiceOccupancy } from './voiceReadiness.js';
import { UserError } from '../utils/errors.js';
export class VoiceJoin {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  get(g) {
    return this.db.prepare('SELECT * FROM vm_join_config WHERE guild_id=?').get(g) ?? null;
  }
  set(g, ch, actor) {
    this.db
      .prepare(
        'INSERT INTO vm_join_config VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,actor_id=excluded.actor_id,revision=excluded.revision',
      )
      .run(g, ch, actor, randomUUID());
  }
  off(g) {
    return this.db.prepare('DELETE FROM vm_join_config WHERE guild_id=?').run(g).changes;
  }
  reserve(g, u, ch) {
    return (
      this.db.prepare("INSERT OR IGNORE INTO vm_join_moves VALUES(?,?,?,'reserved')").run(g, u, ch)
        .changes === 1
    );
  }
  finish(g, u, ch, status) {
    this.db
      .prepare(
        "UPDATE vm_join_moves SET status=? WHERE guild_id=? AND user_id=? AND channel_id=? AND status='reserved'",
      )
      .run(status, g, u, ch);
  }
  // Only channels this flow created have a move receipt, so cleanup can never touch others.
  createdChannel(g, ch) {
    return !!this.db
      .prepare('SELECT 1 FROM vm_join_moves WHERE guild_id=? AND channel_id=?')
      .get(g, ch);
  }
  recover() {
    this.db.prepare("UPDATE vm_join_moves SET status='uncertain' WHERE status='reserved'").run();
  }
}
async function snapshot(state, c, policy) {
  requireVoiceReady({ guild: state.guild, client: state.client }, c);
  const [member, bot, actor, voice, lobby] = await Promise.all([
    state.guild.members.fetch({ user: state.id, force: true }),
    state.guild.members.fetchMe({ force: true }),
    state.guild.members.fetch({ user: policy.actor_id, force: true }),
    state.guild.voiceStates.fetch(state.id, { force: true }),
    state.guild.channels.fetch(policy.channel_id, { force: true }),
  ]);
  // Named checks so a failure says exactly which condition broke, not just "unavailable".
  const checks = {
    member:
      member?.id === state.id && member.guild?.id === state.guild.id && member.user?.bot === false,
    voiceState:
      voice?.id === state.id &&
      voice.guild?.id === state.guild.id &&
      voice.channelId === policy.channel_id,
    botIdentity: bot?.id === state.client?.user?.id && bot.guild?.id === state.guild.id,
    botMoveManageChannels: !!bot?.permissions?.has([P.MoveMembers, P.ManageChannels]),
    configuringUser: actor?.id === policy.actor_id && actor.guild?.id === state.guild.id,
    configuringUserMoveManageChannels: !!actor?.permissions?.has([P.MoveMembers, P.ManageChannels]),
    lobby:
      lobby?.id === policy.channel_id &&
      lobby.guildId === state.guild.id &&
      lobby.type === ChannelType.GuildVoice &&
      state.guild.afkChannelId !== lobby.id,
    botLobbyAccess: !!lobby?.permissionsFor?.(bot)?.has([P.ViewChannel, P.Connect, P.MoveMembers]),
    memberLobbyAccess: !!lobby?.permissionsFor?.(member)?.has([P.ViewChannel, P.Connect]),
    policyRevision: c.voiceJoin.get(state.guild.id)?.revision === policy.revision,
  };
  const failed = Object.keys(checks).filter((name) => !checks[name]);
  if (failed.length) {
    const error = new UserError('vmJoinUnavailable');
    error.detail = failed.join(',');
    throw error;
  }
  return { member, bot };
}
export function createVoiceJoinHandler(c) {
  return async (old, state) => {
    if (
      c.config.voiceEventsEnabled !== true ||
      !state?.guild ||
      old?.guild?.id !== state.guild.id ||
      old.id !== state.id ||
      old.channelId === state.channelId
    )
      return;
    const p = c.voiceJoin.get(state.guild.id);
    if (!p || p.channel_id !== state.channelId || !/^\d{17,20}$/.test(state.id)) return;
    const key = state.guild.id + ':' + state.id;
    if (c.voiceJoin.active.has(key)) return;
    c.voiceJoin.active.add(key);
    let created,
      reserved = false;
    try {
      await snapshot(state, c, p);
      if (c.voiceMaster.owned(state.guild.id, state.id)) return;
      const i = {
        guild: state.guild,
        guildId: state.guild.id,
        user: { id: state.id },
        client: state.client,
        id: 'vmjoin:' + randomUUID(),
      };
      created = await openPrivateVoice(i, c, { beforeCreate: () => snapshot(state, c, p) });
      const { member, bot } = await snapshot(state, c, p),
        channel = await state.guild.channels.fetch(created.channelId, { force: true }),
        row = c.voiceMaster.owned(state.guild.id, state.id);
      if (
        row?.status !== 'active' ||
        row.channel_id !== created.channelId ||
        channel.parentId !== c.voiceMaster.config(state.guild.id)?.category_id
      )
        throw new UserError('vmJoinUnavailable');
      verifyPrivateVoice(channel, row, bot.id);
      if (
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.Connect, P.MoveMembers]) ||
        !channel.permissionsFor(member)?.has([P.ViewChannel, P.Connect]) ||
        typeof member.voice?.setChannel !== 'function'
      )
        throw new UserError('vmJoinUnavailable');
      // Revalidate lobby/policy immediately before one native move;never retry an ambiguous move.
      const current = await snapshot(state, c, p);
      if (
        !channel.permissionsFor(current.bot)?.has([P.ViewChannel, P.Connect, P.MoveMembers]) ||
        !channel.permissionsFor(current.member)?.has([P.ViewChannel, P.Connect])
      )
        throw new UserError('vmJoinUnavailable');
      reserved = c.voiceJoin.reserve(state.guild.id, state.id, created.channelId);
      if (!reserved) return;
      await current.member.voice.setChannel(channel, 'Emika configured join-to-create');
      const observed = await state.guild.voiceStates.fetch(state.id, { force: true });
      c.voiceJoin.finish(
        state.guild.id,
        state.id,
        created.channelId,
        observed?.id === state.id &&
          observed.guild?.id === state.guild.id &&
          observed.channelId === created.channelId
          ? 'completed'
          : 'uncertain',
      );
    } catch (error) {
      if (reserved) c.voiceJoin.finish(state.guild.id, state.id, created.channelId, 'uncertain');
      c.logger?.warn(
        {
          guildId: state.guild.id,
          reason: error?.key,
          failedChecks: error?.detail,
          code: error?.code,
          message: error?.message,
        },
        'Voice join unavailable;no automatic creation/move retry',
      );
    } finally {
      c.voiceJoin.active.delete(key);
    }
  };
}

/**
 * Deletes a join-to-create channel once its last member leaves. Only channels with a join-flow
 * receipt are eligible; the lobby, Voice Master channels opened by hand and every other channel
 * are never touched. A ~1 second grace lets a quick rejoin keep the channel.
 */
export function createVoiceCleanupHandler(c, { graceMs = 1000 } = {}) {
  const pending = new Set();
  return async (old, state) => {
    if (
      c.config.voiceEventsEnabled !== true ||
      !old?.guild ||
      !old.channelId ||
      old.channelId === state?.channelId
    )
      return;
    const guild = old.guild,
      channelId = old.channelId,
      key = guild.id + ':' + channelId;
    if (pending.has(key)) return;
    const row = c.voiceMaster.db
      .prepare(
        "SELECT * FROM voice_master_channels WHERE guild_id=? AND channel_id=? AND status='active'",
      )
      .get(guild.id, channelId);
    if (!row || !c.voiceJoin.createdChannel(guild.id, channelId)) return;
    pending.add(key);
    try {
      if (graceMs > 0) await new Promise((resolve) => setTimeout(resolve, graceMs));
      requireVoiceReady({ guild, client: guild.client ?? old.client }, c);
      const current = c.voiceMaster.db
        .prepare(
          "SELECT * FROM voice_master_channels WHERE guild_id=? AND channel_id=? AND status='active'",
        )
        .get(guild.id, channelId);
      if (!current || current.id !== row.id) return;
      const channel = await guild.channels.fetch(channelId, { force: true });
      const bot = await guild.members.fetchMe({ force: true });
      const policy = c.voiceJoin.get(guild.id);
      if (
        !channel ||
        channel.type !== ChannelType.GuildVoice ||
        channel.id === policy?.channel_id ||
        channel.parentId !== c.voiceMaster.config(guild.id)?.category_id ||
        !bot?.permissions?.has(P.ManageChannels)
      )
        return;
      verifyPrivateVoice(channel, current, bot.id);
      if (voiceOccupancy(guild, channelId) !== 0) return;
      c.voiceMaster.transition(current.id, 'active', 'deleting');
      try {
        await channel.delete('Emika join-to-create channel empty');
      } catch (error) {
        c.voiceMaster.transition(current.id, 'deleting', 'uncertain');
        throw error;
      }
      c.voiceMaster.transition(current.id, 'deleting', 'closed');
    } catch (error) {
      c.logger?.warn(
        { guildId: guild.id, reason: error?.key, message: error?.message },
        'Join-to-create cleanup skipped; channel left as is',
      );
    } finally {
      pending.delete(key);
    }
  };
}
