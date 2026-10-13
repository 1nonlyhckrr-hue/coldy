import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { parseDuration } from '../../services/discordTools.js';
const data = new SlashCommandBuilder()
  .setName('temprole')
  .setDescription('Give a role that removes itself after a set time.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageRoles)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Give a member a role for a limited time.')
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('duration')
          .setDescription('For example 2h, 1d12h, 30m')
          .setRequired(true)
          .setMaxLength(40),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Take the role away now and cancel its timer.')
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show active temporary roles.'));
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ManageRoles);
    const sub = i.options.getSubcommand();
    if (sub === 'list') {
      const rows = c.tempRoles.list(i.guildId);
      const lines = rows
        .slice(0, 30)
        .map((r) => `<@${r.userId}> <@&${r.roleId}> <t:${Math.floor(r.expiresAt / 1000)}:R>`);
      return say(i, c, 'trList', { list: lines.join('\n') || '-' });
    }
    const member = await i.guild.members
      .fetch(i.options.getUser('member', true).id)
      .catch(() => null);
    if (!member) throw new UserError('trNoMember');
    const role = i.options.getRole('role', true);
    const full = i.guild.roles.cache.get(role.id);
    if (!full || full.managed || role.id === i.guildId || !full.editable)
      throw new UserError('trRoleLocked');
    if (i.user.id !== i.guild.ownerId && full.position >= i.member.roles.highest.position)
      throw new UserError('trRoleLocked');
    if (sub === 'remove') {
      c.tempRoles.remove(i.guildId, member.id, role.id);
      await member.roles.remove(role.id, `Emika temprole removed by ${i.user.id}`);
      return say(i, c, 'trRemoved', { user: `<@${member.id}>`, role: `<@&${role.id}>` });
    }
    const secs = parseDuration(i.options.getString('duration', true));
    const expiresAt = Date.now() + secs * 1000;
    await member.roles.add(role.id, `Emika temprole by ${i.user.id}`);
    c.tempRoles.add(i.guildId, member.id, role.id, expiresAt, i.user.id);
    return say(i, c, 'trAdded', {
      user: `<@${member.id}>`,
      role: `<@&${role.id}>`,
      when: `<t:${Math.floor(expiresAt / 1000)}:R>`,
    });
  },
};
