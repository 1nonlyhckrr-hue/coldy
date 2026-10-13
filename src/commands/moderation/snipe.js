import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { snipeConfig, SNIPE } from '../../services/snipe.js';
const data = new SlashCommandBuilder()
  .setName('snipe')
  .setDescription('Show the last deleted or edited message, and catch ghost pings.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageMessages)
  .addSubcommand((s) =>
    s.setName('deleted').setDescription('Last deleted message in this channel.'),
  )
  .addSubcommand((s) =>
    s.setName('edited').setDescription('Last edited message (old text) in this channel.'),
  )
  .addSubcommand((s) =>
    s
      .setName('config')
      .setDescription('Turn message sniping and ghost-ping alerts on or off.')
      .addBooleanOption((o) =>
        o
          .setName('snipe')
          .setDescription('Remember deleted and edited messages for 1 hour (memory only)'),
      )
      .addBooleanOption((o) =>
        o.setName('ghostping').setDescription('Say who was pinged when a ping message is deleted'),
      ),
  );
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ManageMessages);
    const sub = i.options.getSubcommand();
    if (sub === 'config') {
      needPerm(i, P.ManageGuild);
      const snipe = i.options.getBoolean('snipe'),
        ghost = i.options.getBoolean('ghostping');
      const cur = snipeConfig(c, i.guildId);
      const next = c.features.setConfig(i.guildId, 'snipe', SNIPE, {
        enabled: snipe ?? cur.enabled,
        ghostping: ghost ?? cur.ghostping,
      });
      if (!next.enabled) c.snipe.forgetGuild(i.guildId);
      return say(i, c, 'snConfig', {
        snipe: next.enabled ? 'on' : 'off',
        ghost: next.ghostping ? 'on' : 'off',
      });
    }
    if (!snipeConfig(c, i.guildId).enabled) throw new UserError('snOff');
    const e =
      sub === 'deleted' ? c.snipe.lastDeleted(i.channelId) : c.snipe.lastEdited(i.channelId);
    if (!e || e.guildId !== i.guildId) throw new UserError('snNone');
    if (sub === 'deleted')
      return say(i, c, 'snDeleted', {
        user: `<@${e.authorId}>`,
        content: e.content || '-',
        files: e.files,
      });
    return say(i, c, 'snEdited', { user: `<@${e.authorId}>`, old: e.content, now: e.now });
  },
};
