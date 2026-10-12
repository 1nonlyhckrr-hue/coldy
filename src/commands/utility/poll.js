import {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { publishPoll } from '../../services/polls.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Manage Server: publish a native Discord poll with 2-10 answers.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addChannelOption((o) =>
    o
      .setName('channel')
      .setDescription('Poll destination')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('question')
      .setDescription('Poll question')
      .setMaxLength(300)
      .setMinLength(1)
      .setRequired(true),
  );
for (let n = 1; n <= 10; n++)
  data.addStringOption((o) =>
    o
      .setName(`answer-${n}`)
      .setDescription(`Answer ${n}`)
      .setMinLength(1)
      .setMaxLength(55)
      .setRequired(n <= 2),
  );
data
  .addIntegerOption((o) =>
    o
      .setName('hours')
      .setDescription('Duration 1-768 hours, default 24')
      .setMinValue(1)
      .setMaxValue(768),
  )
  .addBooleanOption((o) =>
    o.setName('multiple').setDescription('Allow multiple answers, default false'),
  );
export default {
  category: 'utility',
  data,
  cooldownMs: 10000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const answers = [];
    for (let n = 1; n <= 10; n++) {
      const a = i.options.getString(`answer-${n}`, n <= 2);
      if (a !== null && a !== undefined) answers.push(a);
    }
    const r = await publishPoll(i, c, {
      channelId: i.options.getChannel('channel', true).id,
      question: i.options.getString('question', true),
      answers,
      duration: i.options.getInteger('hours') ?? 24,
      multiple: i.options.getBoolean('multiple') ?? false,
    });
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'pollCreated', {
            id: r.id,
            message: r.messageId,
            channel: r.channelId,
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
