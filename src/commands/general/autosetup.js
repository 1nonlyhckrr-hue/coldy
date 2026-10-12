import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { runAutoSetup } from '../../services/autoSetup.js';
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
function describe(t, result) {
  if (result.status === 'saved')
    return result.detail ? t('autoSavedRoles', result.detail) : t('autoStatusSaved');
  if (result.status === 'info') return t('autoNeedsInput');
  if (result.status === 'dormant') return t('autoStatusDormant', { flag: result.flag });
  if (result.status === 'skipped') return t('autoReason_' + result.reason);
  return t('autoStatusFailed');
}
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('autosetup')
    .setDescription(
      'Save a default Emika setup for the layout from /setupstructure; safe to rerun.',
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('language')
        .setDescription('Server language, default Hinglish')
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'Hindi', value: 'hi' },
          { name: 'Hinglish', value: 'hinglish' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('roles')
        .setDescription('Create Owner, Mod and Member roles (default) or use roles you choose')
        .addChoices(
          { name: 'Create or reuse Owner, Mod and Member', value: 'create' },
          { name: 'Use the roles I choose below', value: 'existing' },
        ),
    )
    .addRoleOption((o) => o.setName('mod-role').setDescription('Mod and ticket support role'))
    .addRoleOption((o) => o.setName('member-role').setDescription('Role given to new members')),
  userPermissions: [P.ManageGuild],
  botPermissions,
  cooldownMs: 60000,
  async execute(i, c) {
    const locale = c.localization.locale(i.guildId);
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
    const results = await runAutoSetup({
      guild: i.guild,
      context: c,
      actorId: i.user.id,
      bot,
      options: {
        interaction: i,
        language: i.options.getString('language') ?? undefined,
        roles: i.options.getString('roles') ?? undefined,
        modRole: i.options.getRole('mod-role') ?? undefined,
        memberRole: i.options.getRole('member-role') ?? undefined,
      },
    });
    // Language may have just changed, so label the summary in the new language.
    const t = (key, params) => c.localization.t(i.guildId, key, params);
    const failed = results.some((r) => r.status === 'failed');
    await i.editReply({
      embeds: [
        lunaEmbed({
          description: t(failed ? 'autoPartial' : 'autoDone'),
          fields: results.map((r) => ({
            name: t('autoStep_' + r.key),
            value: describe(t, r),
            inline: false,
          })),
          locale: c.localization.locale(i.guildId) ?? locale,
          kind: failed ? 'error' : 'success',
        }),
      ],
    });
  },
};
