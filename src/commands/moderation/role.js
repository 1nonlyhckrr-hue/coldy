import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { editSafeRole } from '../../services/roleEdits.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Confirmed one safe existing role metadata edit,no permissions/assignments.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageRoles);
for (const sub of ['rename', 'color', 'mentionable'])
  data.addSubcommand((s) => {
    s.setName(sub)
      .setDescription(
        'CurrentManageRoles/hierarchy safeexistingrole ' +
          sub +
          ',no assignments/permissionchange.',
      )
      .addRoleOption((o) =>
        o
          .setName('role')
          .setDescription('Existing nonprivileged unmanagedrole below actor/bot')
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm native role metadata change')
          .setRequired(true),
      );
    if (sub === 'mentionable')
      s.addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Allow server members to mention this role')
          .setRequired(true),
      );
    else
      s.addStringOption((o) =>
        o
          .setName(sub === 'color' ? 'hex' : 'name')
          .setDescription(
            sub === 'color'
              ? 'Six hex primaryRGB digits'
              : 'Name1-32characters,no @/controls/edgewhitespace',
          )
          .setMinLength(sub === 'color' ? 6 : 1)
          .setMaxLength(sub === 'color' ? 6 : 32)
          .setRequired(true),
      );
    return s;
  });
export default {
  category: 'moderation',
  data,
  cooldownMs: 5000,
  userPermissions: [P.ManageRoles],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();
    let value;
    if (sub === 'color') {
      const hex = i.options.getString('hex', true);
      if (!/^[a-fA-F0-9]{6}$/.test(hex)) throw new UserError('safeRoleEditInput');
      value = parseInt(hex, 16);
    } else if (sub === 'rename') value = i.options.getString('name', true);
    else if (sub === 'mentionable') value = i.options.getBoolean('enabled', true);
    else throw new UserError('unknownCommand');
    const r = await editSafeRole(i, c, {
      roleId: i.options.getRole('role', true).id,
      action: sub,
      value,
      confirm: i.options.getBoolean('confirm', true),
    });
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(
            i.guildId,
            r.changed ? 'safeRoleEditSaved' : 'safeRoleEditNoop',
          ),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
