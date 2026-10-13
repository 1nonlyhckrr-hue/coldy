import { UserError } from '../utils/errors.js';
import { snapshotGuild, restoreGuild } from './serverBackup.js';
// /template: save a server's structure (roles, categories, channels, permission overwrites) under a name,
// then paste it into another server where Emika is. Structure only: no messages, no members, no settings.
// Templates live in one global slot, owned by whoever saved them; only the owner (or a bot owner) can use them.
const SLOT = '0',
  FEATURE = 'template',
  MAX_TEMPLATES = 25,
  MAX_ITEMS = 500;
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
  get(name) {
    return this.c.features.get(SLOT, FEATURE, name);
  }
  save(name, data, userId, fromName) {
    if (!NAME.test(name)) throw new UserError('tpBadName');
    const cur = this.get(name);
    if (cur && cur.by !== userId) throw new UserError('tpNotYours');
    if (!cur && this.c.features.count(SLOT, FEATURE, '') >= MAX_TEMPLATES)
      throw new UserError('tpLimit');
    this.c.features.set(SLOT, FEATURE, name, {
      by: userId,
      at: Date.now(),
      from: String(fromName ?? '').slice(0, 100),
      data,
    });
  }
  /** Templates a user may see: their own, or all for a bot owner. */
  list(userId, isOwner) {
    return this.c.features
      .list(SLOT, FEATURE, '', MAX_TEMPLATES)
      .filter((r) => isOwner || r.value.by === userId)
      .map((r) => ({
        name: r.key,
        from: r.value.from,
        at: r.value.at,
        roles: r.value.data.roles.filter((x) => !x.everyone).length,
        channels: r.value.data.channels.length,
      }));
  }
  use(name, userId, isOwner) {
    const t = this.get(name);
    if (!t || (!isOwner && t.by !== userId)) throw new UserError('tpNotFound');
    return t;
  }
  remove(name, userId, isOwner) {
    this.use(name, userId, isOwner);
    return this.c.features.del(SLOT, FEATURE, name);
  }
}
const busy = new Set();
/** Creates missing roles and channels from the template, never deleting or editing anything. Runs in the background. */
export function startApply(guild, data, { sleep, finish, pace = 450 }) {
  if (busy.has(guild.id)) throw new UserError('tpBusy');
  busy.add(guild.id);
  (async () => {
    let out;
    try {
      out = await restoreGuild(guild, data, { ordered: true, dropMembers: true, pace, sleep });
    } catch {
      out = { rolesCreated: 0, channelsCreated: 0, skipped: 0, failed: -1 };
    } finally {
      busy.delete(guild.id);
    }
    await finish(out).catch(() => {});
  })();
  return data.roles.filter((r) => !r.everyone).length + data.channels.length;
}
