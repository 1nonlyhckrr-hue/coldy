import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
// Opt-in extra for /moderation unban: DM the person a one-use invite plus a short message.
export const MESSAGE_MAX = 500;
export function pickInviteChannel(guild, bot) {
  const ok = (ch) =>
    ch?.permissionsFor?.(bot)?.has(P.CreateInstantInvite) &&
    [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice].includes(
      ch.type,
    );
  for (const ch of [guild.rulesChannel, guild.systemChannel]) if (ok(ch)) return ch;
  return [...guild.channels.cache.values()].find(ok) ?? null;
}
/** Returns { status: 'sent' | 'dmFailed' | 'noInvite', url? }. Never throws for Discord failures. */
export async function sendUnbanInvite(guild, client, userId, { message, t }) {
  let url;
  try {
    const bot = guild.members.me ?? (await guild.members.fetchMe());
    const channel = pickInviteChannel(guild, bot);
    if (!channel) return { status: 'noInvite' };
    const invite = await channel.createInvite({
      maxAge: 7 * 24 * 3600,
      maxUses: 1,
      unique: true,
      reason: 'Emika unban invite',
    });
    url = invite.url;
  } catch {
    return { status: 'noInvite' };
  }
  const note = (message ?? '').trim().slice(0, MESSAGE_MAX) || t('unbanApologyDefault');
  try {
    const user = await client.users.fetch(userId);
    await user.send({
      content: t('unbanDm', { server: guild.name, link: url, note }),
      allowedMentions: { parse: [] },
    });
    return { status: 'sent' };
  } catch {
    return { status: 'dmFailed', url };
  }
}
