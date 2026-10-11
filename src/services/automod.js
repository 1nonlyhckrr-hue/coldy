import { z } from 'zod';
import { PermissionFlagsBits as P } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { matchesTrigger, normalizeTrigger } from './autoresponder.js';
const schema = z
  .object({
    enabled: z.boolean().default(false),
    action: z.enum(['warn', 'delete', 'timeout']).default('warn'),
    timeoutMinutes: z.number().int().min(1).max(60).default(5),
    rules: z
      .object({
        words: z.boolean().default(false),
        invites: z.boolean().default(false),
        links: z.boolean().default(false),
        mentions: z.boolean().default(false),
        caps: z.boolean().default(false),
        spam: z.boolean().default(false),
      })
      .strict()
      .default({}),
    mentionLimit: z.number().int().min(2).max(20).default(5),
    capsPercent: z.number().int().min(50).max(100).default(80),
    capsMinLetters: z.number().int().min(10).max(100).default(20),
    spamMessages: z.number().int().min(3).max(10).default(6),
    spamRepeats: z.number().int().min(2).max(10).default(3),
    spamWindowSeconds: z.number().int().min(5).max(30).default(10),
    words: z.array(z.string().min(1).max(50)).max(100).default([]),
    ignoredChannels: z
      .array(z.string().regex(/^\d{17,20}$/))
      .max(20)
      .default([]),
    exemptRoles: z
      .array(z.string().regex(/^\d{17,20}$/))
      .max(20)
      .default([]),
  })
  .strict();
