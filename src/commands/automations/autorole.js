import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { autoroleManager } from '../../services/autorole.js';
import { validateSelfRole } from '../../services/rolePanels.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription(
    'Safe future-join human/bot role policies; no bulk assignment or retroactive grants.',
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild | P.ManageRoles);
for (const sub of ['add', 'remove', 'reset', 'config'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        add: 'Configure safe role for future human/bot joins, max 10 per kind; requires member events.',
        remove: 'Remove exact saved role policy; does not remove existing member roles.',
        reset: 'Clear human/bot/all policies only; existing member roles and receipts unchanged.',
        config: 'Private saved human/bot role policies; not native grants or current member proof.',
      }[sub],
    );
    if (sub !== 'config')
      s.addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Account group')
          .setRequired(true)
          .addChoices(
            ...(sub === 'reset' ? ['humans', 'bots', 'all'] : ['humans', 'bots']).map((value) => ({
              name: value,
              value,
            })),
          ),
      );
    if (sub === 'add')
      s.addRoleOption((o) =>
        o
          .setName('role')
          .setDescription('Reviewed non managed role with safe permissions')
          .setRequired(true),
      );
    if (sub === 'remove')
      s.addStringOption((o) =>
        o
          .setName('role-id')
          .setDescription('Exact stored role ID, including deleted role')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20),
      );
    return s;
  });
export default {
  category: 'automations',
  data,
  async execute(i, c) {
    let actor = await autoroleManager(i, c);
    const sub = i.options.getSubcommand();
    if (sub === 'add') {
      if (c.config.memberEventsEnabled !== true) throw new UserError('autoroleEvents');
      const kind = i.options.getString('kind', true),
        selected = i.options.getRole('role', true),
        role = await i.guild.roles.fetch(selected.id, { force: true }),
        bot = await i.guild.members.fetchMe({ force: true });
      actor = await autoroleManager(i, c);
      if (
        role?.id !== selected.id ||
        bot?.id !== i.client?.user?.id ||
        bot.guild?.id !== i.guildId ||
        !i.appPermissions?.has(P.ManageRoles)
      )
        throw new UserError('botPermission');
      validateSelfRole(role, bot, actor, i.guild);
      if (c.config.memberEventsEnabled !== true) throw new UserError('autoroleEvents');
      c.autoroles.add(i.guildId, kind, role.id, actor.id);
    } else if (sub === 'remove')
      c.autoroles.remove(
        i.guildId,
        i.options.getString('kind', true),
        i.options.getString('role-id', true),
      );
    else if (sub === 'reset') c.autoroles.reset(i.guildId, i.options.getString('kind', true));
    else if (sub !== 'config') throw new UserError('unknownCommand');
    const rows = c.autoroles
        .list(i.guildId)
        .map(({ kind, role_id }) => ({ kind, roleId: role_id })),
      locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'autoroleStatus', { count: rows.length }),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify({ records: rows }, null, 2) + '\n'), {
              name: 'emika-autorole-policy.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
