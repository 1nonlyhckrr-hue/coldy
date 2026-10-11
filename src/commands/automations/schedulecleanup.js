import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('schedulecleanup')
  .setDescription('Scoped stored schedule cleanup,no native message deletion.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const action of ['cancel', 'stoprepeats', 'erasefinished'])
  data.addSubcommand((s) =>
    s
      .setName(action)
      .setDescription(
        action === 'cancel'
          ? 'Cancel pending schedules in one stored destination;unknown/in-flight left alone.'
          : action === 'stoprepeats'
            ? 'Make pending repeats in one stored destination one-time;next sends still happen.'
            : 'Erase done/cancelled text in one stored destination;pending/unknown/in-flight kept.',
      )
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact stored destination ID,departed channels allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stored schedule changes in this exact destination')
          .setRequired(true),
      ),
  );
export default {
  category: 'automations',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions?.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    if (i.options.getBoolean('confirm', true) !== true)
      throw new UserError('automationBulkConfirm');
    const count = c.messageSchedules.scopedPending(
      i.guildId,
      i.options.getString('channel-id', true),
      i.options.getSubcommand(),
    );
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, 'automationScopedCleanup', { count }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