export class AutoMod {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
    this.recent = new Map();
  }
  get(guildId) {
    const r = this.db
      .prepare('SELECT settings_json FROM automod_settings WHERE guild_id=?')
      .get(guildId);
    return schema.parse(r ? JSON.parse(r.settings_json) : {});
  }
  patch(guildId, changes) {
    return this.db.transaction(() => {
      const current = this.get(guildId),
        updated = schema.parse({
          ...current,
          ...changes,
          rules: { ...current.rules, ...changes.rules },
        });
      this.db
        .prepare(
          'INSERT INTO automod_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
        )
        .run(guildId, JSON.stringify(updated));
      return updated;
    })();
  }
  clearWords(guildId) {
    return this.db.transaction(() => {
      const count = this.get(guildId).words.length;
      this.patch(guildId, { words: [] });
      return count;
    })();
  }
  resetPolicy(guildId) {
    const defaults = schema.parse({});
    this.db
      .prepare(
        'INSERT INTO automod_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(defaults));
    for (const key of this.recent.keys())
      if (key.startsWith(guildId + ':')) this.recent.delete(key);
    return defaults;
  }
  importPolicy(guildId, text) {
    let policy;
    try {
      if (typeof text !== 'string' || text.length > 4000) throw Error('bounds');
      const value = JSON.parse(text);
      if (value === null || Array.isArray(value) || typeof value !== 'object')
        throw Error('object');
      policy = schema.parse(value);
      policy.enabled = false;
      policy.words = policy.words.map((w) => normalizeTrigger(w));
      if (
        policy.words.some((w) => !w || w.length > 50 || /[\u0000-\u001f\u007f]/u.test(w)) ||
        new Set(policy.words).size !== policy.words.length ||
        new Set(policy.ignoredChannels).size !== policy.ignoredChannels.length ||
        new Set(policy.exemptRoles).size !== policy.exemptRoles.length
      )
        throw Error('duplicate/invalid');
    } catch {
      throw new UserError('automodImportInvalid');
    }
    this.db
      .prepare(
        'INSERT INTO automod_settings VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json',
      )
      .run(guildId, JSON.stringify(policy));
    for (const key of this.recent.keys())
      if (key.startsWith(guildId + ':')) this.recent.delete(key);
    return policy;
  }
  clearScope(guildId, kind) {
    if (!['ignoredChannels', 'exemptRoles'].includes(kind))
      throw new UserError('automodPolicyKindInvalid');
    return this.db.transaction(() => {
      const count = this.get(guildId)[kind].length;
      this.patch(guildId, { [kind]: [] });
      return count;
    })();
  }
  word(guildId, value, add) {
    if (typeof add !== 'boolean') throw new TypeError('Invalid word mode');
    if (typeof value !== 'string' || value.length > 50) throw new UserError('automodWordInvalid');
    const word = normalizeTrigger(value);
    if (!word || word.length > 50 || /[\u0000-\u001f\u007f]/u.test(word))
      throw new UserError('automodWordInvalid');
    return this.db.transaction(() => {
      const s = this.get(guildId),
        words = new Set(s.words);
      if (add) words.add(word);
      else words.delete(word);
      return this.patch(guildId, { words: [...words] });
    })();
  }
  ignoreChannel(guildId, channelId, add) {
    if (typeof add !== 'boolean') throw new TypeError('Invalid ignore mode');
    return this.db.transaction(() => {
      const channels = new Set(this.get(guildId).ignoredChannels);
      if (add) channels.add(channelId);
      else channels.delete(channelId);
      return this.patch(guildId, { ignoredChannels: [...channels] });
    })();
  }
  exempt(guildId, roleId, add) {
    if (typeof add !== 'boolean') throw new TypeError('Invalid exemption mode');
    return this.db.transaction(() => {
      const s = this.get(guildId),
        roles = new Set(s.exemptRoles);
      if (add) roles.add(roleId);
      else roles.delete(roleId);
      return this.patch(guildId, { exemptRoles: [...roles] });
    })();
  }
  detect(message, settings) {
    const text = message.content ?? '';
    if (settings.rules.words && settings.words.some((w) => matchesTrigger(text, w, 'keyword')))
      return 'words';
    if (
      settings.rules.invites &&
      /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/iu.test(text)
    )
      return 'invites';
    if (settings.rules.links && /https?:\/\/[^\s]+/iu.test(text)) return 'links';
    const mentions =
      (message.mentions?.users?.size ?? 0) +
      (message.mentions?.roles?.size ?? 0) +
      (message.mentions?.everyone ? settings.mentionLimit : 0);
    if (settings.rules.mentions && mentions >= settings.mentionLimit) return 'mentions';
    const letters = [...text].filter((c) => /\p{L}/u.test(c)),
      uppercase = letters.filter((c) => c.toUpperCase() === c && c.toLowerCase() !== c);
    if (
      settings.rules.caps &&
      letters.length >= settings.capsMinLetters &&
      uppercase.length / letters.length > settings.capsPercent / 100
    )
      return 'caps';
    if (settings.rules.spam) {
      const now = this.now();
      if (!Number.isSafeInteger(now) || now < 0) return null;
      const key = `${message.guild.id}:${message.author.id}`,
        history = (this.recent.get(key) ?? []).filter(
          (x) =>
            Number.isSafeInteger(x.at) &&
            x.at >= 0 &&
            now >= x.at &&
            now - x.at < settings.spamWindowSeconds * 1000,
        );
      if (!history.some((x) => x.id === message.id))
        history.push({ id: message.id, at: now, text: normalizeTrigger(text) });
      if (this.recent.size >= 10000 && !this.recent.has(key))
        this.recent.delete(this.recent.keys().next().value);
      this.recent.set(key, history.slice(-10));
      if (
        history.length >= settings.spamMessages ||
        history.filter((x) => x.text === normalizeTrigger(text)).length >= settings.spamRepeats
      )
        return 'spam';
    }
    return null;
  }
  reserve(message, rule, action) {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid automod clock');
    if (
      !['words', 'invites', 'links', 'mentions', 'caps', 'spam'].includes(rule) ||
      !['warn', 'delete', 'timeout'].includes(action)
    )
      throw new TypeError('Invalid automod reservation');
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO automod_incidents VALUES(?,?,?,?,?,'reserved',?)")
        .run(message.id, message.guild.id, message.author.id, rule, action, now).changes === 1
    );
  }
  finish(messageId, status) {
    if (!['completed', 'uncertain', 'failed'].includes(status))
      throw new Error('Invalid automod outcome');
    const result = this.db
      .prepare("UPDATE automod_incidents SET status=? WHERE message_id=? AND status='reserved'")
      .run(status, messageId);
    if (result.changes !== 1) throw new Error('AutoMod incident not reserved');
  }
  stats(guildId) {
    return this.db
      .prepare(
        'SELECT status,action,rule,count(*) AS count FROM automod_incidents WHERE guild_id=? GROUP BY status,action,rule ORDER BY status,action,rule',
      )
      .all(guildId);
  }
  incidents(guildId, status = null) {
    if (status !== null && !['reserved', 'completed', 'uncertain', 'failed'].includes(status))
      throw new UserError('automodIncidentStatusInvalid');
    return this.db
      .prepare(
        'SELECT message_id,user_id,rule,action,status,created_at FROM automod_incidents WHERE guild_id=? AND (? IS NULL OR status=?) ORDER BY created_at DESC,message_id DESC LIMIT 20',
      )
      .all(guildId, status, status);
  }
  unresolved(guildId, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 10)
      throw new UserError('automodIncidentPageInvalid');
    return this.db
      .prepare(
        "SELECT message_id,user_id,rule,action,status,created_at FROM automod_incidents WHERE guild_id=? AND status IN ('reserved','uncertain') ORDER BY created_at,message_id LIMIT 10 OFFSET ?",
      )
      .all(guildId, (page - 1) * 10);
  }
  recover() {
    this.db
      .prepare("UPDATE automod_incidents SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup() {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('Invalid automod clock');
    this.db.prepare('DELETE FROM automod_incidents WHERE created_at<?').run(now - 30 * 86400000);
    for (const [k, h] of this.recent)
      if (!h.some((v) => now >= v.at && now - v.at < 30000)) this.recent.delete(k);
  }
}
function outranks(bot, target) {
  const comparison = bot.roles?.highest?.comparePositionTo(target.roles?.highest);
  return Number.isSafeInteger(comparison) && comparison > 0;
}
function isRecentMessage(message) {
  return (
    Number.isFinite(message.createdTimestamp) &&
    Math.abs(Date.now() - message.createdTimestamp) <= 300000
  );
}
export function createAutoModHandler(c) {
  return async (message) => {
    if (
      c.config.messageEventsEnabled !== true ||
      !message.guild ||
      !message.author ||
      message.author.bot !== false ||
      message.webhookId ||
      message.system ||
      !message.content ||
      message.content.length > 4000
    )
      return false;
    if (!isRecentMessage(message)) return false;
    let reserved = false;
    try {
      const settings = c.automod.get(message.guild.id);
      if (!settings.enabled || settings.ignoredChannels.includes(message.channel.id)) return false;
      const member = await message.guild.members.fetch({ user: message.author.id, force: true });
      if (!member || member.id !== message.author.id || member.guild?.id !== message.guild.id)
        return true;
      const current = c.automod.get(message.guild.id);
      if (
        c.config.messageEventsEnabled !== true ||
        !isRecentMessage(message) ||
        message.author?.bot !== false ||
        message.system ||
        message.webhookId ||
        !current.enabled ||
        current.ignoredChannels.includes(message.channel.id)
      )
        return false;
      if (JSON.stringify(current) !== JSON.stringify(settings)) return false;
      // Server managers/moderators and configured staff roles are always exempt.
      if (
        member.id === message.guild.ownerId ||
        member.permissions.has(P.ManageGuild) ||
        member.permissions.has(P.ManageMessages) ||
        member.permissions.has(P.ModerateMembers) ||
        settings.exemptRoles.some((r) => member.roles.cache.has(r))
      )
        return false;
      const rule = c.automod.detect(message, settings);
      if (!rule) return false;
      reserved = c.automod.reserve(message, rule, settings.action);
      if (!reserved) return true;
      if (settings.action === 'warn') {
        c.cases.warn({
          guildId: message.guild.id,
          targetId: message.author.id,
          actorId: message.client.user.id,
          action: 'automod:' + rule,
          reason: 'Luna AutoMod: ' + rule,
          interactionId: 'automod:' + message.id,
        });
      } else if (settings.action === 'timeout') {
        const [bot, target] = await Promise.all([
          message.guild.members.fetchMe({ force: true }),
          message.guild.members.fetch({ user: message.author.id, force: true }),
        ]);
        if (
          bot?.id !== message.client.user.id ||
          bot.guild?.id !== message.guild.id ||
          !bot.permissions.has(P.ModerateMembers) ||
          !target ||
          target.id !== message.author.id ||
          target.guild?.id !== message.guild.id ||
          target.id === message.guild.ownerId ||
          target.user?.bot !== false ||
          target.permissions.has(P.Administrator) ||
          target.permissions.has(P.ManageGuild) ||
          target.permissions.has(P.ManageMessages) ||
          target.permissions.has(P.ModerateMembers) ||
          settings.exemptRoles.some((r) => target.roles.cache.has(r)) ||
          target.moderatable !== true ||
          !outranks(bot, target)
        ) {
          c.automod.finish(message.id, 'failed');
          return true;
        }
        const latest = c.automod.get(message.guild.id);
        if (
          c.config.messageEventsEnabled !== true ||
          !isRecentMessage(message) ||
          message.author?.bot !== false ||
          message.system ||
          message.webhookId ||
          !latest.enabled ||
          latest.ignoredChannels.includes(message.channel.id) ||
          latest.action !== 'timeout' ||
          latest.timeoutMinutes !== settings.timeoutMinutes ||
          JSON.stringify(latest) !== JSON.stringify(settings) ||
          JSON.stringify(latest.rules) !== JSON.stringify(settings.rules) ||
          JSON.stringify(latest.exemptRoles) !== JSON.stringify(settings.exemptRoles) ||
          JSON.stringify(latest.words) !== JSON.stringify(settings.words)
        ) {
          c.automod.finish(message.id, 'failed');
          return true;
        }
        const existingUntil = target.communicationDisabledUntilTimestamp;
        if (existingUntil !== null && (!Number.isSafeInteger(existingUntil) || existingUntil < 0)) {
          c.automod.finish(message.id, 'failed');
          return true;
        }
        const until = Date.now() + settings.timeoutMinutes * 60000;
        if (existingUntil !== null && existingUntil >= until) {
          c.automod.finish(message.id, 'completed');
          return true;
        }
        await target.disableCommunicationUntil(until, 'Luna AutoMod: ' + rule);
      } else {
        const bot = await message.guild.members.fetchMe({ force: true });
        if (
          bot?.id !== message.client.user.id ||
          bot.guild?.id !== message.guild.id ||
          !message.channel.permissionsFor(bot)?.has(P.ManageMessages)
        ) {
          c.automod.finish(message.id, 'failed');
          return true;
        }
        const latest = c.automod.get(message.guild.id);
        if (
          c.config.messageEventsEnabled !== true ||
          !isRecentMessage(message) ||
          message.author?.bot !== false ||
          message.system ||
          message.webhookId ||
          JSON.stringify(latest) !== JSON.stringify(settings)
        ) {
          c.automod.finish(message.id, 'failed');
          return true;
        }
        await message.delete();
      }
      c.automod.finish(message.id, 'completed');
      if (c.serverLogs)
        await c.serverLogs.emit(message.guild, {
          kind: 'automod',
          action: rule,
          actorId: message.client.user.id,
          targetId: message.author.id,
        });
      return true;
    } catch {
      if (reserved) {
        try {
          c.automod.finish(message.id, 'uncertain');
        } catch {}
      }
      c.logger.warn(
        { guildId: message.guild.id },
        'AutoMod evaluation/action unavailable; no automatic retry',
      );
      return true;
    }
  };
}
