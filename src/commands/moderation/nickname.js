import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { setNickname } from '../../services/nickname.js';
import { lunaPayload } from '../../utils/embeds.js';
export default {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Confirmed one-member nickname update or explicit reset, no bulk changes.')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ManageNicknames)
    .addUserOption((o) =>
      o
        .setName('member')
        .setDescription('One server member, not yourself/owner/bot')
        .setRequired(true),
    )
    .addBooleanOption((o) =>
      o.setName('confirm').setDescription('Confirm nickname update or reset').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('1-32 characters, no @; omit to explicitly reset nickname')
        .setMinLength(1)
        .setMaxLength(32),
    ),
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await setNickname(i, c, {
      targetId: i.options.getUser('member', true).id,
      nickname: i.options.getString('text'),
      confirm: i.options.getBoolean('confirm', true),
    });
    const locale = c.localization.locale(i.guildId),
      text = c.localization.t(i.guildId, result.changed ? 'nicknameChanged' : 'nicknameNoop', {
        id: result.id,
      });
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
