import { ChannelType } from 'discord.js';
import { UserError } from '../utils/errors.js';
// Opt-in structure backup. Nothing is saved unless an allowed user runs /backup create.
// Restore only recreates what is missing; it never deletes or edits existing roles or channels.
export const BACKUP_VERSION = 1;
export const MAX_BACKUPS = 5;
const CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
]);
export function snapshotGuild(guild) {
  const roles = [...guild.roles.cache.values()]
    .filter((r) => !r.managed)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ?? 0,
      hoist: !!r.hoist,
      mentionable: !!r.mentionable,
      permissions: String(r.permissions?.bitfield ?? 0n),
      position: r.position ?? 0,
      everyone: r.id === guild.id,
    }));
  const channels = [...guild.channels.cache.values()]
    .filter((c) => CHANNEL_TYPES.has(c.type) && !c.isThread?.())
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId ?? null,
      position: c.rawPosition ?? c.position ?? 0,
      topic: c.topic ?? null,
      nsfw: !!c.nsfw,
      rateLimitPerUser: c.rateLimitPerUser ?? 0,
      bitrate: c.bitrate ?? null,
      userLimit: c.userLimit ?? 0,
      overwrites: [...(c.permissionOverwrites?.cache?.values() ?? [])].map((o) => ({
        id: o.id,
        type: o.type,
        allow: String(o.allow?.bitfield ?? 0n),
        deny: String(o.deny?.bitfield ?? 0n),
      })),
    }))
    .sort((a, b) => a.position - b.position);
  return { version: BACKUP_VERSION, guildId: guild.id, guildName: guild.name, roles, channels };
}
export class ServerBackups {
  constructor(db) {
    this.db = db;
  }
  save(guildId, userId, data) {
    return this.db.transaction(() => {
      const id = this.db
        .prepare(
          'INSERT INTO server_backups(guild_id,created_by,created_at,data_json) VALUES(?,?,?,?)',
        )
        .run(guildId, userId, Date.now(), JSON.stringify(data)).lastInsertRowid;
      this.db
        .prepare(
          'DELETE FROM server_backups WHERE guild_id=? AND id NOT IN (SELECT id FROM server_backups WHERE guild_id=? ORDER BY id DESC LIMIT ?)',
        )
        .run(guildId, guildId, MAX_BACKUPS);
      return Number(id);
    })();
  }
  list(guildId) {
    return this.db
      .prepare(
        'SELECT id,created_at,created_by,data_json FROM server_backups WHERE guild_id=? ORDER BY id DESC',
      )
      .all(guildId)
      .map((r) => {
        const d = JSON.parse(r.data_json);
        return {
          id: r.id,
          createdAt: r.created_at,
          createdBy: r.created_by,
          roles: d.roles.length,
          channels: d.channels.length,
        };
      });
  }
  get(guildId, id) {
    const r = this.db
      .prepare('SELECT data_json FROM server_backups WHERE guild_id=? AND id=?')
      .get(guildId, id);
    if (!r) throw new UserError('backupNotFound');
    return JSON.parse(r.data_json);
  }
  remove(guildId, id) {
    return this.db.prepare('DELETE FROM server_backups WHERE guild_id=? AND id=?').run(guildId, id)
      .changes;
  }
}
/** Recreates missing roles then missing channels (by name, type and category). Returns counts. */
export async function restoreGuild(guild, data, opts = {}) {
  let done = 0;
  const note = (kind, name, e) => {
    out.failed++;
    out.firstError ??= `First error: ${kind} "${String(name).slice(0, 40)}": ${String(e?.message ?? e).slice(0, 160)}${e?.code ? ` (code ${e.code})` : ''}.`;
    opts.onError?.(kind, name, e);
  };
  const pause = async () => {
    done++;
    opts.onProgress?.(done, out);
    if (opts.sleep && opts.pace) await opts.sleep(opts.pace);
  };
  if (data?.version !== BACKUP_VERSION) throw new UserError('backupNotFound');
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  const out = { rolesCreated: 0, channelsCreated: 0, skipped: 0, failed: 0 };
  const roleMap = new Map([[data.guildId, guild.id]]);
  const roleList =
    opts.ordered && data.createOrder !== 'listed'
      ? [...data.roles].sort((a, b) => b.position - a.position)
      : data.roles;
  for (const r of roleList) {
    if (r.everyone) continue;
    const existing = [...guild.roles.cache.values()].find((x) => !x.managed && x.name === r.name);
    if (existing) {
      roleMap.set(r.id, existing.id);
      out.skipped++;
      continue;
    }
    try {
      const made = await guild.roles.create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: BigInt(r.permissions),
        reason: 'Emika backup restore',
      });
      roleMap.set(r.id, made.id);
      out.rolesCreated++;
    } catch (e) {
      note('role', r.name, e);
    }
    await pause();
  }
  const chanMap = new Map();
  const find = (c, parentId) =>
    [...guild.channels.cache.values()].find(
      (x) => x.name === c.name && x.type === c.type && (x.parentId ?? null) === parentId,
    );
  const order = [
    ...data.channels.filter((c) => c.type === ChannelType.GuildCategory),
    ...data.channels.filter((c) => c.type !== ChannelType.GuildCategory),
  ];
  for (const c of order) {
    const parentId = c.parentId ? (chanMap.get(c.parentId) ?? null) : null;
    if (c.parentId && !parentId) {
      note('channel', c.name, new Error('its category was not created'));
      continue;
    }
    const existing = find(c, parentId);
    if (existing) {
      chanMap.set(c.id, existing.id);
      out.skipped++;
      continue;
    }
    const overwrites = c.overwrites
      .filter((o) => (o.type === 1 && !opts.dropMembers) || roleMap.has(o.id))
      .map((o) => ({
        id: o.type === 0 ? roleMap.get(o.id) : o.id,
        type: o.type,
        allow: BigInt(o.allow),
        deny: BigInt(o.deny),
      }));
    const base = { name: c.name, type: c.type, reason: 'Emika backup restore' };
    if (parentId) base.parent = parentId;
    if (c.topic) base.topic = c.topic;
    if (c.nsfw) base.nsfw = true;
    if (c.rateLimitPerUser) base.rateLimitPerUser = c.rateLimitPerUser;
    if (c.bitrate) base.bitrate = c.bitrate;
    if (c.userLimit) base.userLimit = c.userLimit;
    try {
      let made;
      try {
        made = await guild.channels.create({ ...base, permissionOverwrites: overwrites });
      } catch {
        // A member overwrite for someone who left is rejected; retry with role overwrites only.
        made = await guild.channels.create({
          ...base,
          permissionOverwrites: overwrites.filter((o) => o.type === 0),
        });
      }
      chanMap.set(c.id, made.id);
      out.channelsCreated++;
    } catch (e) {
      note('channel', c.name, e);
    }
    await pause();
  }
  return out;
}
