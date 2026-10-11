import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { setSlowmode } from '../../services/slowmode.js';
import { lunaPayload } from '../../utils/embeds.js';
export default {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Confirmed single text-channel slowmode,0 disables,no bulk changes.')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ManageChannels)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('One server text channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('0 disables,maximum21600 seconds')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm this explicit channel setting change')
        .setRequired(true),
    ),
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await setSlowmode(i, c, {
      channelId: i.options.getChannel('channel', true).id,
      seconds: i.options.getInteger('seconds', true),
      confirm: i.options.getBoolean('confirm', true),
    });
    const locale = c.localization.locale(i.guildId),
      text = c.localization.t(i.guildId, r.changed ? 'slowmodeChanged' : 'slowmodeNoop', {
        seconds: i.options.getInteger('seconds', true),
        id: r.id,
      });
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
