import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { createRolePanel, createMultiRolePanel } from '../../services/rolePanels.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('reactionroles')
  .setDescription('Create and manage button-based self-service role panels.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageRoles)
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Publish one role toggle button.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Safe self-service role').setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('label')
          .setDescription('Button text')
          .setMinLength(1)
          .setMaxLength(70)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => {
    s.setName('multi')
      .setDescription('Publish 2-5 independent safe role toggle buttons.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Destination')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      );
    for (let n = 1; n <= 5; n++) {
      s.addRoleOption((o) =>
        o
          .setName(`role-${n}`)
          .setDescription(`Safe role ${n}`)
          .setRequired(n <= 2),
      );
      s.addStringOption((o) =>
        o
          .setName(`label-${n}`)
          .setDescription(`Button text ${n}`)
          .setMinLength(1)
          .setMaxLength(70)
          .setRequired(n <= 2),
      );
    }
    return s;
  })
  .addSubcommand((s) => s.setName('list').setDescription('List the newest 20 panel records.'))
  .addSubcommand((s) =>
    s
      .setName('disable')
      .setDescription('Disable a panel in storage; its old button becomes inactive.')
      .addIntegerOption((o) =>
        o.setName('panel-id').setDescription('Panel ID').setMinValue(1).setRequired(true),
      ),
  );
export default {
  category: 'reactionroles',
  data,
  userPermissions: [P.ManageRoles],
  botPermissions: [P.ManageRoles],
  async execute(i, c) {
    const locale = c.localization?.locale(i.guildId) ?? 'en',
      t = (key, params) => translate(locale, key, params);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (!actor.permissions.has(P.ManageRoles)) throw new UserError('roleActorPermission');
    const sub = i.options.getSubcommand();
    let content;
    if (sub === 'create') {
      const result = await createRolePanel(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        roleId: i.options.getRole('role', true).id,
        label: i.options.getString('label', true),
      });
      content = t('rolePanelCreated', { id: result.panelId, messageId: result.messageId });
    }
    if (sub === 'multi') {
      const buttons = [];
      for (let n = 1; n <= 5; n++) {
        const role = i.options.getRole(`role-${n}`, n <= 2),
          label = i.options.getString(`label-${n}`, n <= 2);
        if (Boolean(role) !== Boolean(label)) throw new UserError('rolePanelMappingsInvalid');
        if (role) buttons.push({ roleId: role.id, label });
      }
      if (buttons.length < 2) throw new UserError('rolePanelMappingsInvalid');
      const result = await createMultiRolePanel(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        buttons,
      });
      content = t('rolePanelCreated', { id: result.panelId, messageId: result.messageId });
    }
    if (sub === 'list') {
      const panels = c.rolePanels.list(i.guildId);
      content = panels.length
        ? panels
            .map((p) => `#${p.id} | ${p.status} | role ${p.role_id} | channel ${p.channel_id}`)
            .join('\n')
            .slice(0, 1900)
        : t('rolePanelEmpty');
    }
    if (sub === 'disable') {
      const id = i.options.getInteger('panel-id', true);
      if (!c.rolePanels.get(id, i.guildId)) throw new UserError('rolePanelNotFound');
      c.rolePanels.status(id, 'disabled');
      content = t('rolePanelDisabled', { id });
    }
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
