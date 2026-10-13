import { UserError } from '../utils/errors.js';
// /steal: the user names a command they saw another bot use. Discord gives bots no way to read
// another bot's command list, so the name comes from the user (or from the other bot's reply
// message, which carries the command name). Emika then either points to the command she already
// has ("wired") or records it in a persistent queue ("queued"). Nothing is ever reported as
// working unless it resolves to a real installed command.
const FEATURE = 'steal';
const QUEUE_GUILD = '*';
const MAX_QUEUE = 300;
// Other bots' common names -> Emika's command path. Targets are checked against the live registry
// at lookup time, so a stale entry just falls through to the queue.
export const ALIASES = Object.freeze({
  mute: 'moderation timeout',
  timeout: 'moderation timeout',
  untimeout: 'moderation untimeout',
  unmute: 'moderation untimeout',
  clear: 'modtools purge',
  purge: 'modtools purge',
  prune: 'modtools purge',
  clean: 'modtools purge',
  lock: 'channeltools lock',
  unlock: 'channeltools unlock',
  whois: 'userinfo',
  'user-info': 'userinfo',
  ui: 'userinfo',
  si: 'serverinfo',
  'server-info': 'serverinfo',
  guildinfo: 'serverinfo',
  pfp: 'avatar',
  av: 'avatar',
  icon: 'servericon',
  members: 'membercount',
  mc: 'membercount',
  ri: 'roleinfo',
  p: 'music play',
  play: 'music play',
  skip: 'music skip',
  stop: 'music stop',
  queue: 'music queue',
  shuffle: 'music shuffle',
  pause: 'music pause',
  resume: 'music resume',
});
export function normalizeStealName(input) {
  if (typeof input !== 'string') throw new UserError('stealInvalid');
  const name = input
    .trim()
    .replace(/^[/&!,.?$%+\-]+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!name || name.length > 60 || !/^[\p{L}\p{N}_-]+( [\p{L}\p{N}_-]+){0,2}$/u.test(name))
    throw new UserError('stealInvalid');
  return name;
}
/** Every runnable path: "ban", "music play", "x group sub". */
export function commandPaths(commands) {
  const paths = [];
  for (const command of commands.values()) {
    const d = command.data.toJSON();
    const subs = (d.options ?? []).filter((o) => o.type === 1 || o.type === 2);
    if (!subs.length) paths.push(d.name);
    for (const s of subs) {
      if (s.type === 2)
        for (const t of s.options ?? []) paths.push(`${d.name} ${s.name} ${t.name}`);
      else paths.push(`${d.name} ${s.name}`);
    }
  }
  return paths;
}
/** @returns {{status:'wired',path:string,via:'exact'|'alias'|'unique-subcommand'}|{status:'queued'}} */
export function resolveSteal(commands, input) {
  const name = normalizeStealName(input),
    paths = commandPaths(commands),
    set = new Set(paths);
  if (set.has(name)) return { status: 'wired', name, path: name, via: 'exact' };
  const alias = ALIASES[name];
  if (alias && set.has(alias)) return { status: 'wired', name, path: alias, via: 'alias' };
  if (alias && commands.has(alias)) return { status: 'wired', name, path: alias, via: 'alias' };
  if (commands.has(name.split(' ')[0]) && !name.includes(' '))
    return { status: 'wired', name, path: name, via: 'exact' };
  if (!name.includes(' ')) {
    const tails = paths.filter((p) => p.includes(' ') && p.split(' ').at(-1) === name);
    if (tails.length === 1)
      return { status: 'wired', name, path: tails[0], via: 'unique-subcommand' };
  }
  return { status: 'queued', name };
}
export class StealQueue {
  constructor(features, now = () => Date.now()) {
    this.features = features;
    this.now = now;
  }
  /** Adds or updates a queue entry. Same name from more requesters just bumps the count. */
  add(name, { userId, guildId, botName = null }) {
    const prior = this.features.get(QUEUE_GUILD, FEATURE, name);
    if (!prior && this.features.count(QUEUE_GUILD, FEATURE) >= MAX_QUEUE)
      throw new UserError('stealQueueFull');
    const requesters = new Set(prior?.requesters ?? []),
      guilds = new Set(prior?.guilds ?? []),
      bots = new Set(prior?.bots ?? []);
    requesters.add(userId);
    guilds.add(guildId);
    if (botName) bots.add(botName.slice(0, 40));
    const entry = {
      name,
      count: (prior?.count ?? 0) + 1,
      requesters: [...requesters].slice(-20),
      guilds: [...guilds].slice(-20),
      bots: [...bots].slice(-10),
      firstAt: prior?.firstAt ?? this.now(),
      lastAt: this.now(),
    };
    this.features.set(QUEUE_GUILD, FEATURE, name, entry);
    return { entry, alreadyQueued: !!prior };
  }
  list() {
    return this.features
      .list(QUEUE_GUILD, FEATURE, '', MAX_QUEUE)
      .map((r) => r.value)
      .sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);
  }
  remove(name) {
    return this.features.del(QUEUE_GUILD, FEATURE, name);
  }
}
/** Shared by the slash command and the &steal prefix alias. Returns the localized reply text. */
export function runSteal(context, t, { input, userId, guildId, botName }) {
  const result = resolveSteal(context.commands, input);
  if (result.status === 'wired')
    return {
      status: 'wired',
      text: t('stealWired', { name: result.name, path: result.path }),
    };
  const { alreadyQueued } = context.steal.add(result.name, { userId, guildId, botName });
  return {
    status: 'queued',
    text: t(alreadyQueued ? 'stealQueuedAgain' : 'stealQueued', { name: result.name }),
  };
}
export function formatQueue(queue, t) {
  if (!queue.length) return t('stealQueueEmpty');
  return queue
    .slice(0, 40)
    .map(
      (e, i) => `${i + 1}. ${e.name} (x${e.count}${e.bots.length ? `, ${e.bots.join('/')}` : ''})`,
    )
    .join('\n');
}
/** Command name from a bot's slash-command reply message, when Discord attached it. */
export function commandNameFromMessage(message) {
  const name = message?.interactionMetadata?.commandName ?? message?.interaction?.commandName;
  return typeof name === 'string' && name ? name : null;
}
export function createStealPrefixHandler(context) {
  return async (message) => {
    if (message.author?.bot || !message.guildId || typeof message.content !== 'string')
      return false;
    const m = /^&(steal|stealqueue)(?:\s+([\s\S]*))?$/i.exec(message.content.trim());
    if (!m) return false;
    const locale = context.localization.locale(message.guildId),
      t = (k, p) => context.localization.t(message.guildId, k, p),
      reply = (content) =>
        message.reply({ content: content.slice(0, 1900), allowedMentions: { parse: [] } });
    try {
      const rest = (m[2] ?? '').trim();
      if (m[1].toLowerCase() === 'stealqueue') {
        if (!context.config.ownerIds.includes(message.author.id)) throw new UserError('ownerOnly');
        await reply(formatQueue(context.steal.list(), t));
        return true;
      }
      const cooldown = context.cooldowns.acquire(
        `${message.guildId}:${message.author.id}:&steal`,
        3000,
      );
      if (cooldown) throw new UserError('commandCooldown', { seconds: Math.ceil(cooldown / 1000) });
      let input = rest,
        botName = null;
      if (!input && message.reference?.messageId) {
        const ref = await message.fetchReference().catch(() => null);
        if (ref?.author?.bot) {
          input = commandNameFromMessage(ref) ?? '';
          botName = ref.author.username ?? null;
        }
      }
      if (!input) throw new UserError('stealInvalid');
      const out = runSteal(context, t, {
        input,
        userId: message.author.id,
        guildId: message.guildId,
        botName,
      });
      await reply(out.text);
    } catch (error) {
      if (!(error instanceof UserError)) {
        context.logger.warn({ guildId: message.guildId }, 'Steal prefix command failed');
        return true;
      }
      await reply(context.localization.t(message.guildId, error.key, error.parameters)).catch(
        () => {},
      );
    }
    void locale;
    return true;
  };
}
