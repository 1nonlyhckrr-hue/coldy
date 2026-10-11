import { PermissionFlagsBits as P } from 'discord.js';
import { lunaPayload } from '../utils/embeds.js';
function recentMessage(message, now) {
  let clock;
  try {
    clock = now();
  } catch {
    return false;
  }
  return (
    Number.isSafeInteger(clock) &&
    clock >= 0 &&
    Number.isFinite(message.createdTimestamp) &&
    Math.abs(clock - message.createdTimestamp) <= 300000
  );
}
export function createAutoresponderHandler(context, now = Date.now) {
  return async (message) => {
    if (
      context.config.messageEventsEnabled !== true ||
      !message.guild ||
      !message.author ||
      message.author.bot !== false ||
      message.webhookId ||
      message.system ||
      !message.content ||
      message.content.length > 4000
    )
      return;
    // Edits are not handled. Very old messages/replayed events are not eligible.
    if (!recentMessage(message, now)) return;
    let reserved = false;
    try {
      // Read-only preflight avoids native calls for unmatched/cooldown/replayed messages.
      // The transactional claim rechecks current records after asynchronous native validation.
      if (!context.autoresponders.eligible(message.guild.id, message.id, message.content)) return;
      const [me, channel] = await Promise.all([
        message.guild.members.fetchMe({ force: true }),
        message.guild.channels.fetch(message.channel.id, { force: true }),
      ]);
      if (
        context.config.messageEventsEnabled !== true ||
        !recentMessage(message, now) ||
        message.author?.bot !== false ||
        message.system ||
        message.webhookId ||
        !me ||
        me.id !== message.client.user.id ||
        me.guild?.id !== message.guild.id ||
        !channel ||
        channel.id !== message.channel.id ||
        channel.guildId !== message.guild.id ||
        !channel.isTextBased() ||
        !channel
          .permissionsFor(me)
          ?.has([
            P.ViewChannel,
            channel.isThread() ? P.SendMessagesInThreads : P.SendMessages,
            P.EmbedLinks,
          ])
      )
        return;
      const rule = context.autoresponders.claim(message.guild.id, message.id, message.content);
      if (!rule) return;
      reserved = true;
      const locale = context.guildConfig.get(message.guild.id).language;
      const sent = await channel.send(
        lunaPayload(
          { content: rule.response, allowedMentions: { parse: [], repliedUser: false } },
          { locale },
        ),
      );
      if (typeof sent?.id !== 'string' || !sent.id.trim())
        throw new Error('Missing accepted responder message identity');
      context.autoresponders.finish(message.id, 'sent');
    } catch {
      if (reserved) {
        try {
          context.autoresponders.finish(message.id, 'uncertain');
        } catch {}
      }
      context.logger.warn(
        { guildId: message.guild.id },
        'Autoresponder delivery unavailable; no automatic retry',
      );
    }
  };
}
