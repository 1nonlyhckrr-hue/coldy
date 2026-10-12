import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
} from 'discord.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const trigger = (o) =>
  o
    .setName('trigger')
    .setDescription('Literal trigger, case-insensitive')
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true);
const response = (o) =>
  o
    .setName('response')
    .setDescription('Response text; mentions are disabled')
    .setMinLength(1)
    .setMaxLength(1800)
    .setRequired(true);
const data = new SlashCommandBuilder()
  .setName('autoresponder')
  .setDescription('Manage server autoresponders.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('deliveryoverview')
      .setDescription(
        'Private stored receipt counts per rule/state, not current delivery or recovery.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exportreceipts')
      .setDescription(
        'Private latest 100 receipt metadata JSON, total/truncation, no message IDs or text.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disablemode')
      .setDescription(
        'Pause enabled exact or keyword rules; in-flight sends may finish, history kept.',
      )
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('Stored match mode to pause')
          .addChoices({ name: 'Exact', value: 'exact' }, { name: 'Keyword', value: 'keyword' })
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm pausing all enabled rules in this mode')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('create')
      .setDescription('Create an exact or literal keyword trigger.')
      .addStringOption(trigger)
      .addStringOption(response)
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('Matching mode')
          .addChoices(
            { name: 'Exact message', value: 'exact' },
            { name: 'Keyword phrase', value: 'keyword' },
          ),
      )
      .addIntegerOption((o) =>
        o
          .setName('cooldown')
          .setDescription('Server-wide trigger cooldown in seconds')
          .setMinValue(10)
          .setMaxValue(3600),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('edit')
      .setDescription('Edit the response for an existing trigger.')
      .addStringOption(trigger)
      .addStringOption(response),
  )
  .addSubcommand((s) =>
    s.setName('delete').setDescription('Delete an existing trigger.').addStringOption(trigger),
  )
  .addSubcommand((s) =>
    s
      .setName('mode')
      .setDescription(
        'Set literal exact/keyword matching, retaining response/cooldown/replay history.',
      )
      .addStringOption(trigger)
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('Literal matching only, no regex')
          .addChoices(
            { name: 'Exact message', value: 'exact' },
            { name: 'Keyword phrase', value: 'keyword' },
          )
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('cooldown')
      .setDescription(
        'Change one stored trigger cooldown 10-3600 s; last-send/replay history retained.',
      )
      .addStringOption(trigger)
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('Elapsed seconds from retained last send')
          .setRequired(true)
          .setMinValue(10)
          .setMaxValue(3600),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('toggle')
      .setDescription('Pause/resume one trigger, retaining response/cooldown/history.')
      .addStringOption(trigger)
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Allow automatic responses from this trigger')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('disableall')
      .setDescription(
        'Pause all stored guild triggers; in-flight responses may finish, history retained.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm disabling all currently enabled guild triggers')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('preview')
      .setDescription('Privately preview stored response, no send or cooldown change.')
      .addStringOption(trigger),
  )
  .addSubcommand((s) =>
    s
      .setName('rename')
      .setDescription('Change one stored trigger while preserving response and replay history.')
      .addStringOption((o) =>
        o
          .setName('trigger')
          .setDescription('Existing literal trigger')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('new-trigger')
          .setDescription('New literal trigger')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clone')
      .setDescription(
        'Copy response/mode/cooldown into a new paused rule; no send or replay history copy.',
      )
      .addStringOption((o) =>
        o
          .setName('trigger')
          .setDescription('Existing literal trigger')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('new-trigger')
          .setDescription('New unique literal trigger')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('info')
      .setDescription(
        'Privately inspect one stored trigger settings and response; no native delivery.',
      )
      .addStringOption((o) =>
        o
          .setName('trigger')
          .setDescription('Existing literal trigger')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('deleteall')
      .setDescription(
        'Delete all guild response rules; retained replay receipts kept, no message deletion.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm deleting all stored rules/responses here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription('Private JSON of guild rule text/settings, no receipts or automatic enable.'),
  )
  .addSubcommand((s) =>
    s
      .setName('import')
      .setDescription('Atomically add 1-10 unique rules from JSON, all paused; no automatic send.')
      .addStringOption((o) =>
        o
          .setName('json')
          .setDescription('Array of trigger, response, mode, cooldown Seconds; 4000 characters max')
          .setMinLength(2)
          .setMaxLength(4000)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm adding the supplied rules in paused state')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('dryrun')
      .setDescription('Private literal-match diagnostic, no content storage/send/cooldown change.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Example message, not stored or sent')
          .setMinLength(1)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('replace')
      .setDescription(
        'Replace 1-10 existing rule settings atomically; pause them, retain IDs/replay/cooldowns.',
      )
      .addStringOption((o) =>
        o
          .setName('json')
          .setDescription('Strict rule array, 4000 chars; every trigger must exist here')
          .setMaxLength(4000)
          .setMinLength(2)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm replacing settings and pausing these rules')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('deletepaused')
      .setDescription(
        'Delete paused rule text/settings only; retain enabled rules and all replay receipts.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm deleting every paused rule here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('cooldownall')
      .setDescription('Set all stored rule cooldowns; last-send/replay/enable states kept.')
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('10-3600 seconds from each retained last-send time')
          .setMinValue(10)
          .setMaxValue(3600)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm setting every rule cooldown here')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('stats')
      .setDescription('Private stored rule/receipt counts only; not live delivery or readiness.'),
  )
  .addSubcommand((s) =>
    s
      .setName('config')
      .setDescription('List stored trigger configuration, optionally filtered by enabled state.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(5),
      )
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Filter stored triggers before pagination; omit for all'),
      ),
  );
export default {
  category: 'autoresponder',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    const locale = c.guildConfig.get(i.guildId).language,
      t = (k, p) => translate(locale, k, p);
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      i.guild.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      !actor.permissions.has(P.ManageGuild)
    )
      throw new UserError('userPermission');
    const sub = i.options.getSubcommand();
    if (
      ![
        'create',
        'edit',
        'delete',
        'config',
        'preview',
        'toggle',
        'cooldown',
        'mode',
        'rename',
        'disableall',
        'stats',
        'clone',
        'info',
        'deleteall',
        'export',
        'import',
        'dryrun',
        'replace',
        'deletepaused',
        'cooldownall',
        'deliveryoverview',
        'exportreceipts',
        'disablemode',
      ].includes(sub)
    )
      throw new UserError('unknownCommand');
    let text, files;
    if (sub === 'deliveryoverview' || sub === 'exportreceipts') {
      const report =
        sub === 'deliveryoverview'
          ? c.autoresponders.deliveryOverview(i.guildId)
          : c.autoresponders.exportReceipts(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(report, null, 2) + '\n', 'utf8'), {
          name:
            sub === 'deliveryoverview'
              ? 'emika-responder-delivery-overview.json'
              : 'emika-responder-receipts.json',
        }),
      ];
      text = t(
        sub === 'deliveryoverview' ? 'responderDeliveryOverview' : 'responderReceiptsExport',
      );
    }
    if (sub === 'disablemode') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('responderConfirmRequired');
      text = t('responderModeDisabled', {
        count: c.autoresponders.disableMode(i.guildId, i.options.getString('mode', true)),
      });
    }
    if (['replace', 'deletepaused', 'cooldownall'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('responderConfirmRequired');
      const count =
        sub === 'replace'
          ? c.autoresponders.replaceRules(i.guildId, i.options.getString('json', true))
          : sub === 'deletepaused'
            ? c.autoresponders.deletePaused(i.guildId)
            : c.autoresponders.cooldownAll(i.guildId, i.options.getInteger('seconds', true));
      text = t(
        sub === 'replace'
          ? 'responderReplaced'
          : sub === 'deletepaused'
            ? 'responderPausedDeleted'
            : 'responderAllCooldown',
        { count },
      );
    }
    if (sub === 'export') {
      const rows = c.autoresponders.exportRules(i.guildId);
      files = [
        new AttachmentBuilder(Buffer.from(JSON.stringify(rows, null, 2) + '\n', 'utf8'), {
          name: 'emika-autoresponders.json',
        }),
      ];
      text = t('responderExported', { count: rows.length });
    }
    if (sub === 'import') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('responderConfirmRequired');
      text = t('responderImported', {
        count: c.autoresponders.importRules(i.guildId, i.options.getString('json', true)),
      });
    }
    if (sub === 'dryrun') {
      const r = c.autoresponders.dryRun(i.guildId, i.options.getString('text', true));
      text =
        t('responderDryHeader', { chosen: r.chosen ?? '-' }) +
        '\n' +
        (r.matches
          .map((row) =>
            t('responderDryRow', {
              id: row.id,
              mode: row.mode,
              state: t('responderDry_' + row.state),
            }),
          )
          .join('\n') || t('responderEmpty'));
    }

    if (sub === 'clone') {
      const id = c.autoresponders.clone(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getString('new-trigger', true),
      );
      text = t('responderCloned', { id });
    }
    if (sub === 'deleteall') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('responderConfirmRequired');
      text = t('responderDeletedAll', { count: c.autoresponders.deleteAll(i.guildId) });
    }
    if (sub === 'info') {
      const row = c.autoresponders.find(i.guildId, i.options.getString('trigger', true));
      if (!row) throw new UserError('responderNotFound');
      text =
        t('responderInfo', {
          id: row.id,
          mode: row.mode,
          seconds: row.cooldown_seconds,
          status: t(row.enabled ? 'enabled' : 'disabled'),
        }) +
        '\n' +
        row.response;
    }
    if (sub === 'create') {
      if (c.config.messageEventsEnabled !== true) throw new UserError('responderRuntimeDisabled');
      const id = c.autoresponders.create(i.guildId, {
        trigger: i.options.getString('trigger', true),
        response: i.options.getString('response', true),
        mode: i.options.getString('mode') ?? 'exact',
        cooldownSeconds: i.options.getInteger('cooldown') ?? 60,
      });
      text = t('responderCreated', { id });
    }
    if (sub === 'disableall') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('responderConfirmRequired');
      const count = c.autoresponders.disableAll(i.guildId);
      text = t('responderDisabledAll', { count });
    }
    if (sub === 'rename') {
      c.autoresponders.rename(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getString('new-trigger', true),
      );
      text = t('responderRenamed');
    }
    if (sub === 'mode') {
      c.autoresponders.setMode(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getString('mode', true),
      );
      text = t('responderModeSaved');
    }
    if (sub === 'cooldown') {
      c.autoresponders.setCooldown(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getInteger('seconds', true),
      );
      text = t('responderCooldownSaved');
    }
    if (sub === 'toggle') {
      c.autoresponders.setEnabled(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getBoolean('enabled', true),
      );
      text = t('responderToggleSaved');
    }
    if (sub === 'edit') {
      c.autoresponders.edit(
        i.guildId,
        i.options.getString('trigger', true),
        i.options.getString('response', true),
      );
      text = t('responderEdited');
    }
    if (sub === 'delete') {
      c.autoresponders.delete(i.guildId, i.options.getString('trigger', true));
      text = t('responderDeleted');
    }
    if (sub === 'preview') {
      const row = c.autoresponders.find(i.guildId, i.options.getString('trigger', true));
      if (!row) throw new UserError('responderNotFound');
      text = row.response;
    }
    if (sub === 'stats') {
      const { rules, deliveries } = c.autoresponders.stats(i.guildId);
      const count = (predicate) => rules.filter(predicate).reduce((n, r) => n + r.count, 0);
      const receipt = (status) => deliveries.find((r) => r.status === status)?.count ?? 0;
      text = t('responderStats', {
        total: count(() => true),
        enabled: count((r) => r.enabled === 1),
        paused: count((r) => r.enabled === 0),
        exact: count((r) => r.mode === 'exact'),
        keyword: count((r) => r.mode === 'keyword'),
        reserved: receipt('reserved'),
        sent: receipt('sent'),
        uncertain: receipt('uncertain'),
      });
    }
    if (sub === 'config') {
      const rows = c.autoresponders.list(i.guildId, {
          enabled: i.options.getBoolean?.('enabled') ?? null,
        }),
        pages = Math.max(1, Math.ceil(rows.length / 10)),
        page = i.options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > pages)
        throw new UserError('responderPageInvalid', { pages });
      text = t('responderConfig', {
        page,
        pages,
        count: rows.length,
        runtime: t(c.config.messageEventsEnabled === true ? 'enabled' : 'disabled'),
      });
      text +=
        '\n' +
        (rows
          .slice((page - 1) * 10, page * 10)
          .map(
            (r) =>
              `#${r.id} | ${r.trigger} | ${r.mode} | ${r.cooldown_seconds}s | ${t(r.enabled === 1 ? 'enabled' : 'disabled')}`,
          )
          .join('\n') || t('responderEmpty'));
    }
    await i.reply(
      lunaPayload(
        {
          content: text,
          ...(files ? { files } : {}),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
        { locale },
      ),
    );
  },
};
