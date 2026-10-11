import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Fresh approximate server member/presence counts,no member enumeration.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await i.client.guilds.fetch({ guild: i.guildId, force: true, withCounts: true });
    if (
      !guild ||
      guild.id !== i.guildId ||
      !Number.isSafeInteger(guild.approximateMemberCount) ||
      guild.approximateMemberCount < 0 ||
      !Number.isSafeInteger(guild.approximatePresenceCount) ||
      guild.approximatePresenceCount < 0 ||
      guild.approximatePresenceCount > guild.approximateMemberCount
    )
      throw new UserError('memberCountUnavailable');
    const locale = c.localization.locale(i.guildId),
      text = c.localization.t(i.guildId, 'memberCountValue', {
        members: guild.approximateMemberCount,
        presences: guild.approximatePresenceCount,
      });
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
