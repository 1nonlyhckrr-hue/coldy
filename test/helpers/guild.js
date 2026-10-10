import { ChannelType } from 'discord.js';
export function makeGuild() {
  const sent = [];
  const channel = {
    guildId: 'g',
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    send: async (v) => sent.push(v),
  };
  const guild = {
    id: 'g',
    name: 'Guild',
    memberCount: 5,
    members: { fetchMe: async () => ({}) },
    channels: { fetch: async () => channel },
  };
  return { guild, channel, sent };
}
