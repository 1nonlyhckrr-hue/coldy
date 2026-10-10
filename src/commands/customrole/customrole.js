import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { customRoleEffect } from '../../services/customRoles.js';
import { validateSelfRole } from '../../services/rolePanels.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const name = (o) =>
  o
    .setName('name')
    .setDescription('Mapping name: lowercase letters, digits, _ or -')
    .setMinLength(1)
    .setMaxLength(24)
    .setRequired(true);
const data = new SlashCommandBuilder()
  .setName('customrole')
  .setDescription('Configured self-service roles with safe role checks.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('map')
      .setDescription('Manage Roles: map a name to an existing safe role.')
      .addStringOption(name)
      .addRoleOption((o) =>
        o.setName('role').setDescription('Existing safe role').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('unmap')
      .setDescription('Manage Roles: remove a mapping, leaving existing assignments.')
      .addStringOption(name),
  )
  .addSubcommand((s) =>
    s
      .setName('required')
      .setDescription('Manage Roles: set eligibility role or remove the gate.')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Omit to allow all server members to claim mapped roles.'),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show mapped names and eligibility role.'))
  .addSubcommand((s) =>
    s
      .setName('claim')
      .setDescription('Assign one configured safe role to yourself.')
      .addStringOption(name),
  )
  .addSubcommand((s) =>
    s
      .setName('release')
      .setDescription('Remove one configured role from yourself.')
      .addStringOption(name),
  );
export default {
  category: 'customrole',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.localization.locale(i.guildId),
      t = (key, params) => c.localization.t(i.guildId, key, params);
    let text;
    if (['map', 'unmap', 'required'].includes(sub)) {
      const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (!actor.permissions.has(P.ManageRoles)) throw new UserError('roleActorPermission');
      if (sub === 'map') {
        const selected = i.options.getRole('role', true),
          [bot, role] = await Promise.all([
            i.guild.members.fetchMe({ force: true }),
            i.guild.roles.fetch(selected.id),
          ]);
        validateSelfRole(role, bot, actor, i.guild);
        c.customRoles.map(i.guildId, i.options.getString('name', true), role.id);
        text = t('customSaved');
      } else if (sub === 'unmap') {
        const removed = c.customRoles.unmap(i.guildId, i.options.getString('name', true));
        if (!removed) throw new UserError('customMappingMissing');
        text = t('customUnmapped');
      } else {
        const selected = i.options.getRole('role');
        let role = null;
        if (selected) {
          role = await i.guild.roles.fetch(selected.id);
          if (!role || role.guild.id !== i.guildId || role.id === i.guildId || role.managed)
            throw new UserError('customRoleInvalid');
          if (actor.id !== i.guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)
            throw new UserError('roleActorHierarchy');
        }
        c.customRoles.setRequired(i.guildId, role?.id ?? null);
        text = t('customSaved');
      }
    } else if (sub === 'list') {
      const rows = c.customRoles.list(i.guildId);
      text =
        t('customList', {
          count: rows.length,
          required: c.customRoles.required(i.guildId) ?? t('customNoGate'),
        }) +
        '\n' +
        (rows.map((r) => `${r.name}: ${r.role_id}`).join('\n') || t('customEmpty'));
    } else if (['claim', 'release'].includes(sub)) {
      const result = await customRoleEffect(i, c, {
        name: i.options.getString('name', true),
        claim: sub === 'claim',
      });
      text = t(
        result.changed ? (sub === 'claim' ? 'customClaimed' : 'customReleased') : 'customAlready',
      );
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
