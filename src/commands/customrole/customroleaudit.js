import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits as P,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('customroleaudit')
  .setDescription('Private stored self-role audit, no live role or eligibility claims.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription(
        'Manage Roles: stored creation counts by state, no owner IDs or native effects.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exportpolicy')
      .setDescription('Manage Roles: stored creation switch, gate role and mappings JSON.'),
  )
  .addSubcommand((s) =>
    s
      .setName('exportmine')
      .setDescription('Your stored role ID, name, color, state and time JSON, null if absent.'),
  );
export default {
  category: 'customrole',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand();
    if (!['summary', 'exportpolicy', 'exportmine'].includes(sub))
      throw new UserError('unknownCommand');
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      (sub !== 'exportmine' && !actor.permissions?.has(P.ManageRoles))
    )
      throw new UserError('roleActorPermission');
    const t = (k, p) => c.localization.t(i.guildId, k, p);
    let text, files;
    if (sub === 'summary') {
      const rows = c.customRoles.creationSummary(i.guildId);
      text =
        t('customAuditSummary') +
        '\n' +
        (rows.map((r) => `${r.status}: ${r.count}`).join('\n') || '0');
    } else {
      const report =
        sub === 'exportpolicy'
          ? c.customRoles.exportPolicy(i.guildId)
          : c.customRoles.exportCreation(i.guildId, i.user.id);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'exportpolicy'
              ? 'emika-custom-role-policy.json'
              : 'emika-own-role-creation.json',
        }),
      ];
      text = t(sub === 'exportpolicy' ? 'customAuditPolicy' : 'customAuditOwn');
    }
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
