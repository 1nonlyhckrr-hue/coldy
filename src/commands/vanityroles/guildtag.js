import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { validateSelfRole } from '../../services/rolePanels.js';
import { refreshGuildTag } from '../../services/guildTags.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('guildtag')
  .setDescription('Verified primary-guild tag reward role; manual self refresh.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('setup')
      .setDescription('Manage Roles: configure one safe tag reward role.')
      .addRoleOption((o) => o.setName('role').setDescription('Safe server role').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('show').setDescription('Show tag reward configuration.'))
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription('Manage Roles: stop tag rewards, leaving assigned roles unchanged.'),
  )
  .addSubcommand((s) =>
    s
      .setName('status')
      .setDescription('Privately inspect only your stored tag-grant state;no live identity claim.'),
  )
  .addSubcommand((s) =>
    s
      .setName('refresh')
      .setDescription('Check your current primary-guild identity and own reward role.'),
  );
export default {
  category: 'vanityroles',
  data,
  cooldownMs: 10000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p),
      locale = c.localization.locale(i.guildId);
    let text;
    if (['setup', 'reset'].includes(sub)) {
      const authorize = async () => {
        const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
        if (
          i.guild.id !== i.guildId ||
          actor?.id !== i.user.id ||
          actor.guild?.id !== i.guildId ||
          !actor.permissions?.has(P.ManageRoles)
        )
          throw new UserError('roleActorPermission');
        return actor;
      };
      await authorize();
      if (sub === 'setup') {
        const selected = i.options.getRole('role', true),
          role = await i.guild.roles.fetch(selected.id, { force: true });
        if (!role || role.id !== selected.id) throw new UserError('roleInvalid');
        const [actor, bot] = await Promise.all([
          authorize(),
          i.guild.members.fetchMe({ force: true }),
        ]);
        if (!i.client.user?.id || bot?.id !== i.client.user.id || bot.guild?.id !== i.guildId)
          throw new UserError('roleBotPermission');
        validateSelfRole(role, bot, actor, i.guild);
        c.guildTags.setup(i.guildId, role.id);
        text = t('tagSetup');
      } else {
        c.guildTags.reset(i.guildId);
        text = t('tagReset');
      }
    } else if (sub === 'show') {
      text = t('tagConfig', { role: c.guildTags.config(i.guildId)?.role_id ?? '-' });
    } else if (sub === 'status') {
      const grant = c.guildTags.grant(i.guildId, i.user.id);
      text = grant
        ? t('tagOwnStored', { role: grant.role_id, status: t('tagStored_' + grant.status) })
        : t('tagOwnNone');
    } else if (sub === 'refresh') {
      text = t(`tag_${await refreshGuildTag(i, c)}`);
    } else throw new UserError('unknownCommand');
    await i.editReply(lunaPayload({ content: text, allowedMentions: { parse: [] } }, { locale }));
  },
};
