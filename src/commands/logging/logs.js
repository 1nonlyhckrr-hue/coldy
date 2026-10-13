import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { LOG_KINDS } from '../../services/logHub.js';
const kind = (s) =>
  s.addStringOption((o) =>
    o
      .setName('kind')
      .setDescription('Which log')
      .setRequired(true)
      .addChoices(
        { name: 'Moderation actions (modlog)', value: 'mod' },
        { name: 'Message delete/edit', value: 'msg' },
        { name: 'Joins and leaves', value: 'join' },
        { name: 'Voice joins, leaves, moves', value: 'vc' },
        { name: 'Member role changes', value: 'role' },
        { name: 'Channel create/delete/rename', value: 'channel' },
      ),
  );
const data = new SlashCommandBuilder()
  .setName('logs')
  .setDescription(
    'Set log channels for moderation actions, messages, joins, voice, roles, channels.',
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    kind(
      s.setName('set').setDescription('Send one kind of log to a channel (off until set).'),
    ).addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Text channel for this log')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    ),
  )
  .addSubcommand((s) => kind(s.setName('off').setDescription('Stop one kind of log.')))
  .addSubcommand((s) => s.setName('config').setDescription('Show which logs are on.'));
export default {
  category: 'logging',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ManageGuild);
    const sub = i.options.getSubcommand();
    if (sub === 'set') {
      const ch = i.options.getChannel('channel', true);
      await validateOutputChannel(i.guild, ch.id);
      c.logHub.set(i.guildId, i.options.getString('kind', true), ch.id);
      return say(i, c, 'lgSet', { channel: `<#${ch.id}>` });
    }
    if (sub === 'off') {
      c.logHub.set(i.guildId, i.options.getString('kind', true), null);
      return say(i, c, 'lgOff');
    }
    const cfg = c.logHub.config(i.guildId);
    const lines = LOG_KINDS.map((k) => `${k}: ${cfg[k] ? `<#${cfg[k]}>` : '-'}`).join('\n');
    return say(i, c, 'lgConfig', { lines });
  },
};
