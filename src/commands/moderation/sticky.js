import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { begin, say, needPerm, sleep } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { setupMuteRole } from '../../services/stickyTools.js';
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const ch = (o) =>
  o
    .setName('channel')
    .setDescription('Text channel')
    .addChannelTypes(...TEXT);
const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Sticky messages, mute role setup and DM-on-warn.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageMessages)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Keep a message at the bottom of a channel, re-posted every N messages.')
      .addChannelOption((o) => ch(o).setRequired(true))
      .addStringOption((o) =>
        o.setName('text').setDescription('Sticky text').setRequired(true).setMaxLength(1500),
      )
      .addIntegerOption((o) =>
        o
          .setName('every')
          .setDescription('Re-post after this many messages (default 5)')
          .setMinValue(2)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove the sticky of a channel.')
      .addChannelOption((o) => ch(o).setRequired(true)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show sticky messages.'))
  .addSubcommand((s) =>
    s
      .setName('muterole')
      .setDescription('Create a Muted role and deny it Send/React/Speak in every channel.')
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Must be true').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('dmwarn')
      .setDescription('DM a member when they are warned.')
      .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true)),
  );
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    const sub = i.options.getSubcommand(),
      g = i.guildId;
    if (sub === 'muterole' || sub === 'dmwarn')
      needPerm(i, sub === 'muterole' ? P.ManageRoles : P.ManageGuild);
    else needPerm(i, P.ManageMessages);
    if (sub === 'list') {
      const rows = c.sticky.list(g);
      return say(i, c, 'stList', {
        list:
          rows.map((r) => `<#${r.ch}> every ${r.every}: ${r.text.slice(0, 80)}`).join('\n') || '-',
      });
    }
    if (sub === 'dmwarn') {
      const on = i.options.getBoolean('enabled', true);
      c.features.setConfig(g, 'dmwarn', { enabled: false }, { enabled: on });
      return say(i, c, on ? 'dwOn' : 'dwOff');
    }
    if (sub === 'muterole') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mtConfirm');
      const bot = i.guild.members.me;
      if (!bot.permissions.has([P.ManageRoles, P.ManageChannels]))
        throw new UserError('botPermission');
      const r = await setupMuteRole(c, i.guild, { sleep });
      return say(i, c, 'mrDone', { role: `<@&${r.role.id}>`, done: r.done, failed: r.failed });
    }
    const channel = i.options.getChannel('channel', true);
    if (sub === 'remove')
      return say(i, c, c.sticky.remove(g, channel.id) ? 'stRemoved' : 'stNone', {
        channel: `<#${channel.id}>`,
      });
    if (!channel.permissionsFor(i.guild.members.me)?.has([P.SendMessages, P.ManageMessages]))
      throw new UserError('botPermission');
    c.sticky.set(
      g,
      channel.id,
      i.options.getString('text', true),
      i.options.getInteger('every') ?? 5,
    );
    return say(i, c, 'stSet', { channel: `<#${channel.id}>` });
  },
};
