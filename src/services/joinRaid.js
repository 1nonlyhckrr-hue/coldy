import { z } from 'zod';
import { PermissionFlagsBits as P } from 'discord.js';
import { lunaPayload } from '../utils/embeds.js';
const id = z.string().regex(/^\d{17,20}$/);
const schema = z
  .object({
    enabled: z.boolean().default(false),
    joins: z.number().int().min(2).max(50).default(5),
    seconds: z.number().int().min(5).max(120).default(10),
    minAgeDays: z.number().int().min(0).max(365).default(3),
    action: z.enum(['timeout', 'kick']).default('timeout'),
    timeoutMinutes: z.number().int().min(1).max(1440).default(60),
    alertChannelId: id.optional(),
  })
  .strict();
// Opt-in anti join-raid. Does nothing unless an allowed user enables it for the server.
export class JoinRaid {
  constructor(db) {
    this.db = db;
    this.recent = new Map();
  }
  get(guildId) {
    const r = this.db
      .prepare('SELECT settings_json FROM join_raid_config WHERE guild_id=?')
      .get(guildId);
    return schema.parse(r ? JSON.parse(r.settings_json) : {});
  }
  patch(guildId, changes) {
    const cfg = schema.parse({ ...this.get(guildId), ...changes });
    this.db
      .prepare(
        'INSERT INTO join_raid_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(cfg));
    return cfg;
  }
  /**
   * Records one human join and returns the members to act on: empty unless the burst threshold is
   * reached, then every young account in the window (including this one).
   */
  record(guildId, joiner, now = Date.now()) {
    const cfg = this.get(guildId);
    if (!cfg.enabled || joiner.bot) return { raid: false, targets: [], cfg };
    const list = (this.recent.get(guildId) ?? []).filter((j) => now - j.at <= cfg.seconds * 1000);
    list.push({ ...joiner, at: now, handled: false });
    this.recent.set(guildId, list);
    const raid = list.length >= cfg.joins,
      minAge = cfg.minAgeDays * 86400000;
    const targets = raid ? list.filter((j) => !j.handled && now - j.createdAt < minAge) : [];
    for (const t of targets) t.handled = true;
    return { raid, targets, cfg };
  }
}
export function createJoinRaidHandler(c) {
  return async (member) => {
    try {
      const guild = member.guild,
        { raid, targets, cfg } = c.joinRaid.record(guild.id, {
          id: member.id,
          bot: member.user?.bot === true,
          createdAt: member.user?.createdTimestamp ?? Date.now(),
        });
      if (!raid || !targets.length) return;
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const need = cfg.action === 'kick' ? P.KickMembers : P.ModerateMembers;
      let done = 0,
        failed = 0;
      for (const t of targets) {
        try {
          const m = t.id === member.id ? member : await guild.members.fetch(t.id);
          if (
            !me.permissions?.has(need) ||
            m.id === guild.ownerId ||
            m.permissions?.has(P.Administrator) ||
            m.roles.highest.position >= me.roles.highest.position
          ) {
            failed++;
            continue;
          }
          if (cfg.action === 'kick') await m.kick('Emika anti join-raid');
          else await m.timeout(cfg.timeoutMinutes * 60000, 'Emika anti join-raid');
          done++;
        } catch {
          failed++;
        }
      }
      if (cfg.alertChannelId) {
        const ch = await guild.channels.fetch(cfg.alertChannelId).catch(() => null);
        await ch?.send(
          lunaPayload(
            {
              content: c.localization.t(guild.id, 'joinRaidAlert_' + cfg.action, {
                joins: cfg.joins,
                seconds: cfg.seconds,
                done,
                failed,
                minutes: cfg.timeoutMinutes,
              }),
              allowedMentions: { parse: [] },
            },
            { locale: c.localization.locale(guild.id) },
          ),
        );
      }
    } catch {
      c.logger?.warn?.({ kind: 'join_raid' }, 'Join-raid handler failed; no automatic retry');
    }
  };
}
