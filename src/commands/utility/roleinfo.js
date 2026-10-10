import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Read current role ID,color,position and permission flags.')
    .setContexts(InteractionContextType.Guild)
    .addRoleOption((o) =>
      o.setName('role').setDescription('Role in this server').setRequired(true),
    ),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const selected = i.options.getRole('role', true),
      role = await i.guild.roles.fetch(selected.id, { force: true });
    if (!role || role.id !== selected.id || role.guild.id !== i.guildId)
      throw new UserError('roleInvalid');
    const locale = c.localization.locale(i.guildId),
      flags = role.permissions.toArray().sort(),
      text = c.localization.t(i.guildId, 'roleInfoValue', {
        name: role.name,
        id: role.id,
        color: role.hexColor,
        position: role.position,
        managed: role.managed,
        flags: flags.join(', ') || '-',
      });
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
