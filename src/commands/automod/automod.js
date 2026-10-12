import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  ChannelType,
  escapeMarkdown,
} from 'discord.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const ruleNames = ['words', 'invites', 'links', 'mentions', 'caps', 'spam'];
const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Configure server-owned message moderation rules.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName('enable')
      .setDescription('Enable configured rules; all rules start disabled.')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Warning record or message deletion')
          .addChoices(
            { name: 'Record warning', value: 'warn' },
            { name: 'Delete message', value: 'delete' },
            { name: 'Timeout1-60 minutes', value: 'timeout' },
          )
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm-timeout')
          .setDescription('Required true when choosing automatic member timeout'),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('timeoutminutes')
      .setDescription('Set automatic timeout duration1-60 minutes;does not enable rules.')
      .addIntegerOption((o) =>
        o
          .setName('minutes')
          .setDescription('Duration minutes')
          .setMinValue(1)
          .setMaxValue(60)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('disable').setDescription('Stop automatic message moderation.'))
  .addSubcommand((s) =>
    s
      .setName('rule')
      .setDescription('Enable or disable one rule.')
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription('Rule')
          .addChoices(...ruleNames.map((value) => ({ name: value, value })))
          .setRequired(true),
      )
      .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('spamthresholds')
      .setDescription('Tune bounded spam counts/window;does not enable moderation.')
      .addIntegerOption((o) =>
        o
          .setName('messages')
          .setDescription('3-10 total messages per window')
          .setMinValue(3)
          .setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o
          .setName('repeats')
          .setDescription('2-10 identical normalized messages per window')
          .setMinValue(2)
          .setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o
          .setName('seconds')
          .setDescription('Rolling window5-30seconds')
          .setMinValue(5)
          .setMaxValue(30),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('wordadd')
      .setDescription('Add a literal word/phrase to the filter.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literal phrase, no regex')
          .setMinLength(1)
          .setMaxLength(50)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('wordremove')
      .setDescription('Remove a literal filtered word/phrase.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literal phrase')
          .setMinLength(1)
          .setMaxLength(50)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('exempt')
      .setDescription('Add or remove an exempt server role.')
      .addRoleOption((o) => o.setName('role').setDescription('Staff exemption').setRequired(true))
      .addBooleanOption((o) =>
        o.setName('enabled').setDescription('Exemption enabled').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('ignorechannel')
      .setDescription('Ignore/unignore one channel for automatic message moderation.')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Server text/announcement/thread channel')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          )
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('Exclude this exact channel,no parent inheritance')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('removepolicy')
      .setDescription(
        'Remove one stored ignored channel/exempt role ID,including deleted subjects.',
      )
      .addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Stored policy kind')
          .addChoices(
            { name: 'ignored channel', value: 'channel' },
            { name: 'exempt role', value: 'role' },
          )
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName('subject-id')
          .setDescription('Exact stored channel/role ID')
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removal of this one stored policy')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('testtext')
      .setDescription('Private dry-run of literal/caps/link rules,no punishment or spam tracking.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Sample text,no real message fetched or saved')
          .setMinLength(1)
          .setMaxLength(1800)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('thresholds')
      .setDescription('Tune mention/caps thresholds;does not enable rules or moderation.')
      .addIntegerOption((o) =>
        o
          .setName('mentions')
          .setDescription('Unique user/role mentions2-20')
          .setMinValue(2)
          .setMaxValue(20),
      )
      .addIntegerOption((o) =>
        o
          .setName('caps-percent')
          .setDescription('Uppercase percentage must exceed this50-100')
          .setMinValue(50)
          .setMaxValue(100),
      )
      .addIntegerOption((o) =>
        o
          .setName('caps-letters')
          .setDescription('Minimum letters10-100')
          .setMinValue(10)
          .setMaxValue(100),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('wordlist')
      .setDescription('Privately inspect twenty stored literal phrases per page.')
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Page1-5').setMinValue(1).setMaxValue(5),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('stats')
      .setDescription('Private aggregate stored incident outcomes;no content,IDs or retries.'),
  )
  .addSubcommand((s) => s.setName('config').setDescription('Show configured rules and limits.'))
  .addSubcommand((s) =>
    s
      .setName('unresolved')
      .setDescription(
        'Privately inspect unresolved stored incident metadata;never retries actions.',
      )
      .addIntegerOption((o) =>
        o.setName('page').setDescription('Oldest-first page1-10').setMinValue(1).setMaxValue(10),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('incidents')
      .setDescription('Show 20 recent stored outcomes,optionally filtered,no message content.')
      .addStringOption((o) =>
        o
          .setName('status')
          .setDescription('Stored outcome filter before newest20 selection')
          .addChoices(
            ...['reserved', 'completed', 'uncertain', 'failed'].map((value) => ({
              name: value,
              value,
            })),
          ),
      ),
  );
data
  .addSubcommand((s) =>
    s
      .setName('exportpolicy')
      .setDescription(
        'Private JSON of stored rules/literal words/exemptIDs,not incident/message history.',
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('clearwords')
      .setDescription('Confirmed remove all storedliteralblockedwords;other rules/settings kept.')
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm clearing this guild literalword list')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('resetpolicy')
      .setDescription(
        'Confirmed disabled/defaultpolicy reset,words/exemptions cleared;incidents/cases kept.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm stopping AutoMod and clearing storedpolicy/exemptions')
          .setRequired(true),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('importpolicy')
    .setDescription(
      'Replace strict policy JSON,force disabled,clear own spam memory;no native effects.',
    )
    .addStringOption((o) =>
      o
        .setName('json')
        .setDescription('Policy object,4000chars max;IDs are stored only,review before enable')
        .setMinLength(2)
        .setMaxLength(4000)
        .setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName('confirm')
        .setDescription('Confirm replacing current policy and stopping AutoMod')
        .setRequired(true),
    ),
);
for (const name of ['clearignored', 'clearexempt'])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(
        name === 'clearignored'
          ? 'Clear ignored channels;if enabled,future messages there may be moderated.'
          : 'Clear role exemptions;if enabled,future messages by these roles may be moderated.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm removing all exclusions in this scope')
          .setRequired(true),
      ),
  );
for (const sub of ['disablerules', 'resetthresholds'])
  data.addSubcommand((s) =>
    s
      .setName(sub)
      .setDescription(
        sub === 'disablerules'
          ? 'Disable allsix moderationrules,keep enabledswitch/action/exclusions/words/history.'
          : 'Reset caps/mentions/spam limits to defaults,keep switches/action/exclusions/words/history.',
      )
      .addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription(
            sub === 'disablerules'
              ? 'Confirm stopping allsix future rulematches'
              : 'Confirm default thresholds;may make future moderation more or less sensitive',
          )
          .setRequired(true),
      ),
  );
export default {
  category: 'automod',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const authorize = async () => {
      const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        actor?.id !== i.user.id ||
        actor.guild?.id !== i.guildId ||
        i.guild.id !== i.guildId ||
        !actor.permissions?.has(P.ManageGuild)
      )
        throw new UserError('userPermission');
    };
    await authorize();
    const sub = i.options.getSubcommand(),
      locale = c.guildConfig.get(i.guildId).language,
      t = (k, p) => translate(locale, k, p);
    let content, files;
    if (sub === 'disablerules' || sub === 'resetthresholds') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automodResetConfirm');
      if (sub === 'disablerules')
        content = t('automodRulesDisabled', { count: c.automod.disableRules(i.guildId) });
      else {
        c.automod.resetThresholds(i.guildId);
        content = t('automodThresholdsReset');
      }
    }
    if (['importpolicy', 'clearignored', 'clearexempt'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automodResetConfirm');
      if (sub === 'importpolicy') {
        c.automod.importPolicy(i.guildId, i.options.getString('json', true));
        content = t('automodPolicyImported');
      } else {
        const kind = sub === 'clearignored' ? 'ignoredChannels' : 'exemptRoles';
        content = t('automodScopeCleared', { count: c.automod.clearScope(i.guildId, kind) });
      }
    }
    if (sub === 'exportpolicy') {
      files = [
        new AttachmentBuilder(
          Buffer.from(JSON.stringify(c.automod.get(i.guildId), null, 2) + '\n', 'utf8'),
          { name: 'emika-automod-policy.json' },
        ),
      ];
      content = t('automodPolicyExported');
    }
    if (['clearwords', 'resetpolicy'].includes(sub)) {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automodResetConfirm');
      if (sub === 'clearwords')
        content = t('automodWordsCleared', { count: c.automod.clearWords(i.guildId) });
      else {
        c.automod.resetPolicy(i.guildId);
        content = t('automodPolicyReset');
      }
    }

    if (sub === 'enable') {
      if (c.config.messageEventsEnabled !== true) throw new UserError('responderRuntimeDisabled');
      const action = i.options.getString('action', true);
      if (action === 'delete') {
        const bot = await i.guild.members.fetchMe({ force: true });
        if (
          !i.guild.client?.user?.id ||
          bot?.id !== i.guild.client.user.id ||
          bot.guild?.id !== i.guildId ||
          !bot.permissions?.has(P.ManageMessages)
        )
          throw new UserError('automodDeletePermission');
      }
      if (action === 'timeout') {
        if (i.options.getBoolean('confirm-timeout') !== true)
          throw new UserError('automodTimeoutConfirm');
        const bot = await i.guild.members.fetchMe({ force: true });
        if (
          !i.guild.client?.user?.id ||
          bot?.id !== i.guild.client.user.id ||
          bot.guild?.id !== i.guildId ||
          !bot.permissions?.has(P.ModerateMembers)
        )
          throw new UserError('automodTimeoutPermission');
      }
      await authorize();
      if (c.config.messageEventsEnabled !== true) throw new UserError('responderRuntimeDisabled');
      c.automod.patch(i.guildId, { enabled: true, action });
      content = t('automodEnabled');
    }
    if (sub === 'timeoutminutes') {
      c.automod.patch(i.guildId, { timeoutMinutes: i.options.getInteger('minutes', true) });
      content = t('automodTimeoutSaved', { minutes: c.automod.get(i.guildId).timeoutMinutes });
    }
    if (sub === 'disable') {
      c.automod.patch(i.guildId, { enabled: false });
      content = t('automodDisabled');
    }
    if (sub === 'rule') {
      const name = i.options.getString('name', true);
      if (!ruleNames.includes(name)) throw new UserError('automodRuleInvalid');
      c.automod.patch(i.guildId, { rules: { [name]: i.options.getBoolean('enabled', true) } });
      content = t('automodSaved');
    }
    if (['wordadd', 'wordremove'].includes(sub)) {
      c.automod.word(i.guildId, i.options.getString('text', true), sub === 'wordadd');
      content = t('automodSaved');
    }
    if (sub === 'exempt') {
      const selected = i.options.getRole('role', true),
        role = await i.guild.roles.fetch(selected.id, { force: true });
      if (!role || role.id !== selected.id || role.guild?.id !== i.guildId || role.id === i.guildId)
        throw new UserError('automodRoleInvalid');
      await authorize();
      c.automod.exempt(i.guildId, role.id, i.options.getBoolean('enabled', true));
      content = t('automodSaved');
    }
    if (sub === 'ignorechannel') {
      const selected = i.options.getChannel('channel', true);
      const channel = await i.guild.channels.fetch(selected.id, { force: true });
      if (
        !channel ||
        channel.id !== selected.id ||
        channel.guildId !== i.guildId ||
        ![
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        ].includes(channel.type)
      )
        throw new UserError('channelTypeInvalid');
      const latestActor = await i.guild.members.fetch({ user: i.user.id, force: true });
      if (
        latestActor?.id !== i.user.id ||
        latestActor.guild?.id !== i.guildId ||
        !latestActor.permissions.has(P.ManageGuild)
      )
        throw new UserError('userPermission');
      c.automod.ignoreChannel(i.guildId, channel.id, i.options.getBoolean('enabled', true));
      content = t('automodIgnoredSaved');
    }
    if (sub === 'removepolicy') {
      if (i.options.getBoolean('confirm', true) !== true)
        throw new UserError('automodPolicyConfirm');
      const kind = i.options.getString('kind', true),
        id = i.options.getString('subject-id', true);
      if (!['channel', 'role'].includes(kind) || !/^\d{17,20}$/.test(id))
        throw new UserError('automodPolicyInvalid');
      const cfg = c.automod.get(i.guildId),
        exists = (kind === 'channel' ? cfg.ignoredChannels : cfg.exemptRoles).includes(id);
      if (exists) {
        if (kind === 'channel') c.automod.ignoreChannel(i.guildId, id, false);
        else c.automod.exempt(i.guildId, id, false);
      }
      content = t('automodPolicyRemoved', { count: exists ? 1 : 0 });
    }
    if (sub === 'testtext') {
      const text = i.options.getString('text', true);
      if (typeof text !== 'string' || text.length < 1 || text.length > 1800)
        throw new UserError('automodWordInvalid');
      const settings = c.automod.get(i.guildId);
      const rule = c.automod.detect(
        { content: text },
        { ...settings, rules: { ...settings.rules, spam: false, mentions: false } },
      );
      content = t('automodTextTest', { rule: rule ?? t('automodNoMatch') });
    }
    if (sub === 'thresholds') {
      const mentionLimit = i.options.getInteger('mentions'),
        capsPercent = i.options.getInteger('caps-percent'),
        capsMinLetters = i.options.getInteger('caps-letters');
      if ([mentionLimit, capsPercent, capsMinLetters].every((v) => v === null))
        throw new UserError('automodThresholdRequired');
      c.automod.patch(i.guildId, {
        ...(mentionLimit !== null ? { mentionLimit } : {}),
        ...(capsPercent !== null ? { capsPercent } : {}),
        ...(capsMinLetters !== null ? { capsMinLetters } : {}),
      });
      content = t('automodThresholdSaved');
    }
    if (sub === 'spamthresholds') {
      const messages = i.options.getInteger('messages'),
        repeats = i.options.getInteger('repeats'),
        seconds = i.options.getInteger('seconds');
      if ([messages, repeats, seconds].every((v) => v === null))
        throw new UserError('automodThresholdRequired');
      const s = c.automod.patch(i.guildId, {
        ...(messages !== null ? { spamMessages: messages } : {}),
        ...(repeats !== null ? { spamRepeats: repeats } : {}),
        ...(seconds !== null ? { spamWindowSeconds: seconds } : {}),
      });
      content = t('automodSpamConfig', {
        messages: s.spamMessages,
        repeats: s.spamRepeats,
        seconds: s.spamWindowSeconds,
      });
    }
    if (sub === 'wordlist') {
      const page = i.options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > 5)
        throw new UserError('automodWordPageInvalid');
      const words = c.automod.get(i.guildId).words,
        rows = words.slice((page - 1) * 20, page * 20);
      content =
        t('automodWordList', { page, total: words.length }) +
        '\n' +
        (rows.length
          ? rows
              .map(
                (w, n) =>
                  `${(page - 1) * 20 + n + 1}. ${escapeMarkdown(w.replace(/[\u0000-\u001f\u007f]/gu, ' '))}`,
              )
              .join('\n')
          : t('automodWordListEmpty'));
    }
    if (sub === 'config') {
      const s = c.automod.get(i.guildId);
      content =
        t('automodConfig', {
          status: t(s.enabled ? 'enabled' : 'disabled'),
          action: s.action,
          rules:
            Object.entries(s.rules)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(', ') || '-',
          words: s.words.length,
          roles: s.exemptRoles.length,
        }) +
        ' ' +
        t('automodTimeoutSaved', { minutes: s.timeoutMinutes }) +
        ' ' +
        t('automodIgnoredConfig', { channels: s.ignoredChannels.join(', ') || '-' }) +
        ' ' +
        t('automodThresholdConfig', {
          mentions: s.mentionLimit,
          percent: s.capsPercent,
          letters: s.capsMinLetters,
        }) +
        '\n' +
        t('automodSpamConfig', {
          messages: s.spamMessages,
          repeats: s.spamRepeats,
          seconds: s.spamWindowSeconds,
        });
    }
    if (sub === 'unresolved') {
      const page = i.options.getInteger('page') ?? 1,
        rows = c.automod.unresolved(i.guildId, page);
      content =
        t('automodUnresolved', { page }) +
        '\n' +
        (rows
          .map(
            (r) =>
              `${r.message_id} | ${r.user_id} | ${r.rule} | ${r.action} | ${t('automodState_' + r.status)}`,
          )
          .join('\n') || t('automodEmpty'));
    }
    if (sub === 'stats') {
      const counts = {
        total: 0,
        reserved: 0,
        completed: 0,
        uncertain: 0,
        failed: 0,
        warn: 0,
        delete: 0,
        timeout: 0,
      };
      for (const row of c.automod.stats(i.guildId)) {
        counts.total += row.count;
        counts[row.status] += row.count;
        counts[row.action] += row.count;
      }
      content = t('automodStats', counts);
    }
    if (sub === 'incidents') {
      const status = i.options.getString('status') ?? null,
        rows = c.automod.incidents(i.guildId, status);
      content =
        t('automodIncidents') +
        '\n' +
        (rows.map((r) => `${r.message_id} | ${r.rule} | ${r.action} | ${r.status}`).join('\n') ||
          t('automodEmpty'));
    }
    await i.editReply(
      lunaPayload(
        { content, ...(files ? { files } : {}), allowedMentions: { parse: [] } },
        { locale },
      ),
    );
  },
};
