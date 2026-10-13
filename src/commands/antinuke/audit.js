import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  AttachmentBuilder,
} from 'discord.js';
import { begin, say, needPerm, tr } from '../../utils/toolReply.js';
import { scoreServer, auditPerms, permsReport } from '../../services/auditTools.js';
const data = new SlashCommandBuilder()
  .setName('audit')
  .setDescription('Read-only server audit: security score and who holds dangerous permissions.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s.setName('securityscore').setDescription('Score the server out of 100 with what to fix.'),
  )
  .addSubcommand((s) =>
    s
      .setName('perms')
      .setDescription('List every role holding dangerous permissions and its members.'),
  );
export default {
  category: 'antinuke',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await begin(i);
    needPerm(i, P.ManageGuild);
    const t = tr(i, c);
    await i.guild.roles.fetch();
    if (i.options.getSubcommand() === 'securityscore') {
      const r = scoreServer(i.guild, c);
      const lines = r.checks
        .map((x) => `${x.ok ? 'OK ' : 'FIX'} (${x.weight}) ${t('auditCheck_' + x.key)}`)
        .join('\n');
      return say(i, c, 'auditScore', { score: r.score, lines });
    }
    try {
      await i.guild.members.fetch();
    } catch {
      // cached members only
    }
    const entries = auditPerms(i.guild);
    const text = permsReport(entries) || '-';
    return say(
      i,
      c,
      'auditPerms',
      { count: entries.length },
      {
        files: [
          new AttachmentBuilder(Buffer.from(text + '\n'), { name: 'emika-permissions-audit.txt' }),
        ],
      },
    );
  },
};
