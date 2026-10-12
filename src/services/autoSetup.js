import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { STRUCTURE } from './serverStructure.js';
import { validateTicketConfig } from './tickets.js';
import { validateSelfRole, createMultiRolePanel } from './rolePanels.js';

export const LOG_EVENTS = [
  'memberjoin',
  'memberleave',
  'rolecreate',
  'roledelete',
  'roleupdate',
  'channelcreate',
  'channeldelete',
  'channelupdate',
];
export const WELCOME_TEXT = "Welcome {user} to {server} 🔥 You're member #{count} - have fun!";
// Channel names come from the structure, so lookup stays exact and in one place.
export const NAMES = {
  welcome: STRUCTURE[0].channels[0].name,
  modLogs: STRUCTURE[5].channels[1].name,
  supportCategory: STRUCTURE[4].name,
  staffCategory: STRUCTURE[5].name,
  voiceCategory: STRUCTURE[3].name,
  lobby: STRUCTURE[3].channels[0].name,
  rules: STRUCTURE[0].channels[1].name,
  media: STRUCTURE[1].channels[1].name,
  infoCategory: STRUCTURE[0].name,
  chatCategory: STRUCTURE[1].name,
};
export const EXTRA_ROLES = {
  inVoice: 'In Voice',
  ffPlayer: 'FF Player',
  minecraft: 'Minecraft',
  announcements: 'Announcements',
};
// Standard profanity, English plus common romanized Hindi. Short fragments are left out so
// ordinary words never trip the filter.
export const BANNED_WORDS = [
  'fuck',
  'fucker',
  'motherfucker',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dickhead',
  'cunt',
  'slut',
  'whore',
  'nigger',
  'faggot',
  'retard',
  'madarchod',
  'behenchod',
  'bhenchod',
  'bhosdike',
  'bhosdi',
  'chutiya',
  'chutiye',
  'gandu',
  'gaandu',
  'harami',
  'haramkhor',
  'randi',
  'lund',
  'kutta',
  'kamina',
  'saala',
];

function findChannel(guild, name, type, parentName) {
  return guild.channels.cache.find((ch) => {
    if (ch.type !== type || ch.name !== name) return false;
    if (!parentName) return true;
    const parent = guild.channels.cache.get(ch.parentId);
    return parent?.name === parentName;
  });
}

async function step(results, key, fn) {
  try {
    const out = await fn();
    results.push({ key, ...out });
  } catch (error) {
    results.push({ key, status: 'failed', reason: error?.key ?? 'failed' });
  }
}

/**
 * Writes a default Emika configuration for one guild through the same services the individual
 * commands use. Every step is isolated: one failure never blocks the others. Parts that need an
 * env flag that is off are saved and reported as dormant instead of failing.
 */
