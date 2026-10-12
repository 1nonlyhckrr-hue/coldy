import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  ChannelType,
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
for (const sub of ['blockchannel', 'unblockchannel'])
  data.addSubcommand((s) =>
    s
      .setName(sub)
      .setDescription(
        sub === 'blockchannel'
          ? 'Deny one command in this exact channel,no inheritance/Discord overwrite.'
          : 'Remove exact stored channel deny,including deleted channels.',
      )
      .addStringOption(command)
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact server channel ID17-20digits')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('channelrules')
    .setDescription('Private stored channel denies,ten perpage;not Discord permissions.')
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Page1-10').setMinValue(1).setMaxValue(10),
    )
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('Optional exact stored command name')
        .setMinLength(1)
        .setMaxLength(32),
    ),
);
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
data
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription(
        'Private JSON of stored user/role/channel deny IDs,no permissions or native grants.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clearall')
      .setDescription(
        'Confirmed remove all guild Emika denies,user/role/channel;native permissions unchanged.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing all guild deny rules')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clearcommand')
      .setDescription(
        'Confirmed remove bothsubject/channel denies for one storedcommand,including removed ones.',
      )
      .addStringOption(command)
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing all denies for this exact storedcommand')
          .setRequired(true),
      ),
  );
for (const kind of ['user', 'role', 'channel'])
  data.addSubcommand((s) =>
    s
      .setName('clear' + kind)
      .setDescription(
        'Remove all stored ' + kind + ' denies across commands;no Discord permission grants.',
      )
      .addStringOption((o) =>
        o
          .setName('id')
          .setDescription('Exact stored ' + kind + ' ID,departed/deleted resources allowed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing all denies for this exact ' + kind)
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription('Private stored deny counts bykind/command,no native permissions or IDs.'),
);
data.addSubcommand((s) =>
  s
    .setName('searchid')
    .setDescription(
      'Private exact stored ID lookup across user/role/channel denies,no native lookup.',
    )
    .addStringOption((o) =>
      o
        .setName('id')
        .setDescription('Exact stored17-20digit ID')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('obsolete')
    .setDescription(
      'Private JSON denies for commands absent from current registry;no deletion/resource claims.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('commandcounts')
    .setDescription(
      'Private stored deny counts percommand,no subject IDs or effectivepermission claim.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportcommand')
    .setDescription(
      'Private all stored subject/channel denies for exactcommandname,including absentcommands.',
    )
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('Exact stored top-level name,without /')
        .setMinLength(1)
        .setMaxLength(32)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('clearobsolete')
    .setDescription(
      'Erase denies for registry-absent commands,may affect them if reinstalled later.',
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm forgetting absentcommand denies,no currentcommand changes')
        .setRequired(true),
    ),
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
    let text, files;
    if (sub === 'commandcounts' || sub === 'exportcommand') {
      const report =
        sub === 'commandcounts'
          ? c.commandRestrictions.commandCounts(i.guildId)
          : c.commandRestrictions.exportCommand(i.guildId, i.options.getString('command', true));
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'commandcounts'
              ? 'emika-permit-command-counts.json'
              : 'emika-permit-command-denies.json',
        }),
      ];
      text = t('permitCommandAudit');
    } else if (sub === 'clearobsolete') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('permitClearConfirm');
      text = t('permitObsoleteCleared', c.commandRestrictions.clearObsolete(i.guildId, c.commands));
    } else if (sub === 'summary')
      text = t('permitSummary', c.commandRestrictions.summary(i.guildId));
    else if (sub === 'searchid' || sub === 'obsolete') {
      const rules =
        sub === 'searchid'
          ? c.commandRestrictions.searchStored(i.guildId, i.options.getString('id', true))
          : c.commandRestrictions.obsolete(i.guildId, c.commands);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(rules, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'searchid'
              ? 'emika-permit-id-matches.json'
              : 'emika-permit-obsolete-commands.json',
        }),
      ];
      text = t(sub === 'searchid' ? 'permitMatchesExported' : 'permitObsoleteExported', {
        subjects: rules.subjects.length,
        channels: rules.channels.length,
      });
    } else if (['clearuser', 'clearrole', 'clearchannel'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('permitClearConfirm');
      const kind = sub.slice(5),
        id = i.options.getString('id', true);
      text = t('permitScopeCleared', {
        count: c.commandRestrictions.clearScope(i.guildId, kind, id),
      });
    } else if (sub === 'export') {
      const rules = c.commandRestrictions.exportRules(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(rules, null, 2) + '\n', 'utf8'), {
          name: 'emika-permit-denies.json',
        }),
      ];
      text = t('permitExported', {
        subjects: rules.subjects.length,
        channels: rules.channels.length,
      });
    } else if (['clearall', 'clearcommand'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('permitClearConfirm');
      const r = c.commandRestrictions.clearCombined(
        i.guildId,
        sub === 'clearcommand' ? i.options.getString('command', true) : null,
      );
      text = t('permitCombinedCleared', r);
    } else if (sub === 'channelrules') {
      const rows = c.commandRestrictions.channelRules(
          i.guildId,
          i.options.getString('command') ?? null,
        ),
        page = i.options.getInteger('page') ?? 1,
        pages = Math.max(1, Math.ceil(rows.length / 10));
      if (!Number.isInteger(page) || page < 1 || page > pages)
        throw new UserError('permitPageInvalid', { pages });
      text =
        t('permitChannelList', { page, pages, count: rows.length }) +
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map((r) => `/${r.command_name} | ${r.channel_id}`)
          .join('\n') || t('permitEmpty'));
    } else if (sub === 'list') {
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
      if (['blockchannel', 'unblockchannel'].includes(sub)) {
        const id = i.options.getString('channel-id', true);
        if (!/^\d{17,20}$/.test(id)) throw new UserError('permitChannelInvalid');
        const blocked = sub === 'blockchannel';
        if (blocked) {
          const channel = await i.guild.channels.fetch(id, { force: true });
          if (
            channel?.id !== id ||
            channel.guildId !== i.guildId ||
            ![
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
              ChannelType.GuildForum,
              ChannelType.GuildMedia,
            ].includes(channel.type)
          )
            throw new UserError('permitChannelInvalid');
          const current = await i.guild.members.fetch({ user: i.user.id, force: true });
          if (
            current?.id !== i.user.id ||
            current.guild?.id !== i.guildId ||
            !current.permissions?.has(P.ManageGuild) ||
            !channel.permissionsFor(current)?.has(P.ViewChannel)
          )
            throw new UserError('userPermission');
        }
        const count = c.commandRestrictions.setChannel(i.guildId, name, id, blocked);
        text = t('permitChannelSaved', { command: name, id, count });
      } else if (sub === 'remove') {
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
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
