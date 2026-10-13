import { welcomeStyle } from '../services/welcomeAssets.js';
import { lunaPayload } from '../utils/embeds.js';
import { renderGuildTemplate, validateOutputChannel } from '../services/guildConfig.js';
export function createMemberMessageHandler(context, kind) {
  return async (member) => {
    try {
      const settings = context.guildConfig.get(member.guild.id);
      const config = settings.welcome;
      const enabled = kind === 'welcome' ? config.enabled : config.goodbyeEnabled;
      if (!enabled || !config.channelId) return;
      const channel = await validateOutputChannel(member.guild, config.channelId);
      const latest = context.guildConfig.get(member.guild.id);
      const current = latest.welcome;
      if (
        !(kind === 'welcome' ? current.enabled : current.goodbyeEnabled) ||
        current.channelId !== config.channelId
      )
        return;
      const content = renderGuildTemplate(current, kind, member, latest.language);
      // Only the new member may be mentioned, never roles or everyone.
      await channel.send(
        lunaPayload(
          {
            content,
            allowedMentions: {
              parse: [],
              users: kind === 'welcome' && current.mentionMember ? [member.id] : [],
            },
          },
          {
            locale: latest.language,
            ...welcomeStyle(current, kind, member),
          },
        ),
      );
    } catch {
      context.logger.warn({ guildId: member.guild.id }, 'Member message delivery unavailable');
    }
  };
}
