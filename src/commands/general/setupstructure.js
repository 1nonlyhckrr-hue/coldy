import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { createStructure, STRUCTURE_COUNTS } from '../../services/serverStructure.js';
import { lunaEmbed } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const botPermissions = [
  P.ViewChannel,
  P.ManageChannels,
  P.ManageRoles,
  P.SendMessages,
  P.EmbedLinks,
  P.ReadMessageHistory,
];
function summaryFields(t, result) {
  return [
    {
      name: t('structureCategoriesField'),
      value: t('structureCountValue', {
        created: result.createdCategories.length,
        existing: result.skippedCategories.length,
        total: STRUCTURE_COUNTS.categories,
      }),
      inline: true,
    },
    {
      name: t('structureChannelsField'),
      value: t('structureCountValue', {
        created: result.createdChannels.length,
        existing: result.skippedChannels.length,
        total: STRUCTURE_COUNTS.channels,
      }),
      inline: true,
    },
  ];
}
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('setupstructure')
    .setDescription(
      'Create the Emika Gothic server layout; existing categories and channels are kept.',
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ManageGuild),
  userPermissions: [P.ManageGuild],
  botPermissions,
  cooldownMs: 60000,
  async execute(i, c) {
    const locale = c.localization.locale(i.guildId);
    const t = (key, params) => c.localization.t(i.guildId, key, params);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      !actor.permissions?.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    const bot = i.guild.members.me ?? (await i.guild.members.fetchMe());
    if (!bot.permissions?.has(botPermissions)) throw new UserError('botPermission');
    let result;
    try {
      result = await createStructure(i.guild, bot.id);
    } catch (error) {
      const partial = error.partial;
      if (!partial) throw new UserError('structureFailed');
      await i.editReply({
        embeds: [
          lunaEmbed({
            description: t('structurePartial'),
            fields: summaryFields(t, partial),
            locale,
            kind: 'error',
          }),
        ],
      });
      return;
    }
    const created = result.createdCategories.length + result.createdChannels.length;
    await i.editReply({
      embeds: [
        lunaEmbed({
          description: t(created ? 'structureDone' : 'structureNothingNew'),
          fields: summaryFields(t, result),
          locale,
          kind: 'success',
        }),
      ],
    });
  },
};
