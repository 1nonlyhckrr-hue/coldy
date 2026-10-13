import { ChannelType } from 'discord.js';
import { BACKUP_VERSION } from './serverBackup.js';
// Built-in server templates. They live in code, so they survive restarts and redeploys with no
// stored rows. They are cosmetic structure only: no permission overwrites, and every role has
// permissions 0, so staff roles carry no powers until the server owner assigns them.
const T = ChannelType.GuildText,
  V = ChannelType.GuildVoice;
const text = (names) => names.map((n) => [T, `┃${n}`]);
const voice = (names) => names.map((n) => [V, n]);
const nums = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
// [category, channels]. Text names are lowercase with dashes; voice names keep spaces and case.
// The two-category "india (announcement)" channel is a plain text channel here, because
// announcement channels need the Community feature, which a fresh server does not have.
export const DISCORD_INDIA_CHANNELS = [
  ['INDIA', text(['india', 'announcements', 'rulebook', 'self-role', 'hex', 'apply-for-regulars'])],
  ['ACCESS', text(['server-boosts', 'giveaways', 'paid-promo', 'lovecafe', 'complains'])],
  [
    'EXCLUSIVE EVENT',
    text(['event-rules', 'event-details', 'vote-here', 'event-chat', 'prize-pool', 'registration']),
  ],
  ['GENERAL', text(['chat', 'english-chat', 'media-chat', 'cmd', 'ranks'])],
  [
    'EVENT',
    text(['event-rules', 'event-details', 'event-annc', 'event-chat', 'registration', 'help-desk']),
  ],
  [
    'THE MUSIC CHAMBER',
    [
      ...text(['jamming-pings', 'singing-highlights', 'artisan-hall']),
      ...voice(['Saadhana Riyaz VC', 'Singing VC']),
    ],
  ],
  [
    'CHILLING ZONE',
    [
      ...text(['vc-rules', 'vc-help', 'vc-request']),
      ...voice(['Movie Night', ...nums('Lounge', 15)]),
    ],
  ],
  ['PVT VCZ', [...text(['interface']), ...voice(['Create Your Vc'])]],
  [
    'INDIA STREETS',
    [
      ...text(['streets-updates', 'streets-ping-role', 'streets-rules']),
      ...voice([
        'Join to drag',
        'Harmu Road',
        'GT ROAD',
        'Marine Drive',
        'Mall Road',
        'Gedi Route',
        'Shimla',
        'The Debate Room',
        'Tech Lounge',
        'North INDIA',
        'South INDIA',
        'East INDIA',
        'West INDIA',
      ]),
    ],
  ],
  ['DUO', voice(['Create your duo', ...nums('Duo', 8)])],
  [
    'GAMING ARENA',
    [
      ...text([
        'gaming-announcement',
        'gaming-roles',
        'gaming-pings',
        'gaming-chat',
        'registration',
      ]),
      ...voice([
        'Gaming Cafe',
        'ROBLOX 1',
        'ROBLOX 2',
        'MINECRAFT',
        'MINECRAFT 2',
        'FREE FIRE CUSTOM',
        'GACHA GAME',
        'AMONG US',
        'VALORANT 1',
        'VALORANT 2',
        'Horror Games',
        'BRAWLHALLA',
        'OTHER GAMES VC',
        'BGMI',
        'CHESS 1',
      ]),
    ],
  ],
  ['FUNZONE', text(['owo', 'poketwo', 'karuta', 'sofi', 'sayori'])],
  [
    'MUSIC ZONE',
    [
      ...text(['music-cmnd']),
      ...voice(['Create Music Vc', 'Music vc 1', 'Music vc 2', 'Music solo']),
    ],
  ],
  ['PFP AND BANNERS', text(['boys-pfp', 'girls-pfp', 'couple-pfp', 'banners'])],
  ['PERKS', text(['voice-rank-perks', 'regulars-perks', 'booster-perks', 'chat-rank-perks'])],
];
// [name, hex color, flags]. Listed from the BOTTOM of the hierarchy to the top inside each group
// (restore creates in list order, and Discord stacks each new role above the last), and groups are
// ordered so staff ends up on top. Flags: h = hoisted in the member list, m = mentionable.
const GROUPS = [
  [
    'fun',
    0xff7eb6,
    [
      'Otaku',
      'Weeb',
      'Anime Addict',
      'Senpai',
      'Kawaii',
      'Meme Lord',
      'Night Thinker',
      'Cat Person',
    ],
    '',
  ],
  [
    'badge',
    0xf1c40f,
    ['Early Supporter', 'OG Member', 'Verified', 'Event Winner', 'Event Host', 'Legend'],
    '',
  ],
  [
    'perk',
    0xe91e63,
    [
      'Server Booster',
      'Booster Plus',
      'Regular',
      'Super Regular',
      'Elite Regular',
      'Gold Regular',
      'Diamond Regular',
      'VIP',
      'Supporter',
      'Patron',
    ],
    'h',
  ],
  [
    'ping',
    0x3498db,
    [
      'Event Ping',
      'Giveaway Ping',
      'Announcement Ping',
      'Movie Ping',
      'Music Ping',
      'Gaming Ping',
      'Streets Ping',
      'Chat Revive',
      'Poll Ping',
      'Update Ping',
    ],
    'm',
  ],
  [
    'color',
    0x1abc9c,
    [
      'Crimson',
      'Saffron',
      'Marigold',
      'Emerald',
      'Teal',
      'Sky Blue',
      'Indigo',
      'Violet',
      'Rose Pink',
      'Charcoal',
    ],
    '',
  ],
  [
    'game',
    0x2ecc71,
    [
      'Free Fire',
      'Valorant',
      'BGMI',
      'Minecraft',
      'Roblox',
      'Among Us',
      'Chess',
      'Brawlhalla',
      'Gacha',
      'Horror',
      'Retro',
      'PC Master',
    ],
    '',
  ],
  [
    'voice',
    0x9b59b6,
    [
      'Voice Rookie',
      'Voice Regular',
      'Voice Talker',
      'Voice Addict',
      'Voice Veteran',
      'Voice Pro',
      'Voice Elite',
      'Voice Master',
      'Voice Legend',
      'Voice God',
    ],
    '',
  ],
  [
    'staff',
    0xe74c3c,
    [
      'Trial Helper',
      'Helper',
      'Moderator',
      'Senior Moderator',
      'Manager',
      'Admin',
      'Co-Owner',
      'Owner',
    ],
    'h',
  ],
];
// The real Discord India roles, verbatim (punctuation and emoji are part of the names), copied from the
// member list, TOP of the hierarchy first. All hoisted, cosmetic, permissions 0. The eight level roles
// carry the "〃💫 ⁚ " prefix the screenshots show.
export const REAL_ROLES = [
  ['India Officials™', 0xff5a5f],
  ['Happy Birthday 💖', 0xff8fb8],
  ['Top Performer 🕊', 0xf5f5f5],
  ['. The Authority !?', 0xe74c3c],
  ['. Main Character ?', 0x9b59ff],
  ['. Imperial Lord !?', 0xc0392b],
  ['Valor ?', 0xe67e22],
  ['Heaven', 0x74b9ff],
  ['King', 0xf1c40f],
  ['Real Ogs .', 0xd4af37],
  ['Eclipse Lord', 0x6c5ce7],
  ['Born to Rule', 0xb33939],
  ['Night Prince', 0x341f97],
  ['Her Highness', 0xfd79a8],
  ['The Black Dragons', 0x2d3436],
  ['Royal Queen', 0xe84393],
  ['The White Fang', 0xdfe6e9],
  ['Holds Aura', 0x00cec9],
  ['Realm’s Chosen', 0x55efc4],
  ['Ivory', 0xf8efba],
  ['Obsidian', 0x4b4b4b],
  ['Echelon', 0x0984e3],
  ['Princess', 0xff9ff3],
  ['Supreme Lord', 0xd63031],
  ['Pretty Soul', 0xfab1a0],
  ['Astral Warden', 0x8e7cc3],
  ['Enchantress', 0xa55eea],
  ['Phantom Order', 0x576574],
  ['Hawtiess', 0xff6b81],
  ['Vanguard', 0x3867d6],
  ['Commanding Presence', 0x3498db],
  ['Warriors.?!', 0xeb3b5a],
  ['Spotify !', 0x1db954],
  ['Special Angels', 0xffeaa7],
  ["Og'z", 0xfdcb6e],
  ['Melodist.!', 0x9c88ff],
  ['Boosters', 0xf47fff],
  ['India regulars', 0xff9933],
  ['〃💫 ⁚ Phantom Vanguard 80', 0x8854d0],
  ['〃💫 ⁚ Cosmic Warden 70', 0x6c5ce7],
  ['〃💫 ⁚ Nebula Sage 60', 0x7f8fe8],
  ['〃💫 ⁚ Celestial Keeper 50', 0x4a90e2],
  ['〃💫 ⁚ Astral Adept 40', 0x2bcbba],
  ['〃💫 ⁚ Lunar Envoy 30', 0x7bed9f],
  ['〃💫 ⁚ Starlight Acolyte 20', 0xeccc68],
  ['〃💫 ⁚ Dawn Initiate 10', 0xced6e0],
];
// Distinct shade per role inside a group, so a group is not one flat color.
function shade(base, i, n) {
  const f = 0.7 + (0.5 * i) / Math.max(1, n - 1);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((base >> 16) & 255) << 16) | (ch((base >> 8) & 255) << 8) | ch(base & 255);
}
export function discordIndiaTemplate() {
  const roles = [];
  for (const [, base, names, flags] of GROUPS)
    names.forEach((name, i) =>
      roles.push({
        id: `bt-r-${roles.length + 1}`,
        name,
        color: shade(base, i, names.length),
        hoist: flags.includes('h'),
        mentionable: flags.includes('m'),
        permissions: '0',
        position: roles.length + 1,
        everyone: false,
      }),
    );
  const channels = [];
  let position = 0;
  for (const [category, children] of DISCORD_INDIA_CHANNELS) {
    const id = `bt-c-${channels.length + 1}`;
    channels.push({
      id,
      name: `✦ ${category} ✦`,
      type: ChannelType.GuildCategory,
      parentId: null,
      position: position++,
      topic: null,
      nsfw: false,
      rateLimitPerUser: 0,
      bitrate: null,
      userLimit: 0,
      overwrites: [],
    });
    for (const [type, name] of children)
      channels.push({
        id: `bt-c-${channels.length + 1}`,
        name,
        type,
        parentId: id,
        position: position++,
        topic: null,
        nsfw: false,
        rateLimitPerUser: 0,
        bitrate: null,
        userLimit: 0,
        overwrites: [],
      });
  }
  // Restore creates roles in list order and each new role lands above the last, so the real roles go
  // last, reversed, to end up on top in their original order.
  for (const [name, color] of [...REAL_ROLES].reverse())
    roles.push({
      id: `bt-r-${roles.length + 1}`,
      name,
      color,
      hoist: true,
      mentionable: false,
      permissions: '0',
      position: roles.length + 1,
      everyone: false,
    });
  return {
    version: BACKUP_VERSION,
    guildId: 'builtin:discord-india',
    guildName: 'Discord India',
    createOrder: 'listed',
    roles: [
      {
        id: 'bt-everyone',
        name: '@everyone',
        color: 0,
        hoist: false,
        mentionable: false,
        permissions: '0',
        position: 0,
        everyone: true,
      },
      ...roles,
    ],
    channels,
  };
}
const BUILTINS = new Map([['discord-india', discordIndiaTemplate]]);
/** "Discord India", "discord_india" and "discord-india" all name the same built-in. */
export function builtinKey(input) {
  const key = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return BUILTINS.has(key) ? key : null;
}
export function builtinTemplate(input) {
  const key = builtinKey(input);
  if (!key) return null;
  const data = BUILTINS.get(key)();
  return {
    name: key,
    by: null,
    builtin: true,
    at: 0,
    from: 'built-in',
    chunks: 0,
    roles: data.roles.filter((r) => !r.everyone).length,
    channels: data.channels.length,
    data,
  };
}
export function builtinManifests() {
  return [...BUILTINS.keys()].map((k) => {
    const { data, ...rest } = builtinTemplate(k);
    return rest;
  });
}
