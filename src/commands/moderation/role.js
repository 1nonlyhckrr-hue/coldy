import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { assignSafeRole, createSafeRole } from '../../services/roleAssignments.js';
import { editSafeRole } from '../../services/roleEdits.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription(
    'Confirmed safe role metadata, zero-permission creation and single-human assignment.',
  )
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
          .setDescription('Existing non privileged un managed role below actor/bot')
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
              ? 'Six hex primary RGB digits'
              : 'Name 1-32 characters, no @/controls/edge whitespace',
          )
          .setMinLength(sub === 'color' ? 6 : 1)
          .setMaxLength(sub === 'color' ? 6 : 32)
          .setRequired(true),
      );
    return s;
  });
for (const sub of ['add', 'remove', 'create'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      sub === 'create'
        ? 'Confirmed unassigned zero-permission role create, no member assignment.'
        : 'Confirmed onehuman safe role ' + sub + ',no managed/panel/autorole/selfcreated roles.',
    );
    if (sub === 'create')
      s.addStringOption((o) =>
        o
          .setName('name')
          .setDescription('1-32 characters, no @/controls/edge whitespace')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(32),
      );
    else {
      s.addUserOption((o) =>
        o
          .setName('member')
          .setDescription('One human guild member below actor/bot')
          .setRequired(true),
      );
      s.addRoleOption((o) =>
        o.setName('role').setDescription('Safe non managed role below actor/bot').setRequired(true),
      );
    }
    s.addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm native role creation or membership change')
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
    if (['add', 'remove', 'create'].includes(sub)) {
      const result =
        sub === 'create'
          ? await createSafeRole(i, c, {
              name: i.options.getString('name', true),
              confirm: i.options.getBoolean('confirm', true),
            })
          : await assignSafeRole(i, c, {
              targetId: i.options.getUser('member', true).id,
              roleId: i.options.getRole('role', true).id,
              remove: sub === 'remove',
              confirm: i.options.getBoolean('confirm', true),
            });
      const locale = c.localization.locale(i.guildId);
      await i.editReply(
        lunaPayload(
          {
            content: c.localization.t(
              i.guildId,
              result.changed ? 'safeRoleEditSaved' : 'safeRoleEditNoop',
            ),
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    }
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
