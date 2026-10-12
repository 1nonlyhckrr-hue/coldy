import { ChannelType, PermissionFlagsBits as P } from 'discord.js';

export const READ_ONLY = 'readOnly';
export const PRIVATE = 'private';

export const STRUCTURE = [
  {
    name: '𝕴𝖓𝖋𝖔',
    channels: [
      { name: '⚔・𝖜𝖊𝖑𝖈𝖔𝖒𝖊', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖗𝖚𝖑𝖊𝖘', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖆𝖓𝖓𝖔𝖚𝖓𝖈𝖊𝖒𝖊𝖓𝖙𝖘', type: 'text', access: READ_ONLY },
    ],
  },
  {
    name: '𝕮𝖍𝖆𝖙',
    channels: [
      { name: '⚔・𝖌𝖊𝖓𝖊𝖗𝖆𝖑', type: 'text' },
      { name: '⚔・𝖒𝖊𝖉𝖎𝖆-𝖈𝖑𝖎𝖕𝖘', type: 'text' },
      { name: '⚔・𝖇𝖔𝖙-𝖈𝖔𝖒𝖒𝖆𝖓𝖉𝖘', type: 'text' },
    ],
  },
  {
    name: '𝕲𝖆𝖒𝖎𝖓𝖌',
    channels: [
      { name: '⚔・𝖋𝖋-𝖑𝖋𝖌', type: 'text' },
      { name: '⚔・𝖍𝖎𝖌𝖍𝖑𝖎𝖌𝖍𝖙𝖘', type: 'text' },
    ],
  },
  {
    name: '𝖁𝖔𝖎𝖈𝖊',
    channels: [
      { name: '⚔・𝖏𝖔𝖎𝖓-𝖙𝖔-𝖈𝖗𝖊𝖆𝖙𝖊', type: 'voice' },
      { name: '⚔・𝖌𝖆𝖒𝖎𝖓𝖌-𝖛𝖈', type: 'voice' },
      { name: '⚔・𝖈𝖍𝖎𝖑𝖑-𝖛𝖈', type: 'voice' },
    ],
  },
  {
    name: '𝕾𝖚𝖕𝖕𝖔𝖗𝖙',
    channels: [
      { name: '⚔・𝖙𝖎𝖈𝖐𝖊𝖙-𝖕𝖆𝖓𝖊𝖑', type: 'text', access: READ_ONLY },
      { name: '⚔・𝖋𝖆𝖖', type: 'text', access: READ_ONLY },
    ],
  },
  {
    name: '𝕾𝖙𝖆𝖋𝖋',
    access: PRIVATE,
    channels: [
      { name: '⚔・𝖘𝖙𝖆𝖋𝖋-𝖈𝖍𝖆𝖙', type: 'text' },
      { name: '⚔・𝖒𝖔𝖉-𝖑𝖔𝖌𝖘', type: 'text' },
    ],
  },
];

const BOT_ALLOW = [
  P.ViewChannel,
  P.SendMessages,
  P.EmbedLinks,
  P.ReadMessageHistory,
  P.ManageChannels,
];

function overwritesFor(access, everyoneId, botId) {
  if (access === READ_ONLY)
    return [
      { id: everyoneId, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages] },
      { id: botId, allow: BOT_ALLOW },
    ];
  if (access === PRIVATE)
    return [
      { id: everyoneId, deny: [P.ViewChannel] },
      { id: botId, allow: BOT_ALLOW },
    ];
  return undefined;
}

export const STRUCTURE_COUNTS = {
  categories: STRUCTURE.length,
  channels: STRUCTURE.reduce((n, g) => n + g.channels.length, 0),
};

/**
 * Creates the structure in one guild. Existing categories/channels (same name, type and parent)
 * are skipped. On failure the thrown error carries the partial result in `.partial`.
 */
export async function createStructure(guild, botId, reason = 'Emika server structure setup') {
  await guild.channels.fetch();
  const cache = guild.channels.cache;
  const result = {
    createdCategories: [],
    skippedCategories: [],
    createdChannels: [],
    skippedChannels: [],
  };
  try {
    for (const group of STRUCTURE) {
      let category = cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === group.name,
      );
      if (category) result.skippedCategories.push(group.name);
      else {
        category = await guild.channels.create({
          name: group.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwritesFor(group.access, guild.id, botId),
          reason,
        });
        result.createdCategories.push(group.name);
      }
      for (const spec of group.channels) {
        const type = spec.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const found = cache.find(
          (c) => c.type === type && c.name === spec.name && c.parentId === category.id,
        );
        if (found) {
          result.skippedChannels.push(spec.name);
          continue;
        }
        await guild.channels.create({
          name: spec.name,
          type,
          parent: category.id,
          permissionOverwrites: overwritesFor(spec.access ?? group.access, guild.id, botId),
          reason,
        });
        result.createdChannels.push(spec.name);
      }
    }
  } catch (error) {
    error.partial = result;
    throw error;
  }
  return result;
}
