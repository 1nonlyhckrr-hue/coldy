import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { validateOutputChannel } from './guildConfig.js';
import { UserError } from '../utils/errors.js';
const safeNames = new Set([
  'ViewChannel',
  'SendMessages',
  'ReadMessageHistory',
  'AddReactions',
  'EmbedLinks',
  'AttachFiles',
  'UseExternalEmojis',
  'UseExternalStickers',
  'Connect',
  'Speak',
  'Stream',
  'UseVAD',
  'UseApplicationCommands',
  'SendMessagesInThreads',
  'SendVoiceMessages',
  'SendPolls',
]);
// Fail closed for new Discord permissions: only reviewed community permissions are allowed.
const dangerous = Object.entries(P)
  .filter(([name]) => !safeNames.has(name))
  .map(([, flag]) => flag);
export function validateSelfRole(role, bot, actor, guild) {
  if (!role || role.guild.id !== guild.id || role.id === guild.id || role.managed)
    throw new UserError('roleInvalid');
  if (dangerous.some((permission) => role.permissions.has(permission)))
    throw new UserError('roleDangerous');
  if (bot.roles.highest.comparePositionTo(role) <= 0) throw new UserError('roleBotHierarchy');
  if (actor.id !== guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)
    throw new UserError('roleActorHierarchy');
  if (!bot.permissions.has(P.ManageRoles)) throw new UserError('roleBotPermission');
}
export class RolePanels {
  constructor(db) {
    this.db = db;
  }
  reserve(record) {
    return this.db.transaction(() => {
      if (
        this.db
          .prepare(
            "SELECT count(*) n FROM role_panels WHERE guild_id=? AND status IN ('pending','active','uncertain')",
          )
          .get(record.guildId).n >= 100
      )
        throw new UserError('rolePanelLimit');
      const id = Number(
        this.db
          .prepare(
            'INSERT INTO role_panels(guild_id,channel_id,role_id,label,interaction_id,created_at) VALUES(?,?,?,?,?,?)',
          )
          .run(
            record.guildId,
            record.channelId,
            record.roleId,
            record.label,
            record.interactionId,
            Date.now(),
          ).lastInsertRowid,
      );
      for (const [index, b] of (
        record.buttons ?? [{ roleId: record.roleId, label: record.label }]
      ).entries())
        this.db
          .prepare('INSERT INTO role_panel_buttons VALUES(?,?,?,?)')
          .run(id, index, b.roleId, b.label);
      return id;
    })();
  }
  recover() {
    this.db.prepare("UPDATE role_panels SET status='uncertain' WHERE status='pending'").run();
  }
  buttons(id) {
    return this.db
      .prepare(
        'SELECT button_index,role_id,label FROM role_panel_buttons WHERE panel_id=? ORDER BY button_index',
      )
      .all(id);
  }
  get(id, guildId) {
    return this.db.prepare('SELECT * FROM role_panels WHERE id=? AND guild_id=?').get(id, guildId);
  }
  list(guildId) {
    return this.db
      .prepare(
        'SELECT id,channel_id,message_id,role_id,label,status FROM role_panels WHERE guild_id=? ORDER BY id DESC LIMIT 20',
      )
      .all(guildId);
  }
  complete(id, messageId) {
    this.db
      .prepare("UPDATE role_panels SET message_id=?,status='active' WHERE id=?")
      .run(messageId, id);
  }
  status(id, status) {
    if (!['disabled', 'uncertain', 'failed'].includes(status))
      throw new Error('Invalid panel state');
    this.db.prepare('UPDATE role_panels SET status=? WHERE id=?').run(status, id);
  }
}
export async function createRolePanel(i, c, { channelId, roleId, label }) {
  return createMultiRolePanel(i, c, { channelId, buttons: [{ roleId, label }] });
}
export async function createMultiRolePanel(i, c, { channelId, buttons }) {
  const locale = c.localization?.locale(i.guildId) ?? 'en';
  if (
    !Array.isArray(buttons) ||
    buttons.length < 1 ||
    buttons.length > 5 ||
    new Set(buttons.map((b) => b?.roleId)).size !== buttons.length
  )
    throw new UserError('rolePanelMappingsInvalid');
  for (const b of buttons)
    if (
      typeof b.roleId !== 'string' ||
      !/^\d{17,20}$/.test(b.roleId) ||
      typeof b.label !== 'string' ||
      b.label.trim().length < 1 ||
      b.label.length > 70 ||
      /[\u0000-\u001f\u007f]/u.test(b.label)
    )
      throw new UserError('roleLabelInvalid');
  const [actor, bot, channel, ...roles] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
    validateOutputChannel(i.guild, channelId),
    ...buttons.map((b) => i.guild.roles.fetch(b.roleId, { force: true })),
  ]);
  if (!actor.permissions.has(P.ManageRoles)) throw new UserError('roleActorPermission');
  roles.forEach((role, index) => {
    if (role?.id !== buttons[index].roleId) throw new UserError('roleInvalid');
    validateSelfRole(role, bot, actor, i.guild);
  });
  const mapped = buttons.map((b) => ({ ...b, label: b.label.trim() }));
  const panelId = c.rolePanels.reserve({
    guildId: i.guildId,
    channelId,
    roleId: mapped[0].roleId,
    label: mapped[0].label,
    buttons: mapped,
    interactionId: i.id,
  });
  const components = mapped.map((b, index) =>
    new ButtonBuilder()
      .setCustomId(index === 0 ? `luna:role:${panelId}` : `luna:role:${panelId}:${index}`)
      .setLabel(b.label)
      .setStyle(ButtonStyle.Secondary),
  );
  let message;
  try {
    message = await channel.send(
      lunaPayload(
        {
          content: translate(locale, 'rolePanelPrompt'),
          components: [new ActionRowBuilder().addComponents(components)],
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
  } catch {
    c.rolePanels.status(panelId, 'uncertain');
    throw new UserError('rolePanelUncertain', { id: panelId });
  }
  try {
    c.rolePanels.complete(panelId, message.id);
  } catch {
    throw new UserError('rolePanelStorageFailed', { id: panelId });
  }
  return { panelId, messageId: message.id };
}
export function createRoleButtonHandler(c) {
  const active = new Set();
  return async (i) => {
    if (!i.isButton() || !i.customId.startsWith('luna:role:')) return false;
    const locale = c.localization?.locale(i.guildId) ?? 'en';
    const key = `${i.guildId}:${i.user.id}`;
    if (active.has(key)) {
      await i.reply(
        lunaPayload(
          { content: translate(locale, 'roleActionBusy'), flags: MessageFlags.Ephemeral },
          { locale },
        ),
      );
      return true;
    }
    active.add(key);
    try {
      if (!i.inGuild()) throw new UserError('roleGuildOnly');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const match = /^luna:role:(\d+)(?::([0-4]))?$/.exec(i.customId);
      if (!match) throw new UserError('rolePanelInvalid');
      const panel = c.rolePanels.get(Number(match[1]), i.guildId);
      if (
        !panel ||
        panel.status !== 'active' ||
        panel.message_id !== i.message.id ||
        panel.channel_id !== i.channelId
      )
        throw new UserError('rolePanelInactive');
      const remaining = c.cooldowns.acquire(`role:${key}`, 3000);
      if (remaining) throw new UserError('roleCooldown');
      const mapping = c.rolePanels
        .buttons(panel.id)
        .find((b) => b.button_index === Number(match[2] ?? 0));
      if (!mapping) throw new UserError('rolePanelInactive');
      const [member, bot, role] = await Promise.all([
        i.guild.members.fetch({ user: i.user.id, force: true }),
        i.guild.members.fetchMe({ force: true }),
        i.guild.roles.fetch(mapping.role_id, { force: true }),
      ]);
      // Validate every click: a role may have been edited to grant dangerous permissions.
      if (role?.id !== mapping.role_id) throw new UserError('roleInvalid');
      validateSelfRole(role, bot, { id: i.guild.ownerId }, i.guild);
      const latest = c.rolePanels.get(panel.id, i.guildId);
      if (latest?.status !== 'active' || latest.message_id !== i.message.id)
        throw new UserError('rolePanelInactive');
      const has = member.roles.cache.has(role.id);
      try {
        if (has) await member.roles.remove(role, 'Luna self-service role');
        else await member.roles.add(role, 'Luna self-service role');
      } catch {
        throw new UserError('roleChangeUncertain');
      }
      await i.editReply(
        lunaPayload(
          {
            content: translate(locale, has ? 'roleRemoved' : 'roleAdded'),
            allowedMentions: { parse: [] },
          },
          { locale },
        ),
      );
    } catch (error) {
      await c.handleInteractionError(error, i, c.logger);
    } finally {
      active.delete(key);
    }
    return true;
  };
}
