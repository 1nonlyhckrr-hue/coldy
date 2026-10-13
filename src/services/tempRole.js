import { UserError } from '../utils/errors.js';
// /temprole: give a role that removes itself. Expiry is stored per server and survives restarts.
const FEATURE = 'temprole',
  MAX = 200,
  TICK = 60000;
export class TempRoles {
  constructor(c) {
    this.c = c;
  }
  key(userId, roleId) {
    return `${userId}:${roleId}`;
  }
  add(guildId, userId, roleId, expiresAt, by) {
    const f = this.c.features;
    if (f.count(guildId, FEATURE, '') >= MAX && !f.get(guildId, FEATURE, this.key(userId, roleId)))
      throw new UserError('trLimit');
    f.set(guildId, FEATURE, this.key(userId, roleId), { userId, roleId, expiresAt, by });
  }
  remove(guildId, userId, roleId) {
    return this.c.features.del(guildId, FEATURE, this.key(userId, roleId));
  }
  list(guildId) {
    return this.c.features.list(guildId, FEATURE, '', MAX).map((r) => r.value);
  }
  due(guildId, now = Date.now()) {
    return this.list(guildId).filter((r) => r.expiresAt <= now);
  }
  /** Removes expired roles. A member who left or a role that is gone is simply forgotten. */
  async sweep(guild, now = Date.now()) {
    let done = 0;
    for (const r of this.due(guild.id, now)) {
      try {
        const m = await guild.members.fetch(r.userId);
        if (m.roles.cache.has(r.roleId)) await m.roles.remove(r.roleId, 'Emika temprole expired');
        this.remove(guild.id, r.userId, r.roleId);
        done++;
      } catch (e) {
        if (e?.code === 10007 || e?.code === 10011 || e?.code === 10013)
          this.remove(guild.id, r.userId, r.roleId);
        // other errors (missing permission): keep it and retry next tick
      }
    }
    return done;
  }
  start(client) {
    const run = () => {
      for (const g of client.guilds.cache.values()) this.sweep(g).catch(() => {});
    };
    run();
    this.timer = setInterval(run, TICK);
    this.timer.unref?.();
  }
}
