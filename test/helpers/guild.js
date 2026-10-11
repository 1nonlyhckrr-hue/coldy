import { ChannelType } from 'discord.js';
export function makeGuild() {
  const sent = [];
  const channel = {
    id: '100000000000000001',
    guildId: 'g',
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => true }),
    send: async (v) => {
      sent.push(v);
      return { id: 'native-message' };
    },
  };
  const guild = {
    id: 'g',
    client: { user: { id: 'b' } },
    name: 'Guild',
    memberCount: 5,
    members: { fetchMe: async () => ({ id: 'b', guild: { id: 'g' } }) },
    channels: { fetch: async () => channel },
  };
  return { guild, channel, sent };
}
