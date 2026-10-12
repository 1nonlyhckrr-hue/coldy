import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
export function eventSnapshot(channel) {
  const rows = [...channel.permissionOverwrites.cache.values()]
    .map((r) => ({
      id: r.id,
      type: r.type,
      allow: r.allow.bitfield.toString(),
      deny: r.deny.bitfield.toString(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(rows);
}
function view(rows, g) {
  const r = JSON.parse(rows).find((x) => x.id === g);
  if (!r) return null;
  return BigInt(r.deny) & P.ViewChannel ? false : BigInt(r.allow) & P.ViewChannel ? true : null;
}
export class EventMode {
  constructor(db) {
    this.db = db;
    this.active = new Set();
  }
  get(g) {
    const r = this.db.prepare('SELECT * FROM event_mode_config WHERE guild_id=?').get(g);
    return r ? { ...r, channels: JSON.parse(r.channels_json) } : null;
  }
  setup(g, category, channels) {
    const old = this.get(g);
    if (this.active.has(g) || (old && old.status !== 'inactive'))
      throw new UserError('eventModeBlocked');
    this.db
      .prepare(
        "INSERT INTO event_mode_config VALUES(?,?,?,?,'inactive') ON CONFLICT(guild_id) DO UPDATE SET category_id=excluded.category_id,channels_json=excluded.channels_json,revision=excluded.revision",
      )
      .run(g, category, JSON.stringify(channels), randomUUID());
  }
  records(g) {
    return this.db
      .prepare('SELECT * FROM event_mode_changes WHERE guild_id=? ORDER BY channel_id')
      .all(g);
  }
  reserve(g, ch, before, desired) {
    this.db
      .prepare("INSERT INTO event_mode_changes VALUES(?,?,?,?,'reserved',NULL)")
      .run(g, ch, before, Number(desired));
  }
  mark(g, ch, status, after = null) {
    this.db
      .prepare(
        'UPDATE event_mode_changes SET status=?,after_json=COALESCE(?,after_json) WHERE guild_id=? AND channel_id=?',
      )
      .run(status, after, g, ch);
  }
  state(g, status) {
    this.db.prepare('UPDATE event_mode_config SET status=? WHERE guild_id=?').run(status, g);
  }
  reset(g) {
    if (
      this.active.has(g) ||
      this.get(g)?.status !== 'inactive' ||
      this.records(g).some((r) => r.status !== 'restored')
    )
      throw new UserError('eventModeBlocked');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM event_mode_config WHERE guild_id=?').run(g);
      this.db.prepare('DELETE FROM event_mode_changes WHERE guild_id=?').run(g);
    })();
  }
  recover() {
    this.db
      .prepare(
        "UPDATE event_mode_config SET status='uncertain' WHERE status IN ('enabling','disabling')",
      )
      .run();
    this.db
      .prepare(
        "UPDATE event_mode_changes SET status='uncertain' WHERE status IN ('reserved','restoring')",
      )
      .run();
  }
}
export async function eventAuthority(i) {
  const guild = await i.guild?.fetch();
  if (guild?.id !== i.guildId || guild.ownerId !== i.user.id) throw new UserError('ownerOnly');
  if (i.guild?.id !== i.guildId || i.user.id !== i.guild.ownerId) throw new UserError('ownerOnly');
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    !bot.permissions?.has([P.ManageRoles, P.ManageChannels]) ||
    !i.appPermissions?.has([P.ManageRoles, P.ManageChannels])
  )
    throw new UserError('eventModeUnavailable');
  return bot;
}
async function native(i, id, type) {
  const ch = await i.guild.channels.fetch(id, { force: true }),
    bot = await eventAuthority(i);
  if (
    ch?.id !== id ||
    ch.guildId !== i.guildId ||
    ch.type !== type ||
    !ch.permissionsFor(bot)?.has([P.ViewChannel, P.ManageRoles, P.ManageChannels]) ||
    !ch.permissionOverwrites?.cache
  )
    throw new UserError('eventModeUnavailable');
  const own = ch.permissionOverwrites.cache.get(bot.id);
  if (
    own?.type !== 1 ||
    !own.allow?.has([P.ViewChannel, P.ManageRoles, P.ManageChannels]) ||
    own.deny?.has(P.ViewChannel)
  )
    throw new UserError('eventModeBotAccess');
  return ch;
}
export async function configureEventMode(i, c, { categoryId, channels, confirm }) {
  if (confirm !== true) throw new UserError('eventModeConfirm');
  await eventAuthority(i);
  if (
    !Number.isSafeInteger(i.guild.memberCount) ||
    i.guild.memberCount < 100 ||
    !/^\d{17,20}$/.test(categoryId) ||
    !Array.isArray(channels) ||
    channels.length < 1 ||
    channels.length > 10 ||
    new Set(channels).size !== channels.length ||
    channels.includes(categoryId) ||
    channels.some((x) => typeof x !== 'string' || !/^\d{17,20}$/.test(x))
  )
    throw new UserError('eventModeInput');
  const category = await native(i, categoryId, ChannelType.GuildCategory);
  if (view(eventSnapshot(category), i.guildId) !== true) throw new UserError('eventModeInput');
  for (const id of channels) {
    const ch = await native(i, id, ChannelType.GuildText);
    if (ch.parentId === categoryId) throw new UserError('eventModeInput');
  }
  c.eventMode.setup(i.guildId, categoryId, channels);
}
export async function changeEventMode(i, c, { enable, confirm }) {
  if (confirm !== true) throw new UserError('eventModeConfirm');
  await eventAuthority(i);
  const e = c.eventMode,
    g = i.guildId,
    p = e.get(g);
  if (!p) throw new UserError('eventModeInput');
  if (e.active.has(g)) throw new UserError('eventModeBlocked');
  e.active.add(g);
  try {
    if (enable) {
      if (p.status !== 'inactive' || e.records(g).some((r) => r.status !== 'restored'))
        throw new UserError('eventModeBlocked');
      const specs = [
          ...p.channels.map((id) => ({ id, type: ChannelType.GuildText, desired: false })),
        ],
        prepared = [];
      const category = await native(i, p.category_id, ChannelType.GuildCategory);
      if (view(eventSnapshot(category), g) !== true) throw new UserError('eventModeInput');
      for (const spec of specs) {
        const ch = await native(i, spec.id, spec.type),
          before = eventSnapshot(ch);
        if (ch.parentId === p.category_id || view(before, g) === spec.desired)
          throw new UserError('eventModeInput');
        prepared.push({ ...spec, before });
      }
      if (e.get(g)?.revision !== p.revision) throw new UserError('eventModeBlocked');
      e.db.transaction(() => {
        e.db.prepare('DELETE FROM event_mode_changes WHERE guild_id=?').run(g);
        for (const s of prepared) e.reserve(g, s.id, s.before, s.desired);
        e.state(g, 'enabling');
      })();
      for (const s of prepared) {
        try {
          const ch = await native(i, s.id, s.type);
          if (
            e.get(g)?.revision !== p.revision ||
            ch.parentId === p.category_id ||
            eventSnapshot(ch) !== s.before
          )
            throw Error('Permission drift');
          await ch.permissionOverwrites.edit(
            g,
            { ViewChannel: s.desired },
            { type: 0, reason: 'Emika owner confirmed bounded event mode' },
          );
          const observed = await native(i, s.id, s.type),
            after = eventSnapshot(observed);
          if (view(after, g) !== s.desired) throw Error('Effect unverified');
          const expected = JSON.parse(s.before),
            actual = JSON.parse(after);
          const row = expected.find((x) => x.id === g) ?? { id: g, type: 0, allow: '0', deny: '0' };
          row.allow = (
            s.desired ? BigInt(row.allow) | P.ViewChannel : BigInt(row.allow) & ~P.ViewChannel
          ).toString();
          row.deny = (
            s.desired ? BigInt(row.deny) & ~P.ViewChannel : BigInt(row.deny) | P.ViewChannel
          ).toString();
          if (!expected.some((x) => x.id === g)) expected.push(row);
          expected.sort((a, b) => a.id.localeCompare(b.id));
          if (JSON.stringify(expected) !== JSON.stringify(actual))
            throw Error('Concurrent permission drift');
          e.mark(g, s.id, 'applied', after);
        } catch {
          e.mark(g, s.id, 'uncertain');
          e.state(g, 'uncertain');
          throw new UserError('eventModeBlocked');
        }
      }
      e.state(g, 'active');
    } else {
      if (
        !['active', 'uncertain'].includes(p.status) ||
        e.records(g).some((r) => ['uncertain', 'reserved', 'restoring'].includes(r.status))
      )
        throw new UserError('eventModeBlocked');
      e.state(g, 'disabling');
      for (const r of e.records(g)) {
        if (r.status === 'restored') continue;
        try {
          const type =
              r.channel_id === p.category_id ? ChannelType.GuildCategory : ChannelType.GuildText,
            ch = await native(i, r.channel_id, type);
          if (eventSnapshot(ch) !== r.after_json) throw Error('Thirdparty drift');
          e.mark(g, r.channel_id, 'restoring');
          const original = JSON.parse(r.before_json).find((x) => x.id === g);
          if (!original)
            await ch.permissionOverwrites.delete(g, 'Emika restore owned event overwrite');
          else
            await ch.permissionOverwrites.edit(
              g,
              { ViewChannel: view(r.before_json, g) },
              { type: 0, reason: 'Emika restore owned event view bit' },
            );
          const observed = await native(i, r.channel_id, type);
          if (eventSnapshot(observed) !== r.before_json) throw Error('Restore not observed');
          e.mark(g, r.channel_id, 'restored');
        } catch {
          e.mark(g, r.channel_id, 'uncertain');
          e.state(g, 'uncertain');
          throw new UserError('eventModeBlocked');
        }
      }
      e.state(g, 'inactive');
    }
  } finally {
    e.active.delete(g);
  }
}
