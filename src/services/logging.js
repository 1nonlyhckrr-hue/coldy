import { translate } from './localization.js';
import { lunaPayload } from '../utils/embeds.js';
import { validateOutputChannel } from './guildConfig.js';
export class ServerLogs {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  async emit(guild, entry) {
    try {
      const settings = this.config.get(guild.id);
      const setting = settings.logging;
      if (!setting.enabled || !setting.channelId) return { sent: false, reason: 'disabled' };
      const channel = await validateOutputChannel(guild, setting.channelId);
      const content = translate(settings.language, 'logEntry', {
        kind: entry.kind,
        action: entry.action ?? 'event',
        caseId: entry.caseId ?? '-',
        actorId: entry.actorId ?? '-',
        targetId: entry.targetId ?? '-',
      }).slice(0, 1900);
      await channel.send(
        lunaPayload({ content, allowedMentions: { parse: [] } }, { locale: settings.language }),
      );
      return { sent: true };
    } catch {
      this.logger.warn({ guildId: guild.id }, 'Server log delivery unavailable');
      return { sent: false, reason: 'unavailable' };
    }
  }
}