export async function runAutoSetup({ guild, context: c, actorId, bot, options = {} }) {
  await guild.channels.fetch();
  await guild.roles.fetch();
  const results = [];
  const language = options.language ?? 'hinglish';
  const rolesMode = options.roles ?? 'create';
  const gid = guild.id;
  const text = ChannelType.GuildText;
  const missing = { status: 'skipped', reason: 'structureMissing' };
  const roles = {};

  await step(results, 'language', async () => {
    c.guildConfig.setLanguage(gid, language);
    return { status: 'saved' };
  });

  await step(results, 'roles', async () => {
    const created = [];
    const used = [];
    const notes = [];
    const specs = {
      owner: {
        name: 'Owner',
        color: 0xf1c40f,
        hoist: true,
        permissions: [P.Administrator],
        fallback: [],
      },
      mod: {
        name: 'Mod',
        color: 0x3498db,
        hoist: true,
        permissions: [P.ManageMessages, P.KickMembers, P.ModerateMembers, P.MoveMembers],
      },
      member: { name: 'Member', hoist: false, permissions: [] },
    };
    for (const [kind, spec] of Object.entries(specs)) {
      let role =
        rolesMode === 'existing'
          ? { mod: options.modRole, member: options.memberRole }[kind]
          : guild.roles.cache.find((r) => r.name === spec.name && !r.managed);
      if (role) used.push(spec.name);
      else if (rolesMode === 'create') {
        const base = {
          name: spec.name,
          hoist: spec.hoist,
          mentionable: false,
          reason: 'Emika auto setup',
        };
        if (spec.color) base.color = spec.color;
        try {
          role = await guild.roles.create({ ...base, permissions: spec.permissions });
        } catch (error) {
          if (kind !== 'owner') throw error;
          role = await guild.roles.create({ ...base, permissions: [] });
          notes.push('autoOwnerNoAdmin');
        }
        created.push(spec.name);
        if (kind === 'owner' && typeof role.setPosition === 'function') {
          try {
            await role.setPosition(Math.max(1, bot.roles.highest.position - 1));
          } catch {
            notes.push('autoOwnerPosition');
          }
        }
      }
      roles[kind] = role;
    }
    if (roles.mod) {
      const staffCategory = findChannel(guild, NAMES.staffCategory, ChannelType.GuildCategory);
      if (staffCategory)
        await staffCategory.permissionOverwrites.edit(roles.mod, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          Connect: true,
        });
    }
    if (!roles.owner && !roles.mod && !roles.member)
      return { status: 'skipped', reason: 'rolesMissing' };
    return {
      status: 'saved',
      notes,
      detail: { created: created.join(', ') || '-', used: used.join(', ') || '-' },
    };
  });

  await step(results, 'logging', async () => {
    const channel = findChannel(guild, NAMES.modLogs, text, NAMES.staffCategory);
    if (!channel) return missing;
    c.guildConfig.patch(gid, 'logging', {
      channelId: channel.id,
      events: LOG_EVENTS,
      enabled: true,
    });
    return c.config.memberEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MEMBER_EVENTS' };
  });

  await step(results, 'welcome', async () => {
    const channel = findChannel(guild, NAMES.welcome, text, STRUCTURE[0].name);
    if (!channel) return missing;
    c.guildConfig.patch(gid, 'welcome', {
      channelId: channel.id,
      enabled: true,
      goodbyeEnabled: true,
      message: WELCOME_TEXT,
      messageCustom: true,
    });
    return c.config.memberEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MEMBER_EVENTS' };
  });

  await step(results, 'antinuke', async () => {
    const channel = findChannel(guild, NAMES.modLogs, text, NAMES.staffCategory);
    if (!channel) return missing;
    c.antinuke.patch(gid, { enabled: true, channelId: channel.id });
    return c.config.auditEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_AUDIT_EVENTS' };
  });

  await step(results, 'automod', async () => {
    const current = c.automod.get?.(gid);
    const exempt = [roles.owner?.id, roles.mod?.id].filter(Boolean);
    c.automod.patch(gid, {
      enabled: true,
      action: 'delete',
      rules: { words: true, invites: true, mentions: true, caps: true, spam: true },
      words: [...new Set([...(current?.words ?? []), ...BANNED_WORDS])].slice(0, 100),
      exemptRoles: [...new Set([...(current?.exemptRoles ?? []), ...exempt])].slice(0, 20),
    });
    return c.config.messageEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MESSAGE_EVENTS' };
  });

  await step(results, 'autorole', async () => {
    if (!roles.member) return { status: 'skipped', reason: 'rolesMissing' };
    validateSelfRole(roles.member, bot, await guild.members.fetch(actorId), guild);
    c.autoroles.add(gid, 'humans', roles.member.id, actorId);
    return c.config.memberEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MEMBER_EVENTS' };
  });

  await step(results, 'tickets', async () => {
    const category = findChannel(guild, NAMES.supportCategory, ChannelType.GuildCategory);
    if (!category) return missing;
    if (!roles.mod) return { status: 'skipped', reason: 'rolesMissing' };
    await validateTicketConfig(guild, category.id, roles.mod.id);
    c.tickets.configure(gid, category.id, roles.mod.id);
    return { status: 'saved' };
  });

  await step(results, 'voice', async () => {
    const category = findChannel(guild, NAMES.voiceCategory, ChannelType.GuildCategory);
    if (!category) return missing;
    c.voiceMaster.setup(gid, category.id);
    return { status: 'saved' };
  });

  await step(results, 'vmjoin', async () => {
    const lobby = findChannel(guild, NAMES.lobby, ChannelType.GuildVoice, NAMES.voiceCategory);
    if (!lobby) return missing;
    if (!c.voiceMaster.config(gid)) return { status: 'skipped', reason: 'voiceFirst' };
    c.voiceJoin.set(gid, lobby.id, actorId);
    return c.config.voiceEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_VOICE_EVENTS' };
  });

  const extra = {};
  await step(results, 'extraRoles', async () => {
    const created = [];
    for (const [kind, name] of Object.entries(EXTRA_ROLES)) {
      let role = guild.roles.cache.find((r) => r.name === name && !r.managed);
      if (!role) {
        role = await guild.roles.create({
          name,
          hoist: false,
          mentionable: kind === 'announcements',
          permissions: [],
          reason: 'Emika auto setup',
        });
        created.push(name);
      }
      extra[kind] = role;
    }
    return { status: 'saved', detail: { created: created.join(', ') || '-', used: '-' } };
  });

  await step(results, 'media', async () => {
    const channel = findChannel(guild, NAMES.media, text, NAMES.chatCategory);
    if (!channel) return missing;
    c.mediaPolicy.setup(gid, channel.id);
    return c.config.messageEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MESSAGE_EVENTS' };
  });

  await step(results, 'vcrole', async () => {
    if (!extra.inVoice) return { status: 'skipped', reason: 'rolesMissing' };
    c.voiceRoles.set(gid, extra.inVoice.id, actorId);
    return c.config.voiceEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_VOICE_EVENTS' };
  });

  await step(results, 'guildtag', async () => {
    if (!roles.member) return { status: 'skipped', reason: 'rolesMissing' };
    c.guildTags.setup(gid, roles.member.id);
    return { status: 'saved' };
  });

  await step(results, 'autoresponders', async () => {
    const welcome = findChannel(guild, NAMES.welcome, text, NAMES.infoCategory);
    const rulesChannel = findChannel(guild, NAMES.rules, text, NAMES.infoCategory);
    const wanted = [];
    if (rulesChannel)
      wanted.push([
        'rules',
        `Please read the server rules in <#${rulesChannel.id}> before chatting.`,
      ]);
    if (welcome) {
      const invite = await welcome.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: false,
        reason: 'Emika auto setup',
      });
      wanted.push(['invite', `Invite your friends: ${invite.url}`]);
    }
    if (!wanted.length) return missing;
    for (const [trigger, response] of wanted) {
      const existing = c.autoresponders.find(gid, trigger);
      if (existing) c.autoresponders.edit(gid, trigger, response);
      else
        c.autoresponders.create(gid, { trigger, mode: 'keyword', response, cooldownSeconds: 60 });
    }
    return c.config.messageEventsEnabled
      ? { status: 'saved' }
      : { status: 'dormant', flag: 'ENABLE_MESSAGE_EVENTS' };
  });

  await step(results, 'reactionroles', async () => {
    const channel = findChannel(guild, NAMES.welcome, text, NAMES.infoCategory);
    if (!channel) return missing;
    const picks = [extra.ffPlayer, extra.minecraft, extra.announcements];
    if (picks.some((r) => !r)) return { status: 'skipped', reason: 'rolesMissing' };
    if (!options.interaction) return { status: 'skipped', reason: 'noInteraction' };
    const ids = picks.map((r) => r.id).sort();
    const have = c.rolePanels
      .channelRecords(gid, channel.id)
      .panels.some(
        (p) =>
          p.status === 'active' &&
          JSON.stringify(p.buttons.map((b) => b.role_id).sort()) === JSON.stringify(ids),
      );
    if (have) return { status: 'saved' };
    await createMultiRolePanel(options.interaction, c, {
      channelId: channel.id,
      buttons: [
        { roleId: extra.ffPlayer.id, label: 'FF Player' },
        { roleId: extra.minecraft.id, label: 'Minecraft' },
        { roleId: extra.announcements.id, label: 'Announcements' },
      ],
    });
    return { status: 'saved' };
  });

  results.push({ key: 'needsInput', status: 'info' });
  return results;
}
