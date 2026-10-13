import { snapshotGuild } from './serverBackup.js';
// /backup auto: one snapshot per day at the chosen UTC time. Off by default.
export const AUTOBACKUP = { enabled: false, time: '03:00', last: '' };
export async function runAutoBackups(c, client, now = new Date()) {
  const hhmm = now.toISOString().slice(11, 16),
    day = now.toISOString().slice(0, 10);
  let made = 0;
  for (const g of client.guilds.cache.values()) {
    const cfg = c.features.config(g.id, 'autobackup', AUTOBACKUP);
    if (!cfg.enabled || cfg.last === day || hhmm < cfg.time) continue;
    try {
      c.serverBackups.save(g.id, 'auto', snapshotGuild(g));
      c.features.setConfig(g.id, 'autobackup', AUTOBACKUP, { last: day });
      made++;
    } catch {
      c.logger?.warn?.({ kind: 'auto_backup' }, 'Auto backup unavailable');
    }
  }
  return made;
}
export function startAutoBackup(c, client) {
  const t = setInterval(() => runAutoBackups(c, client).catch(() => {}), 60000);
  t.unref?.();
}
