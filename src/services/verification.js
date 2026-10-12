import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { UserError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
import { roleHasDangerousPermissions } from './rolePanels.js';
// Opt-in member verification. Does nothing until an allowed user runs /verification setup.
export const UNVERIFIED_NAME = 'Unverified';
export const ITEMS = [
  ['apple', '🍎'],
  ['car', '🚗'],
  ['dog', '🐶'],
  ['moon', '🌙'],
  ['star', '⭐'],
  ['balloon', '🎈'],
];
const id = z.string().regex(/^\d{17,20}$/);
const schema = z
  .object({
    enabled: z.boolean().default(false),
    channelId: id.optional(),
    roleId: id.optional(),
    unverifiedRoleId: id.optional(),
    mode: z.enum(['button', 'challenge']).default('challenge'),
    kickOnFail: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(10).default(3),
  })
  .strict();
export class Verification {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.pending = new Map();
  }
  get(guildId) {
    const r = this.db
      .prepare('SELECT settings_json FROM verification_config WHERE guild_id=?')
      .get(guildId);
    return schema.parse(r ? JSON.parse(r.settings_json) : {});
  }
  patch(guildId, changes) {
    const cfg = schema.parse({ ...this.get(guildId), ...changes });
    this.db
      .prepare(
        'INSERT INTO verification_config VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(cfg));
    return cfg;
  }
  /** Builds a fresh challenge: 4 shuffled emoji buttons and the one to press. */
  challenge(guildId, userId) {
    const pool = [...ITEMS];
    const picks = [];
    while (picks.length < 4) picks.push(pool.splice(randomInt(pool.length), 1)[0]);
    const answer = randomInt(4),
      key = `${guildId}:${userId}`,
      prev = this.pending.get(key);
    this.pending.set(key, {
      answer,
      attempts: prev?.attempts ?? 0,
      expires: this.now() + 5 * 60000,
    });
    return { picks, target: picks[answer][0] };
  }
  /** Returns 'pass' | 'wrong' | 'expired' | 'locked'. The caller applies kick-on-fail. */
  answer(guildId, userId, index, maxAttempts) {
    const key = `${guildId}:${userId}`,
      p = this.pending.get(key);
    if (!p || p.expires < this.now()) {
      this.pending.delete(key);
      return 'expired';
    }
    if (index === p.answer) {
      this.pending.delete(key);
      return 'pass';
    }
    p.attempts++;
    if (p.attempts >= maxAttempts) {
      this.pending.delete(key);
      return 'locked';
    }
    return 'wrong';
  }
  clear(guildId, userId) {
    this.pending.delete(`${guildId}:${userId}`);
  }
}
/** The verified role must be a normal role below Emika, with no staff powers. */
export function validateVerifiedRole(role, bot, guild) {
  if (!role || role.guild?.id !== guild.id || role.id === guild.id || role.managed)
    throw new UserError('roleInvalid');
  if (role.position >= bot.roles.highest.position) throw new UserError('roleBotHierarchy');
  if (roleHasDangerousPermissions(role)) throw new UserError('roleDangerous');
}
/**
 * Finds or creates the Unverified role and hides every channel from it except the verification
 * channel. Safe to rerun.
 */
export async function setupUnverified(guild, cfg, verifyChannel) {
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  let role =
    (cfg.unverifiedRoleId && guild.roles.cache.get(cfg.unverifiedRoleId)) ||
    guild.roles.cache.find((r) => r.name === UNVERIFIED_NAME && !r.managed);
  if (role && roleHasDangerousPermissions(role)) throw new UserError('roleDangerous');
  if (!role)
    role = await guild.roles.create({
      name: UNVERIFIED_NAME,
      permissions: [],
      reason: 'Emika verification',
    });
  let hidden = 0,
    failed = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.isThread?.() || !ch.permissionOverwrites?.edit) continue;
    try {
      if (ch.id === verifyChannel.id)
        await ch.permissionOverwrites.edit(
          role,
          { ViewChannel: true, ReadMessageHistory: true, SendMessages: false },
          { reason: 'Emika verification' },
        );
      else if (!ch.permissionOverwrites.cache?.get?.(role.id)?.deny?.has?.(P.ViewChannel))
        await ch.permissionOverwrites.edit(
          role,
          { ViewChannel: false },
          { reason: 'Emika verification' },
        );
      hidden++;
    } catch {
      failed++;
    }
  }
  return { role, hidden, failed };
}
export function panelPayload(c, guildId) {
  const t = (k) => c.localization.t(guildId, k);
  return lunaPayload(
    {
      content: t('verifyPanel'),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('emika:verify:start')
            .setLabel(t('verifyButton'))
            .setStyle(ButtonStyle.Success),
        ),
      ],
      allowedMentions: { parse: [] },
    },
    { locale: c.localization.locale(guildId) },
  );
}
async function grant(i, cfg, member) {
  const bot = await i.guild.members.fetchMe({ force: true });
  if (bot.id !== i.client.user.id || !bot.permissions?.has(P.ManageRoles))
    throw new UserError('roleBotPermission');
  if (cfg.roleId) {
    const role = await i.guild.roles.fetch(cfg.roleId, { force: true });
    validateVerifiedRole(role, bot, i.guild);
    await member.roles.add(role, 'Emika verification passed');
  }
  if (cfg.unverifiedRoleId && member.roles.cache.has(cfg.unverifiedRoleId))
    await member.roles.remove(cfg.unverifiedRoleId, 'Emika verification passed');
}
export function createVerificationHandler(c) {
  return async (i) => {
    if (!i.isButton?.() || !i.customId.startsWith('emika:verify:')) return false;
    const locale = c.localization.locale(i.guildId),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    const reply = (content, extra = {}) =>
      i.reply(
        lunaPayload(
          { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] }, ...extra },
          { locale },
        ),
      );
    try {
      if (!i.inGuild()) return true;
      const cfg = c.verification.get(i.guildId);
      if (!cfg.enabled) return reply(t('verifyOff'));
      const member = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (member.user.bot) return true;
      if (cfg.roleId && member.roles.cache.has(cfg.roleId)) return reply(t('verifyAlready'));
      if (i.customId === 'emika:verify:start') {
        if (cfg.mode === 'button') {
          await grant(i, cfg, member);
          return reply(t('verifyDone'));
        }
        const ch = c.verification.challenge(i.guildId, i.user.id);
        const row = new ActionRowBuilder().addComponents(
          ch.picks.map(([, emoji], n) =>
            new ButtonBuilder()
              .setCustomId('emika:verify:ans:' + n)
              .setLabel(emoji)
              .setStyle(ButtonStyle.Secondary),
          ),
        );
        return reply(t('verifyChallenge', { item: t('verifyItem_' + ch.target) }), {
          components: [row],
        });
      }
      const m = /^emika:verify:ans:([0-3])$/.exec(i.customId);
      if (!m) return true;
      const result = c.verification.answer(i.guildId, i.user.id, Number(m[1]), cfg.maxAttempts);
      if (result === 'pass') {
        await grant(i, cfg, member);
        return i.update(
          lunaPayload(
            { content: t('verifyDone'), components: [], allowedMentions: { parse: [] } },
            { locale },
          ),
        );
      }
      if (result === 'locked' && cfg.kickOnFail) {
        await i.update(
          lunaPayload(
            { content: t('verifyKicked'), components: [], allowedMentions: { parse: [] } },
            { locale },
          ),
        );
        if (member.kickable) await member.kick('Emika verification failed');
        return true;
      }
      return i.update(
        lunaPayload(
          {
            content: t(result === 'wrong' ? 'verifyWrong' : 'verifyRetry'),
            components: [],
            allowedMentions: { parse: [] },
          },
          { locale },
        ),
      );
    } catch (error) {
      c.logger?.warn?.({ kind: 'verification', error: error.message }, 'Verification step failed');
      try {
        if (!i.replied && !i.deferred) await reply(t('verifyError'));
      } catch {
        /* interaction already gone */
      }
      return true;
    }
  };
}
/** Gives new members the Unverified role while verification is on. */
export function createVerificationJoinHandler(c) {
  return async (member) => {
    try {
      const cfg = c.verification.get(member.guild.id);
      if (!cfg.enabled || !cfg.unverifiedRoleId || member.user?.bot) return;
      const bot = member.guild.members.me ?? (await member.guild.members.fetchMe());
      if (!bot.permissions?.has(P.ManageRoles)) return;
      await member.roles.add(cfg.unverifiedRoleId, 'Emika verification: new member');
    } catch {
      c.logger?.warn?.({ kind: 'verification_join' }, 'Could not add the Unverified role');
    }
  };
}
