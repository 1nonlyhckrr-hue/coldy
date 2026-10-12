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
  reserveClick(interactionId, guildId, userId, roleId, action = 'unknown') {
    if (!['unknown', 'add', 'remove'].includes(action)) throw new TypeError('Invalid click action');
    return this.db.transaction(() => {
      if (
        this.db
          .prepare('SELECT 1 FROM role_click_receipts WHERE interaction_id=?')
          .get(interactionId)
      )
        throw new UserError('roleClickBlocked');
      if (
        this.db
          .prepare(
            "SELECT 1 FROM role_click_receipts WHERE guild_id=? AND user_id=? AND role_id=? AND status IN ('pending','uncertain')",
          )
          .get(guildId, userId, roleId)
      )
        throw new UserError('roleClickBlocked');
      this.db
        .prepare(
          "INSERT INTO role_click_receipts(interaction_id,guild_id,user_id,role_id,status,created_at,action) VALUES(?,?,?,?,'pending',?,?)",
        )
        .run(interactionId, guildId, userId, roleId, Date.now(), action);
    })();
  }
  finishClick(interactionId, status) {
    if (!['completed', 'failed', 'uncertain'].includes(status))
      throw new TypeError('Invalid click status');
    const r = this.db
      .prepare(
        "UPDATE role_click_receipts SET status=? WHERE interaction_id=? AND status='pending'",
      )
      .run(status, interactionId);
    if (r.changes !== 1) throw new Error('Click finalization failed');
  }
  recover() {
    this.db
      .prepare("UPDATE role_click_receipts SET status='uncertain' WHERE status='pending'")
      .run();
    this.db.prepare("UPDATE role_panels SET status='uncertain' WHERE status='pending'").run();
  }
  click(interactionId, guildId) {
    return this.db
      .prepare('SELECT * FROM role_click_receipts WHERE interaction_id=? AND guild_id=?')
      .get(interactionId, guildId);
  }
  reconcileObserved(record) {
    if (record?.status !== 'uncertain' || !['add', 'remove'].includes(record.action))
      throw new UserError('roleClickReconcileBlocked');
    const result = this.db
      .prepare(
        "UPDATE role_click_receipts SET status='completed' WHERE interaction_id=? AND guild_id=? AND user_id=? AND role_id=? AND action=? AND created_at=? AND status='uncertain'",
      )
      .run(
        record.interaction_id,
        record.guild_id,
        record.user_id,
        record.role_id,
        record.action,
        record.created_at,
      );
    if (result.changes !== 1) throw new UserError('roleClickReconcileBlocked');
  }
  unresolvedClicks(guildId, userId) {
    return this.db
      .prepare(
        "SELECT interaction_id,role_id,status,created_at,action FROM role_click_receipts WHERE guild_id=? AND user_id=? AND status IN ('pending','uncertain') ORDER BY created_at DESC,interaction_id DESC LIMIT 10",
      )
      .all(guildId, userId);
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
  list(guildId, page = 1, { state = null } = {}) {
    if (!Number.isInteger(page) || page < 1 || page > 10)
      throw new UserError('rolePanelPageInvalid');
    if (state !== null && !['pending', 'active', 'disabled', 'uncertain'].includes(state))
      throw new UserError('rolePanelStateInvalid');
    return this.db
      .prepare(
        'SELECT id,channel_id,message_id,role_id,label,status FROM role_panels WHERE guild_id=? AND (? IS NULL OR status=?) ORDER BY id DESC LIMIT 10 OFFSET ?',
      )
      .all(guildId, state, state, (page - 1) * 10);
  }
  disableActive(guildId) {
    if (typeof guildId !== 'string' || !guildId) throw new TypeError('Invalid guild');
    return this.db
      .prepare("UPDATE role_panels SET status='disabled' WHERE guild_id=? AND status='active'")
      .run(guildId).changes;
  }
  summary(guildId) {
    return this.db
      .prepare(
        'SELECT status,COUNT(*) AS count FROM role_panels WHERE guild_id=? GROUP BY status ORDER BY status',
      )
      .all(guildId);
  }
  clickSummary(guildId) {
    return this.db
      .prepare(
        'SELECT status,action,COUNT(*) AS count FROM role_click_receipts WHERE guild_id=? GROUP BY status,action ORDER BY status,action',
      )
      .all(guildId);
  }
  channelRecords(guildId, channelId) {
    if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId))
      throw new UserError('rolePanelScopeInvalid');
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT COUNT(*) n FROM role_panels WHERE guild_id=? AND channel_id=?')
        .get(guildId, channelId).n;
      const rows = this.db
        .prepare(
          'SELECT id,channel_id,message_id,status FROM role_panels WHERE guild_id=? AND channel_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId, channelId);
      return {
        total,
        truncated: total > rows.length,
        panels: rows.map((row) => ({ ...row, buttons: this.buttons(row.id) })),
      };
    })();
  }
  exportMappings(guildId) {
    return this.db.transaction(() => {
      const total = this.db
        .prepare('SELECT count(*) n FROM role_panels WHERE guild_id=?')
        .get(guildId).n;
      const rows = this.db
        .prepare(
          'SELECT id,channel_id,message_id,status FROM role_panels WHERE guild_id=? ORDER BY id DESC LIMIT 100',
        )
        .all(guildId);
      return {
        total,
        truncated: total > rows.length,
        panels: rows.map((r) => ({ ...r, buttons: this.buttons(r.id) })),
      };
    })();
  }
  disableFor(guildId, kind, id) {
    if (!['channel', 'role'].includes(kind) || typeof id !== 'string' || !/^\d{17,20}$/.test(id))
      throw new UserError('rolePanelScopeInvalid');
    return (
      kind === 'channel'
        ? this.db.prepare(
            "UPDATE role_panels SET status='disabled' WHERE guild_id=? AND status='active' AND channel_id=?",
          )
        : this.db.prepare(
            "UPDATE role_panels SET status='disabled' WHERE guild_id=? AND status='active' AND EXISTS(SELECT 1 FROM role_panel_buttons b WHERE b.panel_id=role_panels.id AND b.role_id=?)",
          )
    ).run(guildId, id).changes;
  }
  complete(id, messageId) {
    if (typeof messageId !== 'string' || !messageId.trim())
      throw new TypeError('Missing panel message identity');
    const result = this.db
      .prepare(
        "UPDATE role_panels SET message_id=?,status='active' WHERE id=? AND status='pending'",
      )
      .run(messageId, id);
    if (result.changes !== 1) throw new Error('Panel reservation not pending');
  }
  publicationUncertain(id) {
    return this.db
      .prepare("UPDATE role_panels SET status='uncertain' WHERE id=? AND status='pending'")
      .run(id).changes;
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
  const [channel, ...roles] = await Promise.all([
    validateOutputChannel(i.guild, channelId),
    ...buttons.map((b) => i.guild.roles.fetch(b.roleId, { force: true })),
  ]);
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  if (
    !i.client.user?.id ||
    bot?.id !== i.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('roleBotPermission');
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
    c.rolePanels.publicationUncertain(panelId);
    throw new UserError('rolePanelUncertain', { id: panelId });
  }
  try {
    if (typeof message?.id !== 'string' || !message.id.trim()) {
      c.rolePanels.publicationUncertain(panelId);
      throw new Error('Missing panel message identity');
    }
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
      if (i.guild.id !== i.guildId || member?.id !== i.user.id || member.guild?.id !== i.guildId)
        throw new UserError('roleClickBlocked');
      if (
        bot?.id !== i.client.user.id ||
        bot.guild?.id !== i.guildId ||
        !i.appPermissions?.has(P.ManageRoles)
      )
        throw new UserError('roleBotPermission');
      // Validate every click: a role may have been edited to grant dangerous permissions.
      if (role?.id !== mapping.role_id) throw new UserError('roleInvalid');
      validateSelfRole(role, bot, { id: i.guild.ownerId }, i.guild);
      const latest = c.rolePanels.get(panel.id, i.guildId);
      if (
        latest?.status !== 'active' ||
        latest.message_id !== i.message.id ||
        latest.channel_id !== i.channelId
      )
        throw new UserError('rolePanelInactive');
      const has = member.roles.cache.has(role.id);
      c.rolePanels.reserveClick(i.id, i.guildId, i.user.id, role.id, has ? 'remove' : 'add');
      try {
        if (has) await member.roles.remove(role, 'Luna self-service role');
        else await member.roles.add(role, 'Luna self-service role');
      } catch (error) {
        const rejected =
          typeof error.code === 'number' && error.status >= 400 && error.status < 500;
        c.rolePanels.finishClick(i.id, rejected ? 'failed' : 'uncertain');
        throw new UserError('roleChangeUncertain');
      }
      try {
        c.rolePanels.finishClick(i.id, 'completed');
      } catch {
        throw new UserError('roleClickBlocked');
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

export async function reconcileRoleClick(i, c, interactionId) {
  const record = c.rolePanels.click(interactionId, i.guildId);
  if (record?.status !== 'uncertain' || !['add', 'remove'].includes(record.action))
    throw new UserError('roleClickReconcileBlocked');
  const role = await i.guild.roles.fetch(record.role_id, { force: true });
  const member = await i.guild.members.fetch({ user: record.user_id, force: true });
  const [actor, bot] = await Promise.all([
    i.guild.members.fetch({ user: i.user.id, force: true }),
    i.guild.members.fetchMe({ force: true }),
  ]);
  if (
    i.guild.id !== i.guildId ||
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageRoles)
  )
    throw new UserError('roleActorPermission');
  if (
    !i.client.user?.id ||
    bot?.id !== i.client.user.id ||
    bot.guild?.id !== i.guildId ||
    !i.appPermissions?.has(P.ManageRoles)
  )
    throw new UserError('roleBotPermission');
  if (
    role?.id !== record.role_id ||
    member?.id !== record.user_id ||
    member.guild?.id !== i.guildId
  )
    throw new UserError('roleClickReconcileBlocked');
  validateSelfRole(role, bot, actor, i.guild);
  if (
    !member.roles?.cache ||
    typeof member.roles.cache.has !== 'function' ||
    member.roles.cache.has(role.id) !== (record.action === 'add')
  )
    throw new UserError('roleClickReconcileBlocked');
  c.rolePanels.reconcileObserved(record);
}
