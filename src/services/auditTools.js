import {
  PermissionFlagsBits as P,
  GuildVerificationLevel,
  GuildExplicitContentFilter,
  GuildMFALevel,
} from 'discord.js';
import { gateConfig } from './raidTools.js';
// /audit: read-only server checks. Nothing is changed.
export const DANGEROUS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'MentionEveryone',
  'ModerateMembers',
];
export const dangerousOf = (perms) => DANGEROUS.filter((n) => perms.has(P[n], false));
export function scoreServer(guild, c) {
  const roles = [...guild.roles.cache.values()];
  const everyone = guild.roles.everyone ?? roles.find((r) => r.id === guild.id);
  const admins = roles.filter(
    (r) => r.id !== guild.id && !r.managed && r.permissions.has(P.Administrator, false),
  );
  const botAdmins = roles.filter((r) => r.managed && r.permissions.has(P.Administrator, false));
  const checks = [
    ['verification', 10, guild.verificationLevel >= GuildVerificationLevel.Medium],
    ['contentFilter', 10, guild.explicitContentFilter === GuildExplicitContentFilter.AllMembers],
    ['mfa', 15, guild.mfaLevel === GuildMFALevel.Elevated],
    ['everyonePerms', 15, !everyone || dangerousOf(everyone.permissions).length === 0],
    ['fewAdmins', 10, admins.length <= 2],
    ['botAdmins', 10, botAdmins.length === 0],
    ['antinuke', 10, c.antinuke.get(guild.id).enabled === true],
    ['automod', 10, c.automod.get(guild.id).enabled === true],
    [
      'joinProtection',
      5,
      c.joinRaid.get(guild.id).enabled === true || gateConfig(c, guild.id).enabled === true,
    ],
    ['modlog', 5, !!c.logHub.channelId(guild.id, 'mod')],
  ].map(([key, weight, ok]) => ({ key, weight, ok }));
  return { score: checks.filter((x) => x.ok).reduce((a, x) => a + x.weight, 0), checks };
}
export function auditPerms(guild) {
  const out = [];
  for (const r of guild.roles.cache.values()) {
    const perms = dangerousOf(r.permissions);
    if (!perms.length) continue;
    out.push({
      id: r.id,
      name: r.name,
      managed: r.managed,
      everyone: r.id === guild.id,
      perms,
      members: [...(r.members?.keys?.() ?? [])].slice(0, 200),
    });
  }
  return out.sort((a, b) => b.perms.length - a.perms.length);
}
export function permsReport(entries) {
  return entries
    .map(
      (e) =>
        `${e.everyone ? '@everyone' : e.name}${e.managed ? ' (bot/integration role)' : ''} [${e.id}]\n  ${e.perms.join(', ')}\n  members: ${e.everyone ? 'all' : e.members.length ? e.members.join(' ') : 'none cached'}`,
    )
    .join('\n\n');
}
