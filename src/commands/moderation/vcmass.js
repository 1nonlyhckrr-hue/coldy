import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { begin, say, needPerm, sleep } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
const VC = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const chan = (o, name, desc, req) =>
  o
    .setName(name)
    .setDescription(desc)
    .addChannelTypes(...VC)
    .setRequired(req);
const data = new SlashCommandBuilder()
  .setName('vcmass')
  .setDescription('Mute, unmute or move everyone in a voice channel.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.MuteMembers)
  .addSubcommand((s) =>
    s
      .setName('muteall')
      .setDescription(
        'Server-mute everyone in a voice channel (staff with Mute Members are skipped).',
      )
      .addChannelOption((o) => chan(o, 'channel', 'Voice channel (default: yours)', false)),
  )
  .addSubcommand((s) =>
    s
      .setName('unmuteall')
      .setDescription('Remove the server-mute from everyone in a voice channel.')
      .addChannelOption((o) => chan(o, 'channel', 'Voice channel (default: yours)', false)),
  )
  .addSubcommand((s) =>
    s
      .setName('moveall')
      .setDescription('Move everyone from one voice channel to another.')
      .addChannelOption((o) => chan(o, 'to', 'Destination voice channel', true))
      .addChannelOption((o) => chan(o, 'from', 'Source voice channel (default: yours)', false)),
  );
export default {
  category: 'moderation',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await begin(i);
    const sub = i.options.getSubcommand();
    needPerm(i, sub === 'moveall' ? P.MoveMembers : P.MuteMembers);
    const me = i.guild.members.me;
    const src =
      (sub === 'moveall' ? i.options.getChannel('from') : i.options.getChannel('channel')) ??
      i.member.voice?.channel;
    if (!src) throw new UserError('vmNoChannel');
    const need = sub === 'moveall' ? P.MoveMembers : P.MuteMembers;
    if (!src.permissionsFor(me)?.has(need)) throw new UserError('botPermission');
    const dest = sub === 'moveall' ? i.options.getChannel('to', true) : null;
    if (dest && (dest.id === src.id || !dest.permissionsFor(me)?.has(P.Connect)))
      throw new UserError('vmBadDest');
    let ok = 0,
      skipped = 0,
      failed = 0;
    for (const m of [...src.members.values()].slice(0, 200)) {
      if (m.user.bot && sub !== 'moveall') {
        skipped++;
        continue;
      }
      if (sub === 'muteall' && m.permissions.has(P.MuteMembers)) {
        skipped++;
        continue;
      }
      try {
        if (sub === 'moveall') await m.voice.setChannel(dest, `Emika moveall by ${i.user.id}`);
        else await m.voice.setMute(sub === 'muteall', `Emika ${sub} by ${i.user.id}`);
        ok++;
      } catch {
        failed++;
      }
      await sleep(250);
    }
    return say(i, c, 'vmDone', { ok, skipped, failed });
  },
};
