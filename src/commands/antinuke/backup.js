import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import { AUTOBACKUP } from '../../services/autoBackup.js';
import { snapshotGuild, restoreGuild } from '../../services/serverBackup.js';
const idOption = (o) =>
  o
    .setName('id')
    .setDescription('Backup number from /backup list')
    .setRequired(true)
    .setMinValue(1);
const data = new SlashCommandBuilder()
  .setName('backup')
  .setDescription('Save or restore the server roles and channels (bot owner and allowed users).')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Save roles, channels and permissions as a backup (keeps the latest 5).'),
  )
  .addSubcommand((s) =>
    s
      .setName('auto')
      .setDescription(
        'Daily automatic backup (off by default; keeps the newest 5 backups in total).',
      )
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Turn daily backups on or off').setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('time')
          .setDescription('Time of day in UTC as HH:MM (default 03:00)')
          .setMaxLength(5),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show saved backups.'))
  .addSubcommand((s) =>
    s.setName('export').setDescription('Download one backup as JSON.').addIntegerOption(idOption),
  )
  .addSubcommand((s) =>
    s
      .setName('restore')
      .setDescription(
        'Recreate missing roles and channels from a backup. Nothing is deleted or edited.',
      )
      .addIntegerOption(idOption)
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm recreating missing items').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('delete').setDescription('Delete one saved backup.').addIntegerOption(idOption),
  );
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await requireSecurityAccess(i, c, 'backup');
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    let text, files;
    if (sub === 'auto') {
      const on = i.options.getBoolean('enabled', true);
      const time =
        i.options.getString('time') ?? c.features.config(i.guildId, 'autobackup', AUTOBACKUP).time;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UserError('abBadTime');
      c.features.setConfig(i.guildId, 'autobackup', AUTOBACKUP, { enabled: on, time });
      text = t(on ? 'abOn' : 'abOff', { time });
    } else if (sub === 'create') {
      const snap = snapshotGuild(i.guild),
        id = c.serverBackups.save(i.guildId, i.user.id, snap);
      text = t('backupCreated', { id, roles: snap.roles.length, channels: snap.channels.length });
    } else if (sub === 'list') {
      const rows = c.serverBackups.list(i.guildId);
      text =
        t('backupList') +
        '\n' +
        (rows
          .map(
            (r) =>
              `#${r.id} | <t:${Math.floor(r.createdAt / 1000)}:f> | ${r.roles} roles | ${r.channels} channels`,
          )
          .join('\n') || t('antinukeEmpty'));
    } else if (sub === 'export') {
      const id = i.options.getInteger('id', true);
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify(c.serverBackups.get(i.guildId, id), null, 2) + '\n', 'utf8'),
          { name: `emika-backup-${id}.json` },
        ),
      ];
      text = t('backupExported', { id });
    } else if (sub === 'delete') {
      const id = i.options.getInteger('id', true);
      if (!c.serverBackups.remove(i.guildId, id)) throw new UserError('backupNotFound');
      text = t('backupDeleted', { id });
    } else {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('backupConfirm');
      const bot = await i.guild.members.fetchMe({ force: true });
      if (!bot.permissions?.has([P.ManageRoles, P.ManageChannels]))
        throw new UserError('botPermission');
      const id = i.options.getInteger('id', true);
      text = t('backupRestored', {
        id,
        ...(await restoreGuild(i.guild, c.serverBackups.get(i.guildId, id))),
      });
    }
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
