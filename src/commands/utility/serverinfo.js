import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Fresh server name/ID and approximate count, no member enumeration.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await i.client.guilds.fetch({ guild: i.guildId, force: true, withCounts: true });
    if (
      !guild ||
      guild.id !== i.guildId ||
      typeof guild.name !== 'string' ||
      !Number.isSafeInteger(guild.approximateMemberCount) ||
      guild.approximateMemberCount < 0
    )
      throw new UserError('memberCountUnavailable');
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'serverInfoCurrent', {
            name: escapeMarkdown(guild.name),
            id: guild.id,
            count: guild.approximateMemberCount,
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
