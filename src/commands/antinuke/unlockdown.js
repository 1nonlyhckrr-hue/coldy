import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { endLockdown } from '../../services/lockdown.js';
const data = new SlashCommandBuilder()
  .setName('unlockdown')
  .setDescription('End /lockdown and restore the exact previous channel permissions.')
  .setContexts(InteractionContextType.Guild);
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'lockdown');
    const bot = await i.guild.members.fetchMe({ force: true });
    if (!bot.permissions?.has(P.ManageChannels)) throw new UserError('botPermission');
    const out = await endLockdown(i.guild, c.lockdown);
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(
            i.guildId,
            out.failed ? 'unlockdownPartial' : 'unlockdownDone',
            out,
          ),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
