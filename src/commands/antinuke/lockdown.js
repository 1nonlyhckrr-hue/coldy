import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { startLockdown } from '../../services/lockdown.js';
const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription(
    'Panic mode: stop @everyone from sending messages or joining voice. Undo: /unlockdown.',
  )
  .setContexts(InteractionContextType.Guild)

  .addBooleanOption((o) =>
    o.setName('confirm').setDescription('Confirm locking every channel').setRequired(true),
  );
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'lockdown');
    if (i.options.getBoolean('confirm', true) !== true) throw new UserError('lockdownConfirm');
    const bot = await i.guild.members.fetchMe({ force: true });
    if (!bot.permissions?.has(P.ManageChannels)) throw new UserError('botPermission');
    const out = await startLockdown(i.guild, c.lockdown);
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'lockdownDone', out),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
