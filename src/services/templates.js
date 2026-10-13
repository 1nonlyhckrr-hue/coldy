import { gzipSync, gunzipSync } from 'node:zlib';
import { UserError } from '../utils/errors.js';
import { snapshotGuild, restoreGuild } from './serverBackup.js';
import { builtinKey, builtinTemplate, builtinManifests } from './builtinTemplates.js';
// /template: save a server's structure (roles, categories, channels, permission overwrites) under a name,
// then paste it into another server where Emika is. Structure only: no messages, no members, no settings.
// Templates live in one global slot, owned by whoever saved them; only the owner (or a bot owner) can use them.
const SLOT = '0',
  FEATURE = 'template',
  MAX_TEMPLATES = 25,
  MAX_ITEMS = 800,
  CHUNK = 15000,
  MAX_CHUNKS = 40;
export const NAME = /^[a-z0-9_-]{1,20}$/;
export function templateOf(guild) {
  const snap = snapshotGuild(guild);
  const roles = snap.roles.map((r) => ({ ...r }));
  const channels = snap.channels.map((c) => ({
    ...c,
    overwrites: c.overwrites.filter((o) => o.type === 0),
  }));
  if (roles.length + channels.length > MAX_ITEMS) throw new UserError('tpTooBig');
  return { ...snap, roles, channels };
}
export class Templates {
  constructor(c) {
    this.c = c;
  }
  /** Manifest row plus the compressed payload, split across rows because one row holds at most 20000 characters. */
  get(name) {
    const builtin = builtinTemplate(name);
    if (builtin) return builtin;
    const m = this.c.features.get(SLOT, FEATURE, name);
    if (!m) return null;
    if (m.data) return m;
    let b64 = '';
    for (let n = 0; n < m.chunks; n++) {
      const part = this.c.features.get(SLOT, FEATURE, `${name}#${n}`);
      if (typeof part !== 'string') return null;
      b64 += part;
    }
    try {
      return { ...m, data: JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')) };
    } catch {
      return null;
    }
  }
  dropChunks(name, count) {
    for (let n = 0; n < count; n++) this.c.features.del(SLOT, FEATURE, `${name}#${n}`);
  }
  save(name, data, userId, fromName) {
    if (builtinKey(name)) throw new UserError('tpBuiltin');
    if (!NAME.test(name)) throw new UserError('tpBadName');
    const cur = this.c.features.get(SLOT, FEATURE, name);
    if (cur && cur.by !== userId) throw new UserError('tpNotYours');
    if (!cur && this.c.features.count(SLOT, FEATURE, '') >= MAX_TEMPLATES * (MAX_CHUNKS + 1))
      throw new UserError('tpLimit');
    if (!cur && this.manifests().length >= MAX_TEMPLATES) throw new UserError('tpLimit');
    const b64 = gzipSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64');
    const chunks = Math.ceil(b64.length / CHUNK);
    if (chunks > MAX_CHUNKS) throw new UserError('tpTooBig');
    for (let n = 0; n < chunks; n++)
      this.c.features.set(SLOT, FEATURE, `${name}#${n}`, b64.slice(n * CHUNK, (n + 1) * CHUNK));
    this.c.features.set(SLOT, FEATURE, name, {
      by: userId,
      at: Date.now(),
      from: String(fromName ?? '').slice(0, 100),
      chunks,
      roles: data.roles.filter((r) => !r.everyone).length,
      channels: data.channels.length,
    });
    if (cur?.chunks > chunks)
      for (let n = chunks; n < cur.chunks; n++) this.c.features.del(SLOT, FEATURE, `${name}#${n}`);
  }
  manifests() {
    return this.c.features
      .list(SLOT, FEATURE, '', 1000)
      .filter((r) => !r.key.includes('#'))
      .map((r) => ({ name: r.key, ...r.value }));
  }
  /** Templates a user may see: their own, or all for a bot owner. */
  list(userId, isOwner) {
    return [
      ...this.manifests().filter((r) => isOwner || r.by === userId),
      ...builtinManifests(),
    ].map((r) => ({ name: r.name, from: r.from, at: r.at, roles: r.roles, channels: r.channels }));
  }
  use(name, userId, isOwner) {
    const t = this.get(name);
    if (!t || (!t.builtin && !isOwner && t.by !== userId)) throw new UserError('tpNotFound');
    return t;
  }
  remove(name, userId, isOwner) {
    if (builtinKey(name)) throw new UserError('tpBuiltin');
    const t = this.use(name, userId, isOwner);
    this.dropChunks(name, t.chunks ?? 0);
    return this.c.features.del(SLOT, FEATURE, name);
  }
}
const busy = new Set();
/** Creates missing roles and channels from the template, never deleting or editing anything. Runs in the background. */
export function startApply(guild, data, { sleep, finish, progress, log, pace = 450 }) {
  if (busy.has(guild.id)) throw new UserError('tpBusy');
  busy.add(guild.id);
  (async () => {
    let out;
    try {
      out = await restoreGuild(guild, data, {
        ordered: true,
        dropMembers: true,
        pace,
        sleep,
        onError: (kind, name, e) =>
          log?.warn(
            { guildId: guild.id, kind, name, code: e?.code, err: e?.message },
            'Template item failed',
          ),
        onProgress: (done, o) => {
          if (done % 25 === 0) Promise.resolve(progress?.(done, o)).catch(() => {});
        },
      });
      log?.info({ guildId: guild.id, ...out }, 'Template apply finished');
    } catch (e) {
      log?.error({ guildId: guild.id, err: e?.message, code: e?.code }, 'Template apply crashed');
      out = {
        rolesCreated: 0,
        channelsCreated: 0,
        skipped: 0,
        failed: -1,
        firstError: `Error: ${String(e?.message ?? e).slice(0, 160)}.`,
      };
    } finally {
      busy.delete(guild.id);
    }
    await finish(out).catch(() => {});
  })();
  return data.roles.filter((r) => !r.everyone).length + data.channels.length;
}
