import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { openPrivateVoice, verifyPrivateVoice } from './voiceMaster.js';
import { requireVoiceReady } from './voiceReadiness.js';
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
  if (
    member?.id !== state.id ||
    member.guild?.id !== state.guild.id ||
    member.user?.bot !== false ||
    voice?.id !== state.id ||
    voice.guild?.id !== state.guild.id ||
    voice.channelId !== policy.channel_id ||
    bot?.id !== state.client?.user?.id ||
    bot.guild?.id !== state.guild.id ||
    !bot.permissions?.has([P.MoveMembers, P.ManageChannels]) ||
    actor?.id !== policy.actor_id ||
    actor.guild?.id !== state.guild.id ||
    !actor.permissions?.has([P.MoveMembers, P.ManageChannels]) ||
    lobby?.id !== policy.channel_id ||
    lobby.guildId !== state.guild.id ||
    lobby.type !== ChannelType.GuildVoice ||
    state.guild.afkChannelId === lobby.id ||
    !lobby.permissionsFor(bot)?.has([P.ViewChannel, P.Connect, P.MoveMembers]) ||
    !lobby.permissionsFor(member)?.has([P.ViewChannel, P.Connect]) ||
    c.voiceJoin.get(state.guild.id)?.revision !== policy.revision
  )
    throw new UserError('vmJoinUnavailable');
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
      await current.member.voice.setChannel(channel, 'Luna configured join-to-create');
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
    } catch {
      if (reserved) c.voiceJoin.finish(state.guild.id, state.id, created.channelId, 'uncertain');
      c.logger?.warn(
        { guildId: state.guild.id },
        'Voice join unavailable;no automatic creation/move retry',
      );
    } finally {
      c.voiceJoin.active.delete(key);
    }
  };
}
