import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
import { RECOVERY_COMMANDS } from '../../services/permit.js';
const command = (o) =>
  o
    .setName('command')
    .setDescription('Installed top-level command name, without /')
    .setMinLength(1)
    .setMaxLength(32)
    .setRequired(true);
const data = new SlashCommandBuilder()
  .setName('permit')
  .setDescription('Restrict installed commands without granting Discord permissions.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const kind of ['user', 'role'])
  for (const blocked of [true, false])
    data.addSubcommand((s) => {
      s.setName(`${blocked ? 'block' : 'unblock'}${kind}`)
        .setDescription(`${blocked ? 'Block' : 'Unblock'} a ${kind} for one entire command.`)
        .addStringOption(command);
      return kind === 'user'
        ? s.addUserOption((o) =>
            o.setName('user').setDescription('Server member').setRequired(true),
          )
        : s.addRoleOption((o) => o.setName('role').setDescription('Server role').setRequired(true));
    });
data
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('Show configured restrictions, ten per page.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page').setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('clear')
      .setDescription('Remove all restrictions for one command.')
      .addStringOption(command),
  );
export default {
  category: 'permit',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (!actor.permissions.has(P.ManageGuild)) throw new UserError('userPermission');
    const t = (key, params) => c.localization.t(i.guildId, key, params),
      locale = c.localization.locale(i.guildId),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'list') {
      const rows = c.commandRestrictions.list(i.guildId),
        pages = Math.max(1, Math.ceil(rows.length / 10)),
        page = i.options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > pages)
        throw new UserError('permitPageInvalid', { pages });
      text =
        t('permitList', { page, pages, count: rows.length }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map(
            (r) =>
              `/${r.command_name} | ${t(r.subject_kind === 'user' ? 'permitUser' : 'permitRole')} | ${r.subject_id}`,
          )
          .join('\n') || t('permitEmpty'));
    } else {
      const name = i.options.getString('command', true);
      if (!c.commands.has(name)) throw new UserError('permitCommandInvalid');
      if (RECOVERY_COMMANDS.has(name)) throw new UserError('permitProtected');
      if (sub === 'clear') {
        const count = c.commandRestrictions.clear(i.guildId, name);
        text = t('permitCleared', { command: name, count });
      } else if (['blockuser', 'unblockuser', 'blockrole', 'unblockrole'].includes(sub)) {
        const kind = sub.endsWith('user') ? 'user' : 'role',
          blocked = sub.startsWith('block');
        let id;
        if (kind === 'user') {
          const user = i.options.getUser('user', true),
            member = await i.guild.members.fetch({ user: user.id, force: true });
          if (!member || member.id !== user.id) throw new UserError('permitMemberMissing');
          id = member.id;
          if (blocked && id === i.guild.ownerId) throw new UserError('permitOwnerProtected');
        } else {
          const selected = i.options.getRole('role', true),
            role = await i.guild.roles.fetch(selected.id);
          if (!role || role.guild.id !== i.guildId || role.id === i.guildId || role.managed)
            throw new UserError('permitRoleInvalid');
          id = role.id;
        }
        c.commandRestrictions.set(i.guildId, name, kind, id, blocked);
        text = t(blocked ? 'permitBlocked' : 'permitUnblocked', { command: name });
      } else throw new UserError('unknownCommand');
    }
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
