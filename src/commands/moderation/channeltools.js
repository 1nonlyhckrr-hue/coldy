import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import {
  denyEveryone,
  restoreEveryone,
  cloneChannel,
  nukeChannel,
} from '../../services/channelTools.js';
const CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
];
const DESC = {
  lock: 'Deny @everyone from sending in one channel. Undo restores the exact previous state.',
  unlock: 'Restore the exact previous @everyone state of a channel locked with /channeltools lock.',
  hide: 'Hide one channel from @everyone (View Channel denied).',
  show: 'Show a channel hidden with /channeltools hide, restoring its previous state.',
  archive: 'Make one channel read-only and hidden for @everyone.',
  unarchive: 'Undo /channeltools archive and restore the previous state.',
  clone: 'Copy a channel (name, topic, category, permissions) without its messages.',
  nuke: 'Owner/delegate: delete a text channel and recreate it empty with the same settings.',
};
const data = new SlashCommandBuilder()
  .setName('channeltools')
  .setDescription('Lock, hide, archive, clone or nuke one channel.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageChannels);
for (const [name, description] of Object.entries(DESC))
  data.addSubcommand((s) => {
    s.setName(name).setDescription(description);
    s.addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription(
          name === 'nuke' ? 'Text channel to recreate' : 'Channel (default: this one)',
        )
        .addChannelTypes(...(name === 'nuke' ? CHANNEL_TYPES.slice(0, 2) : CHANNEL_TYPES))
        .setRequired(name === 'nuke'),
    );
    if (name === 'clone')
      s.addStringOption((o) =>
        o.setName('name').setDescription('Name of the copy (default: same name)').setMaxLength(100),
      );
    if (name === 'nuke')
      s.addStringOption((o) =>
        o
          .setName('confirm-name')
          .setDescription('Type the exact channel name to confirm')
          .setRequired(true)
          .setMaxLength(100),
      );
    return s;
  });
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ManageChannels);
    const sub = i.options.getSubcommand();
    if (sub === 'nuke') await requireSecurityAccess(i, c, 'nuke');
    const target = i.options.getChannel('channel') ?? i.channel;
    const channel = target ? await i.guild.channels.fetch(target.id, { force: true }) : null;
    if (!channel) throw new UserError('ctUnsupported');
    const params = { channel: `<#${channel.id}>` };
    if (['lock', 'hide', 'archive'].includes(sub)) {
      await denyEveryone(i.guild, channel, c.features, sub, i.user.id);
      return say(i, c, 'ctDone_' + sub, params);
    }
    if (['unlock', 'show', 'unarchive'].includes(sub)) {
      await restoreEveryone(
        i.guild,
        channel,
        c.features,
        sub.replace(/^un/, '').replace('show', 'hide'),
        i.user.id,
      );
      return say(i, c, 'ctDone_' + sub, params);
    }
    if (sub === 'clone') {
      const copy = await cloneChannel(channel, i.options.getString('name'), i.user.id);
      return say(i, c, 'ctDone_clone', { channel: `<#${copy.id}>` });
    }
    if (i.options.getString('confirm-name', true) !== channel.name)
      throw new UserError('ctConfirmName');
    const r = await nukeChannel(i.guild, channel, c.features, i.user.id);
    try {
      await r.fresh.send({
        content: c.localization.t(i.guildId, 'ctNuked', { user: `<@${i.user.id}>` }),
        allowedMentions: { parse: [] },
      });
    } catch {
      // posting the notice is best effort
    }
    return say(i, c, r.deleted ? 'ctDone_nuke' : 'ctNukePartial', { channel: `<#${r.fresh.id}>` });
  },
};
