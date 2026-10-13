import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, sleep } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { requireSecurityAccess, isBotOwner } from '../../services/securityAccess.js';
import { templateOf, startApply } from '../../services/templates.js';
const name = (s) =>
  s.addStringOption((o) =>
    o
      .setName('name')
      .setDescription('Template name: a-z 0-9 _ - (max 20), e.g. 1')
      .setRequired(true)
      .setMaxLength(20),
  );
const data = new SlashCommandBuilder()
  .setName('template')
  .setDescription('Save this server structure as a template and paste it into another server.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.Administrator)
  .addSubcommand((s) =>
    name(
      s
        .setName('save')
        .setDescription('Save roles, categories, channels and permissions (no messages).'),
    ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show your saved templates.'))
  .addSubcommand((s) =>
    name(
      s
        .setName('apply')
        .setDescription(
          'Create the missing roles and channels of a template here. Deletes nothing.',
        ),
    ).addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Must be true: this creates many roles and channels')
        .setRequired(true),
    ),
  )
  .addSubcommand((s) => name(s.setName('delete').setDescription('Delete one of your templates.')));
export default {
  category: 'antinuke',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await begin(i);
    await requireSecurityAccess(i, c, 'template');
    const sub = i.options.getSubcommand(),
      owner = isBotOwner(c, i.user.id);
    if (sub === 'list') {
      const rows = c.templates.list(i.user.id, owner);
      return say(i, c, 'tpList', {
        list:
          rows
            .map(
              (r) =>
                `${r.name}: ${r.roles} roles, ${r.channels} channels, from ${r.from}${r.at ? ` <t:${Math.floor(r.at / 1000)}:d>` : ''}`,
            )
            .join('\n') || '-',
      });
    }
    const nm = i.options.getString('name', true).toLowerCase();
    if (sub === 'save') {
      c.templates.save(nm, templateOf(i.guild), i.user.id, i.guild.name);
      const d = c.templates.use(nm, i.user.id, owner);
      return say(i, c, 'tpSaved', {
        name: nm,
        roles: d.roles,
        channels: d.channels,
      });
    }
    if (sub === 'delete') {
      c.templates.remove(nm, i.user.id, owner);
      return say(i, c, 'tpDeleted', { name: nm });
    }
    if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mtConfirm');
    const t = c.templates.use(nm, i.user.id, owner);
    if (t.data.guildId === i.guildId) throw new UserError('tpSameServer');
    const bot = i.guild.members.me;
    if (!bot.permissions.has([P.ManageRoles, P.ManageChannels]))
      throw new UserError('botPermission');
    let ended = false;
    const total = startApply(i.guild, t.data, {
      sleep,
      log: c.logger,
      progress: (done, o) =>
        !ended &&
        say(i, c, 'tpProgress', {
          name: nm,
          done,
          total: t.data.roles.length + t.data.channels.length,
          roles: o.rolesCreated,
          channels: o.channelsCreated,
          failed: o.failed,
        }),
      finish: (r) => {
        ended = true;
        return say(i, c, r.failed === -1 ? 'tpFailed' : 'tpDone', {
          name: nm,
          roles: r.rolesCreated,
          channels: r.channelsCreated,
          skipped: r.skipped,
          failed: r.failed,
          reason: r.firstError ?? '',
        });
      },
    });
    return say(i, c, 'tpStarted', { name: nm, total });
  },
};
