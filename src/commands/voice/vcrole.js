import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { autoroleManager } from '../../services/autorole.js';
import { validateSelfRole } from '../../services/rolePanels.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
export default {
  category: 'voice',
  data: new SlashCommandBuilder()
    .setName('vcrole')
    .setDescription(
      'Future voice-event safe role policy; only Emika-owned grants cleaned on disconnect.',
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ManageGuild | P.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription(
          'Configure one safe role for future human voice joins; existing memberships untouched.',
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('Safe role below actor/bot').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription(
          'Disable future grants; existing Emika-owned grants retain future-disconnect cleanup.',
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('show')
        .setDescription(
          'Private saved policy and retained grant counts, not native voice/membership proof.',
        ),
    ),
  async execute(i, c) {
    let actor = await autoroleManager(i, c);
    const sub = i.options.getSubcommand();
    if (sub === 'add') {
      if (c.config.voiceEventsEnabled !== true) throw new UserError('voiceRuntimeDisabled');
      const id = i.options.getRole('role', true).id,
        [role, bot] = await Promise.all([
          i.guild.roles.fetch(id, { force: true }),
          i.guild.members.fetchMe({ force: true }),
        ]);
      actor = await autoroleManager(i, c);
      if (
        role?.id !== id ||
        bot?.id !== i.client?.user?.id ||
        bot.guild?.id !== i.guildId ||
        !i.appPermissions?.has(P.ManageRoles)
      )
        throw new UserError('botPermission');
      validateSelfRole(role, bot, actor, i.guild);
      if (c.config.voiceEventsEnabled !== true) throw new UserError('voiceRuntimeDisabled');
      c.voiceRoles.set(i.guildId, id, actor.id);
    } else if (sub === 'remove') c.voiceRoles.remove(i.guildId);
    else if (sub !== 'show') throw new UserError('unknownCommand');
    const policy = c.voiceRoles.get(i.guildId),
      locale = c.guildConfig.get(i.guildId).language,
      result = { roleId: policy?.role_id ?? null, grants: c.voiceRoles.summary(i.guildId) };
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'vcroleStatus'),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
              name: 'emika-vcrole-policy.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
