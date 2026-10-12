import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
import { mentionDuration } from '../../services/mentionGuard.js';
export default {
  category: 'automod',
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('mentionguard')
    .setDescription(
      'Owner-only protected-member direct-mention timeout policy; off until explicitly set.',
    )
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription(
          'Enable fourth direct-mention-message timeout in 10 minutes; explicit 1 s-28 d duration.',
        )
        .addUserOption((o) =>
          o.setName('target').setDescription('One protected human guild member').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('duration')
            .setDescription('Integer with s/m/h/d, 1 s-28 d, for example 10 m; no default')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(9),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('off')
        .setDescription('Disable protected-member mention timeouts; existing timeout unchanged.'),
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Private saved policy and last result; not native timeout proof.'),
    ),
  async execute(i, c) {
    if (!c.config.ownerIds.includes(i.user.id)) throw new UserError('ownerOnly');
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language;
    if (sub === 'set') {
      if (c.config.messageEventsEnabled !== true) throw new UserError('mentionGuardEvents');
      const user = i.options.getUser('target', true),
        duration = i.options.getString('duration', true);
      mentionDuration(duration);
      const [member, bot] = await Promise.all([
        i.guild.members.fetch({ user: user.id, force: true }),
        i.guild.members.fetchMe({ force: true }),
      ]);
      if (member?.id !== user.id || member.guild?.id !== i.guildId || member.user?.bot !== false)
        throw new UserError('mentionGuardTarget');
      if (
        bot?.id !== i.client?.user?.id ||
        bot.guild?.id !== i.guildId ||
        !bot.permissions?.has(P.ModerateMembers) ||
        !i.appPermissions?.has(P.ModerateMembers)
      )
        throw new UserError('botPermission');
      if (!c.config.ownerIds.includes(i.user.id) || c.config.messageEventsEnabled !== true)
        throw new UserError('ownerOnly');
      c.mentionGuard.set(i.guildId, user.id, duration);
    } else if (sub === 'off') c.mentionGuard.off(i.guildId);
    else if (sub !== 'status') throw new UserError('unknownCommand');
    const saved = c.mentionGuard.get(i.guildId);
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'mentionGuardStatus', {
            enabled: translate(locale, saved.enabled ? 'enabled' : 'disabled'),
            target: saved.target_id ?? '-',
            duration: saved.duration_ms ?? 0,
            result: translate(locale, 'mentionGuardResult_' + saved.last_result),
          }),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
