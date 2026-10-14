import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { validatePunishRole, releaseQuarantine } from '../../services/antinuke.js';
import { validateOutputChannel } from '../../services/guildConfig.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Opt-in audit alerts and automatic quarantine; no rollback.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('enable')
      .setDescription('Enable audit detection and supported automatic quarantine.')
      .addChannelOption((o) =>
        o.setName('channel').setDescription('Moderator alert channel').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('disable').setDescription('Stop audit monitoring and automatic quarantine.'),
  )
  .addSubcommand((s) =>
    s
      .setName('threshold')
      .setDescription('Set mixed-action count and observation window.')
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('2-20 actions')
          .setMinValue(2)
          .setMaxValue(20)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('10-300 seconds')
          .setMinValue(10)
          .setMaxValue(300)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('trust')
      .setDescription('Exempt a current member from audit alerts and quarantine.')
      .addUserOption((o) =>
        o.setName('member').setDescription('Current server member').setRequired(true),
      )
      .addBooleanOption((o) =>
        o.setName('trusted').setDescription('Audit and quarantine exemption').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('punishrole')
      .setDescription('Choose the role given by auto-quarantine; leave empty for the default.')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to apply, below Emika, not managed'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('tamperhold')
      .setDescription(
        'Opt in or out: re-apply quarantine if it is removed or edited (default off).',
      )
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Turn tamper-hold on or off').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('release')
      .setDescription('Release a quarantined member and give back the roles that were removed.')
      .addUserOption((o) =>
        o.setName('member').setDescription('Quarantined member').setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show alert settings and limitations.'))
  .addSubcommand((s) =>
    s
      .setName('unresolved')
      .setDescription('Privately inspect stored unresolved alert metadata;no retry or punishment.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Oldest-first page 1-10').setMinValue(1).setMaxValue(10),
      ),
  )
  .addSubcommand((s) =>
    s.setName('incidents').setDescription('Show20 recent stored audit burst alerts.'),
  );
data
  .addSubcommand((s) =>
    s
      .setName('exportpolicy')
      .setDescription(
        'Private storedalert config/trustedIDs JSON,not audit history/preventionproof.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resetpolicy')
      .setDescription(
        'Confirmed stopalerts/forgetdestination/trust/defaultthresholds,receipts kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm resetting all stored alert settings here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('removetrust')
      .setDescription(
        'Confirmed remove one exactstored trustedID,including departedusers,not nativeaccess.',
      )
      .addStringOption((o) =>
        o
          .setName('user-id')
          .setDescription('ExactstoreduserID17-20digits')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing this stored alert exemption')
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('importpolicy')
    .setDescription(
      'Replace stored alert policy from strict JSON,force disabled,no native actions.',
    )
    .addStringOption((o) =>
      o
        .setName('json')
        .setDescription('Policy object4000chars max;stored IDs not live verified')
        .setMinLength(2)
        .setMaxLength(4000)
        .setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm replacing alert policy and disabling monitoring')
        .setRequired(true),
    ),
);
for (const name of ['cleartrust', 'clearchannel'])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(
        name === 'cleartrust'
          ? 'Clear all stored user exemptions;owner/bot exemptions kept,alert-only.'
          : 'Stop monitoring and forget alert destination;threshold/trust/history kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm this stored alert-policy change')
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('trustlist')
    .setDescription('Private stored trusteduser IDs only,no native membership/permission claim.'),
);
data.addSubcommand((s) =>
  s
    .setName('summary')
    .setDescription(
      'Private retained incident counts by state,no actor/source IDs or protection claim.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('actioncounts')
    .setDescription(
      'Private retained alert-incident counts by audit action/state,not all audit events.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportincidents')
    .setDescription(
      'Private latest100 minimalincidentmetadata JSON,total/truncation,no actor/sourceIDs.',
    ),
);
data.addSubcommand((s) =>
  s
    .setName('inspectincident')
    .setDescription(
      'ExactstoredincidentID minimalmetadataJSON/null,no actor/auditentryIDs or native lookup.',
    )
    .addIntegerOption((o) =>
      o
        .setName('id')
        .setDescription('ExactstoredincidentID')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(Number.MAX_SAFE_INTEGER),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('actionincidents')
    .setDescription(
      'Latest100retainedincidents forwatchedauditactionJSON,total/truncation,no actors/sourceIDs.',
    )
    .addIntegerOption((o) =>
      o
        .setName('action')
        .setDescription('WatchednumericDiscordauditaction,not arbitrary codes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('exportunresolved')
    .setDescription(
      'Latest100recorded/uncertain/unavailable metadataJSON;not replay,retry or prevention.',
    ),
);
export default {
  category: 'antinuke',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const authorize = async () => {
      const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        i.guild.id !== i.guildId ||
        actor?.id !== i.user.id ||
        actor.guild?.id !== i.guildId ||
        !actor.permissions?.has(P.ManageGuild)
      )
        throw new UserError('userPermission');
    };
    await authorize();
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      locale = c.localization.locale(i.guildId),
      sub = i.options.getSubcommand();
    let text, files;
    if (['inspectincident', 'actionincidents', 'exportunresolved'].includes(sub)) {
      const report =
        sub === 'inspectincident'
          ? c.antinuke.inspectIncident(i.guildId, i.options.getInteger('id', true))
          : c.antinuke.scopedIncidents(
              i.guildId,
              sub === 'actionincidents'
                ? { action: i.options.getInteger('action', true) }
                : { recovery: true },
            );
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name: 'emika-audit-' + sub + '.json',
        }),
      ];
      text = t('antinukeScopedMetadata');
    } else if (['summary', 'actioncounts', 'exportincidents'].includes(sub)) {
      const report =
        sub === 'summary'
          ? c.antinuke.summary(i.guildId)
          : sub === 'actioncounts'
            ? c.antinuke.actionCounts(i.guildId)
            : c.antinuke.exportIncidents(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'summary'
              ? 'emika-audit-alert-summary.json'
              : sub === 'actioncounts'
                ? 'emika-audit-action-counts.json'
                : 'emika-audit-incidents.json',
        }),
      ];
      text = t('antinukeIncidentExport');
    } else if (['importpolicy', 'cleartrust', 'clearchannel'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('antinukeResetConfirm');
      if (sub === 'importpolicy') {
        c.antinuke.importPolicy(i.guildId, i.options.getString('json', true));
        text = t('antinukePolicyImported');
      } else if (sub === 'cleartrust')
        text = t('antinukeTrustCleared', { count: c.antinuke.clearTrust(i.guildId) });
      else {
        c.antinuke.clearChannel(i.guildId);
        text = t('antinukeChannelCleared');
      }
    } else if (sub === 'trustlist') {
      const ids = c.antinuke.get(i.guildId).trustedUsers;
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify({ trustedUserIds: ids }, null, 2) + '\n', 'utf8'),
          { name: 'emika-antinuke-trusted-ids.json' },
        ),
      ];
      text = t('antinukeTrustExported', { count: ids.length });
    } else if (sub === 'exportpolicy') {
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify(c.antinuke.get(i.guildId), null, 2) + '\n', 'utf8'),
          { name: 'emika-audit-alert-policy.json' },
        ),
      ];
      text = t('antinukePolicyExported');
    } else if (sub === 'resetpolicy') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('antinukeResetConfirm');
      c.antinuke.resetPolicy(i.guildId);
      text = t('antinukePolicyReset');
    } else if (sub === 'removetrust') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('antinukeResetConfirm');
      text = t('antinukeTrustRemoved', {
        count: c.antinuke.removeTrust(i.guildId, i.options.getString('user-id', true)),
      });
    } else if (sub === 'enable') {
      if (c.config.auditEventsEnabled !== true) throw new UserError('antinukeRuntimeDisabled');
      const channel = await validateOutputChannel(
        i.guild,
        i.options.getChannel('channel', true).id,
      );
      await authorize();
      const bot = await i.guild.members.fetchMe({ force: true });
      if (
        !i.guild.client?.user?.id ||
        bot?.id !== i.guild.client.user.id ||
        bot.guild?.id !== i.guildId ||
        !bot.permissions?.has(P.ViewAuditLog)
      )
        throw new UserError('antinukeBotPermission');
      await authorize();
      if (c.config.auditEventsEnabled !== true) throw new UserError('antinukeRuntimeDisabled');
      c.antinuke.patch(i.guildId, { enabled: true, channelId: channel.id });
      text = t('antinukeEnabled');
    } else if (sub === 'disable') {
      c.antinuke.patch(i.guildId, { enabled: false });
      text = t('antinukeDisabled');
    } else if (sub === 'threshold') {
      c.antinuke.patch(i.guildId, {
        threshold: i.options.getInteger('count', true),
        windowSeconds: i.options.getInteger('seconds', true),
      });
      text = t('antinukeSaved');
    } else if (sub === 'trust') {
      const selected = i.options.getUser('member', true),
        trusted = i.options.getBoolean('trusted', true);
      if (trusted) {
        const member = await i.guild.members.fetch({ user: selected.id, force: true });
        if (!member || member.id !== selected.id || member.guild?.id !== i.guildId)
          throw new UserError('antinukeUserInvalid');
      }
      await authorize();
      c.antinuke.trust(i.guildId, selected.id, trusted);
      text = t('antinukeSaved');
    } else if (sub === 'punishrole') {
      const chosen = i.options.getRole('role');
      if (chosen) {
        const bot = i.guild.members.me ?? (await i.guild.members.fetchMe());
        const role = await i.guild.roles.fetch(chosen.id, { force: true });
        validatePunishRole(role, bot, i.guild);
      }
      await authorize();
      c.antinuke.setPunishRole(i.guildId, chosen?.id ?? null);
      text = t('antinukeSaved');
    } else if (sub === 'tamperhold') {
      await requireSecurityAccess(i, c, 'antinuke');
      await authorize();
      c.antinuke.setTamperHold(i.guildId, i.options.getBoolean('enabled', true));
      text = t('antinukeSaved');
    } else if (sub === 'release') {
      const user = i.options.getUser('member', true);
      await requireSecurityAccess(i, c, 'antinuke');
      await authorize();
      const out = await releaseQuarantine(i.guild, c.antinuke, user.id);
      text = t(out.gone ? 'antinukeReleaseGone' : 'antinukeReleased', {
        member: user.id,
        restored: out.restored,
        skipped: out.skipped,
      });
    } else if (sub === 'config') {
      const cfg = c.antinuke.get(i.guildId);
      text = t('antinukeConfig', {
        status: t(cfg.enabled ? 'enabled' : 'disabled'),
        count: cfg.threshold,
        window: cfg.windowSeconds,
        channel: cfg.channelId ?? '-',
        trusted: cfg.trustedUsers.join(', ') || '-',
        hold: t(cfg.quarantine.tamperHold ? 'enabled' : 'disabled'),
        quarantine: cfg.quarantine.enabled
          ? cfg.quarantine.punishRoleId
            ? `<@&${cfg.quarantine.punishRoleId}>`
            : 'Quarantine'
          : t('disabled'),
      });
    } else if (sub === 'unresolved') {
      const page = i.options.getInteger('page') ?? 1,
        rows = c.antinuke.unresolved(i.guildId, page);
      text =
        t('antinukeUnresolved', { page }) +
        '\n' +
        (rows
          .map(
            (r) =>
              `#${r.id} | ${r.actor_id} | ${r.event_count} | ${t('antinukeState_' + r.status)}`,
          )
          .join('\n') || t('antinukeEmpty'));
    } else if (sub === 'incidents') {
      const rows = c.antinuke.incidents(i.guildId);
      text =
        t('antinukeIncidents') +
        '\n' +
        (rows.map((r) => `#${r.id} | ${r.actor_id} | ${r.event_count} | ${r.status}`).join('\n') ||
          t('antinukeEmpty'));
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
