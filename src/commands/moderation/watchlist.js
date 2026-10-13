import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
const user = (s) =>
  s.addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true));
const data = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('Watch a suspect member in the modlog, or lock a member nickname.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    user(
      s
        .setName('watch')
        .setDescription('Log every message and voice move of this member to the modlog.'),
    ),
  )
  .addSubcommand((s) => user(s.setName('unwatch').setDescription('Stop watching this member.')))
  .addSubcommand((s) => s.setName('list').setDescription('Show watched members.'))
  .addSubcommand((s) =>
    user(
      s
        .setName('nicklock')
        .setDescription('Lock a nickname: any change is reverted automatically.'),
    ).addStringOption((o) =>
      o
        .setName('nickname')
        .setDescription('Locked nickname (default: the current one)')
        .setMaxLength(32),
    ),
  )
  .addSubcommand((s) => user(s.setName('nicklockoff').setDescription('Unlock a member nickname.')));
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    const sub = i.options.getSubcommand();
    needPerm(i, sub.startsWith('nick') ? P.ManageNicknames : P.ModerateMembers);
    if (sub === 'list') {
      const ids = c.watch.list(i.guildId);
      return say(i, c, 'wlList', { list: ids.map((x) => `<@${x}>`).join(' ') || '-' });
    }
    const target = i.options.getUser('member', true);
    if (sub === 'watch') {
      c.watch.add(i.guildId, target.id, i.user.id);
      return say(i, c, 'wlOn', { user: `<@${target.id}>` });
    }
    if (sub === 'unwatch')
      return say(i, c, c.watch.remove(i.guildId, target.id) ? 'wlOff' : 'wlNotWatched');
    if (sub === 'nicklock') {
      const member = await i.guild.members.fetch({ user: target.id, force: true });
      const bot = await i.guild.members.fetchMe({ force: true });
      if (
        member.id === i.guild.ownerId ||
        bot.roles.highest.comparePositionTo(member.roles.highest) <= 0 ||
        !bot.permissions.has(P.ManageNicknames)
      )
        throw new UserError('mtBotPerm');
      const nick = i.options.getString('nickname') ?? member.nickname ?? member.user.username;
      c.watch.lockNick(i.guildId, target.id, nick);
      await member.setNickname(nick, `Emika nicklock by ${i.user.id}`).catch(() => {});
      return say(i, c, 'wlNickOn', { user: `<@${target.id}>`, nick });
    }
    return say(i, c, c.watch.unlockNick(i.guildId, target.id) ? 'wlNickOff' : 'wlNotWatched');
  },
};
