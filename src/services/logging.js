import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
export class ServerLogs {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  async emit(guild, entry, beforeSend) {
    try {
      const settings = this.config.get(guild.id);
      const setting = settings.logging;
      if (!setting.enabled || !setting.channelId) return { sent: false, reason: 'disabled' };
      const channel = await validateOutputChannel(guild, setting.channelId);
      if (beforeSend) await beforeSend();
      const latest = this.config.get(guild.id);
      if (!latest.logging.enabled || latest.logging.channelId !== setting.channelId)
        return { sent: false, reason: 'changed' };
      const content = translate(latest.language, 'logEntry', {
        kind: entry.kind,
        action: entry.action ?? 'event',
        caseId: entry.caseId ?? '-',
        actorId: entry.actorId ?? '-',
        targetId: entry.targetId ?? '-',
      }).slice(0, 1900);
      const message = await channel.send(
        lunaPayload({ content, allowedMentions: { parse: [] } }, { locale: latest.language }),
      );
      if (typeof message?.id !== 'string' || !message.id)
        throw new Error('Missing accepted log message identity');
      return { sent: true, messageId: message.id };
    } catch {
      this.logger.warn({ guildId: guild.id }, 'Server log delivery unavailable');
      return { sent: false, reason: 'unavailable' };
    }
  }
}
