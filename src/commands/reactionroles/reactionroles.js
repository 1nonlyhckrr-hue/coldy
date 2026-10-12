import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import {
  createRolePanel,
  createMultiRolePanel,
  reconcileRoleClick,
} from '../../services/rolePanels.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('reactionroles')
  .setDescription('Create and manage button-based self-service role panels.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageRoles)
  .addSubcommand((s) =>
    s
      .setName('summary')
      .setDescription('Private stored panel counts by state, no native readiness or effects.'),
  )
  .addSubcommand((s) =>
    s
      .setName('clicksummary')
      .setDescription(
        'Private retained role-click counts by state/action, no member or source IDs.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('channelrecords')
      .setDescription(
        'Private latest 100 complete bindings/mappings for stored channel ID, no click receipts.',
      )
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact stored channel ID, no native existence claim')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      ),
  )
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
  .addSubcommand((s) =>
    s
      .setName('inspect')
      .setDescription('Privately inspect stored panel mappings, status and binding IDs only.')
      .addIntegerOption((o) =>
        o.setName('panel-id').setDescription('Stored panel ID').setMinValue(1).setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('receipts')
      .setDescription('Privately inspect ten unresolved stored role clicks for one member.')
      .addUserOption((o) =>
        o
          .setName('member')
          .setDescription('Member whose stored clicks to inspect')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('reconcileclick')
      .setDescription(
        'Resolve a directed uncertain receipt only when observed role state matches intent.',
      )
      .addStringOption((o) =>
        o
          .setName('interaction-id')
          .setDescription('Exact stored receipt identity')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm observed-state reconciliation, no role effect or retry')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('List ten complete panel records per page, newest 100 maximum.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page 1-10').setMinValue(1).setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('state')
          .setDescription('Only stored state, not live native message/role readiness')
          .addChoices(
            ...['pending', 'active', 'disabled', 'uncertain'].map((value) => ({
              name: value,
              value,
            })),
          ),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disableactive')
      .setDescription(
        'Confirm disabling active panels in storage only; pending/uncertain untouched.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stopping active role-panel buttons here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription(
        'Private latest 100 stored panel bindings/button mappings; no member or click receipts.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disablechannel')
      .setDescription(
        'Disable active panels for one stored channel ID; no native edits or role changes.',
      )
      .addStringOption((o) =>
        o
          .setName('channel-id')
          .setDescription('Exact stored channel ID, even if channel departed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stopping active panels for this channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disablerole')
      .setDescription(
        'Disable entire active panels containing one role ID; no native edits or role changes.',
      )
      .addStringOption((o) =>
        o
          .setName('role-id')
          .setDescription('Exact stored role ID, even if role departed')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm disabling whole panels containing this role')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disable')
      .setDescription('Disable a panel in storage; its old button becomes inactive.')
      .addIntegerOption((o) =>
        o.setName('panel-id').setDescription('Panel ID').setMinValue(1).setRequired(true),
      ),
  );
for (const [name, desc] of [
  [
    'exportmetadata',
    'Export up to 100 panel metadata records; total and truncation, no role/source IDs or labels.',
  ],
  [
    'exportclicks',
    'Private latest 100 click state/action/time JSON, total/truncation, no member/role/source IDs.',
  ],
  [
    'channelcounts',
    'Private stored panel counts by channel ID/state, no member/role/source IDs or native validation.',
  ],
])
  data.addSubcommand((s) => s.setName(name).setDescription(desc));
data.addSubcommand((s) =>
  s
    .setName('inspectmetadata')
    .setDescription(
      'Exact stored panel ID minimal metadata JSON/null, no role/member/message/source IDs/labels.',
    )
    .addIntegerOption((o) =>
      o
        .setName('id')
        .setDescription('Exact stored panel ID')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(Number.MAX_SAFE_INTEGER),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('channelmetadata')
    .setDescription(
      'Latest 100 minimal panel metadata for exact stored channel ID, no roles/labels/native lookup.',
    )
    .addStringOption((o) =>
      o
        .setName('channel-id')
        .setDescription('Exact 17-20 digit stored channel ID')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportunresolved')
    .setDescription(
      'Latest 100 pending/uncertain minimal panel metadata, no retry/repair/native existence proof.',
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
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions.has(P.ManageRoles)
    )
      throw new UserError('roleActorPermission');
    const sub = i.options.getSubcommand();
    let content, files;
    if (['inspectmetadata', 'channelmetadata', 'exportunresolved'].includes(sub)) {
      const report = c.rolePanels.scopedMetadata(
        i.guildId,
        { inspectmetadata: 'id', channelmetadata: 'channel', exportunresolved: 'unresolved' }[sub],
        sub === 'inspectmetadata'
          ? i.options.getInteger('id', true)
          : sub === 'channelmetadata'
            ? i.options.getString('channel-id', true)
            : null,
      );
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-role-' + sub + '.json',
        }),
      ];
      content = t('panelScopedMetadata');
    }
    if (['exportmetadata', 'exportclicks', 'channelcounts'].includes(sub)) {
      const report =
        sub === 'exportmetadata'
          ? c.rolePanels.exportMetadata(i.guildId)
          : sub === 'exportclicks'
            ? c.rolePanels.exportClicks(i.guildId)
            : c.rolePanels.channelCounts(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-role-' + sub + '.json',
        }),
      ];
      content = t('panelMinimalMetadata');
    }
    if (['summary', 'clicksummary', 'channelrecords'].includes(sub)) {
      const report =
        sub === 'summary'
          ? c.rolePanels.summary(i.guildId)
          : sub === 'clicksummary'
            ? c.rolePanels.clickSummary(i.guildId)
            : c.rolePanels.channelRecords(i.guildId, i.options.getString('channel-id', true));
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'summary'
              ? 'emika-panel-summary.json'
              : sub === 'clicksummary'
                ? 'emika-role-click-summary.json'
                : 'emika-channel-panels.json',
        }),
      ];
      content = t(
        sub === 'summary'
          ? 'panelAuditSummary'
          : sub === 'clicksummary'
            ? 'panelClickSummary'
            : 'panelChannelRecords',
      );
    }
    if (sub === 'export') {
      const report = c.rolePanels.exportMappings(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-role-panels.json',
        }),
      ];
      content = t('rolePanelExported', {
        count: report.panels.length,
        total: report.total,
        truncated: t(report.truncated ? 'enabled' : 'disabled'),
      });
    }
    if (['disablechannel', 'disablerole'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('rolePanelDisableActiveConfirm');
      const kind = sub === 'disablechannel' ? 'channel' : 'role',
        id = i.options.getString(kind + '-id', true);
      content = t('rolePanelScopedDisabled', {
        count: c.rolePanels.disableFor(i.guildId, kind, id),
      });
    }
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
    if (sub === 'inspect') {
      const panel = c.rolePanels.get(i.options.getInteger('panel-id', true), i.guildId);
      if (!panel) throw new UserError('rolePanelNotFound');
      content =
        t('rolePanelInspect', {
          id: panel.id,
          status: panel.status,
          channel: panel.channel_id,
          message: panel.message_id ?? '-',
        }) +
        '\n' +
        c.rolePanels
          .buttons(panel.id)
          .map((b) => `${b.button_index}: ${escapeMarkdown(b.label)} | ${b.role_id}`)
          .join('\n');
    }
    if (sub === 'receipts') {
      const rows = c.rolePanels.unresolvedClicks(i.guildId, i.options.getUser('member', true).id);
      content = rows.length
        ? t('roleClickReceipts') +
          '\n' +
          rows
            .map(
              (r) =>
                `${r.interaction_id} | ${r.role_id} | ${r.status} | ${t('roleClickAction_' + r.action)}`,
            )
            .join('\n')
        : t('roleClickReceiptsEmpty');
    }
    if (sub === 'reconcileclick') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('roleClickReconcileConfirm');
      const id = i.options.getString('interaction-id', true);
      if (
        typeof id !== 'string' ||
        id.length < 1 ||
        id.length > 100 ||
        /[\u0000-\u001f\u007f]/u.test(id)
      )
        throw new UserError('roleClickReconcileBlocked');
      await reconcileRoleClick(i, c, id);
      content = t('roleClickReconciled');
    }
    if (sub === 'list') {
      const page = i.options.getInteger('page') ?? 1,
        panels = c.rolePanels.list(i.guildId, page, {
          state: i.options.getString?.('state') ?? null,
        });
      content =
        t('rolePanelListHeader', { page }) +
        '\n' +
        (panels
          .map(
            (p) => `#${p.id} | ${t('rolePanelState_' + p.status)} | ${p.role_id} | ${p.channel_id}`,
          )
          .join('\n') || t('rolePanelEmpty'));
    }
    if (sub === 'disableactive') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('rolePanelDisableActiveConfirm');
      content = t('rolePanelActiveDisabled', { n: c.rolePanels.disableActive(i.guildId) });
    }
    if (sub === 'disable') {
      const id = i.options.getInteger('panel-id', true);
      if (!c.rolePanels.get(id, i.guildId)) throw new UserError('rolePanelNotFound');
      c.rolePanels.status(id, 'disabled');
      content = t('rolePanelDisabled', { id });
    }
    await i.editReply(
      lunaPayload(
        { content, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
