import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, needPerm, SNOWFLAKE, tr } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import { APPEALS } from '../../services/modCase.js';
import { sendUnbanInvite } from '../../services/unbanInvite.js';
const member = (s) =>
  s.addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true));
const uid = (s) =>
  s.addStringOption((o) =>
    o
      .setName('user-id')
      .setDescription('Discord user ID of the banned person')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(24),
  );
const data = new SlashCommandBuilder()
  .setName('modcase')
  .setDescription('Private mod notes, a member moderation history, and ban appeals.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ModerateMembers)
  .addSubcommand((s) =>
    member(
      s.setName('noteadd').setDescription('Add a private mod note about a member.'),
    ).addStringOption((o) =>
      o.setName('note').setDescription('The note').setRequired(true).setMaxLength(500),
    ),
  )
  .addSubcommand((s) =>
    member(s.setName('notes').setDescription('Show private mod notes about a member.')),
  )
  .addSubcommand((s) =>
    member(s.setName('history').setDescription('Cases, warnings, notes and appeal of a member.')),
  )
  .addSubcommand((s) =>
    uid(
      s.setName('appeallog').setDescription('Record a ban appeal someone sent you.'),
    ).addStringOption((o) =>
      o.setName('text').setDescription('Their appeal').setRequired(true).setMaxLength(1000),
    ),
  )
  .addSubcommand((s) =>
    s
      .setName('appealconfig')
      .setDescription(
        'Turn the DM ban-appeal flow on or off (on by default, needs a modlog channel).',
      )
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Accept appeals by DM').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('appeals').setDescription('Show open ban appeals.'))
  .addSubcommand((s) =>
    uid(
      s
        .setName('appealaccept')
        .setDescription('Accept an appeal: unban and DM a one-use invite (owner/delegate).'),
    ),
  )
  .addSubcommand((s) =>
    uid(s.setName('appealdeny').setDescription('Deny an appeal (needs Ban Members).')),
  );
const idOf = (i) => {
  const id = (i.options.getString('user-id', true).match(/\d{17,20}/) ?? [])[0];
  if (!id || !SNOWFLAKE.test(id)) throw new UserError('mcBadId');
  return id;
};
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ModerateMembers);
    const sub = i.options.getSubcommand(),
      g = i.guildId,
      t = tr(i, c);
    if (sub === 'noteadd') {
      const u = i.options.getUser('member', true);
      c.modCase.addNote(g, u.id, i.user.id, i.options.getString('note', true));
      return say(i, c, 'mcNoteAdded', { user: `<@${u.id}>` });
    }
    if (sub === 'notes') {
      const u = i.options.getUser('member', true);
      const rows = c.modCase.notes(g, u.id).slice(0, 15);
      const list = rows
        .map((n) => `<t:${Math.floor(n.at / 1000)}:d> <@${n.by}>: ${n.text}`)
        .join('\n');
      return say(i, c, 'mcNotes', { user: `<@${u.id}>`, list: list || '-' });
    }
    if (sub === 'history') {
      const u = i.options.getUser('member', true);
      const h = c.modCase.history(g, u.id);
      const cases = h.cases.map((r) => `#${r.id} ${r.action} (${r.status})`).join(', ');
      return say(i, c, 'mcHistory', {
        user: `<@${u.id}>`,
        total: h.caseTotal,
        cases: cases || '-',
        warnings: h.warnings,
        notes: h.notes,
        appeal: h.appeal ? h.appeal.status : '-',
      });
    }
    if (sub === 'appealconfig') {
      needPerm(i, P.ManageGuild);
      const on = i.options.getBoolean('enabled', true);
      c.features.setConfig(g, 'appealcfg', APPEALS, { enabled: on });
      return say(i, c, on ? 'mcCfgOn' : 'mcCfgOff');
    }
    if (sub === 'appeals') {
      const rows = c.modCase.openAppeals(g).slice(0, 10);
      const list = rows
        .map((a) => `<@${a.userId}> (${a.userId}): ${a.text.slice(0, 200)}`)
        .join('\n');
      return say(i, c, 'mcAppeals', { list: list || '-' });
    }
    needPerm(i, P.BanMembers);
    const id = idOf(i);
    if (sub === 'appeallog') {
      c.modCase.logAppeal(g, id, i.user.id, i.options.getString('text', true));
      return say(i, c, 'mcAppealLogged', { user: id });
    }
    if (sub === 'appealdeny') {
      c.modCase.decide(g, id, 'denied', i.user.id);
      return say(i, c, 'mcAppealDenied', { user: id });
    }
    await requireSecurityAccess(i, c, 'unban');
    if (!c.modCase.appeal(g, id) || c.modCase.appeal(g, id).status !== 'open')
      throw new UserError('mcNoAppeal');
    await i.guild.members.unban(id, `Emika appeal accepted by ${i.user.id}`);
    c.modCase.decide(g, id, 'accepted', i.user.id);
    const inv = await sendUnbanInvite(i.guild, i.client, id, { t });
    return say(i, c, 'mcAppealAccepted', {
      user: id,
      invite: t('unbanInvite_' + inv.status, { link: inv.url ?? '-' }),
    });
  },
};
