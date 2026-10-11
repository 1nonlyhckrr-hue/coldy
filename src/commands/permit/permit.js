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
  .setContexts(InteractionContextType.Guild);
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
      .setName('status')
      .setDescription('Check your current stored command restriction only,not Discord permissions.')
      .addStringOption(command),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove one exact stored restriction,including departed/deleted subject IDs.')
      .addStringOption(command)
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Stored subject kind')
          .addChoices({ name: 'user', value: 'user' }, { name: 'role', value: 'role' })
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('subject-id')
          .setDescription('Exact stored Discord ID')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removal of this exact stored deny rule')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription(
        'Inspect stored deny rules,optional command/kind filters;no permission grants.',
      )
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-10').setMinValue(1).setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('command')
          .setDescription('Exact stored command name,including previously removed commands')
          .setMinLength(1)
          .setMaxLength(32),
      )
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Only stored user or role deny rules')
          .addChoices({ name: 'user', value: 'user' }, { name: 'role', value: 'role' }),
      ),
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
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();
    const t = (key, params) => c.localization.t(i.guildId, key, params),
      locale = c.localization.locale(i.guildId);
    if (sub === 'status') {
      const name = i.options.getString('command', true);
      if (!c.commands.has(name)) throw new UserError('permitCommandInvalid');
      const status = await c.commandRestrictions.ownStatus(i, name);
      await i.editReply(
        lunaPayload(
          {
            content: t('permitOwnStatus', { command: name, status: t('permitOwn_' + status) }),
            allowedMentions: { parse: [] },
          },
          { locale },
        ),
      );
      return;
    }
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    let text;
    if (sub === 'list') {
      const rows = c.commandRestrictions.filtered(i.guildId, {
          commandName: i.options.getString?.('command') ?? null,
          kind: i.options.getString?.('kind') ?? null,
        }),
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
      if (sub === 'remove') {
        if (i.options.getBoolean('confirm', true) !== true)
          throw new UserError('permitRemoveConfirm');
        const count = c.commandRestrictions.removeStored(
          i.guildId,
          name,
          i.options.getString('kind', true),
          i.options.getString('subject-id', true),
        );
        text = t('permitRemoved', { count });
      } else if (sub === 'clear') {
        const count = c.commandRestrictions.clear(i.guildId, name);
        text = t('permitCleared', { command: name, count });
      } else if (['blockuser', 'unblockuser', 'blockrole', 'unblockrole'].includes(sub)) {
        const kind = sub.endsWith('user') ? 'user' : 'role',
          blocked = sub.startsWith('block');
        let id;
        if (kind === 'user') {
          const user = i.options.getUser('user', true),
            member = await i.guild.members.fetch({ user: user.id, force: true });
          if (!member || member.id !== user.id || member.guild?.id !== i.guildId)
            throw new UserError('permitMemberMissing');
          id = member.id;
          if (blocked && id === i.guild.ownerId) throw new UserError('permitOwnerProtected');
        } else {
          const selected = i.options.getRole('role', true),
            role = await i.guild.roles.fetch(selected.id, { force: true });
          if (
            !role ||
            role.id !== selected.id ||
            role.guild.id !== i.guildId ||
            role.id === i.guildId ||
            role.managed
          )
            throw new UserError('permitRoleInvalid');
          id = role.id;
        }
        const currentActor = await i.guild.members.fetch({ user: i.user.id, force: true });
        if (
          currentActor?.id !== i.user.id ||
          currentActor.guild?.id !== i.guildId ||
          !currentActor.permissions.has(P.ManageGuild)
        )
          throw new UserError('userPermission');
        c.commandRestrictions.set(i.guildId, name, kind, id, blocked);
        text = t(blocked ? 'permitBlocked' : 'permitUnblocked', { command: name });
      } else throw new UserError('unknownCommand');
    }
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
