import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
} from 'discord.js';
import { begin, say, needPerm, parseIds, tr } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import {
  banMany,
  quarantineMember,
  unquarantineMember,
  freezeMember,
  unfreezeMember,
  dehoist,
  roleAll,
  voiceKick,
  planPurge,
  runPurge,
  MASSBAN_MAX,
} from '../../services/modTools.js';
const member = (s, d = 'Target member') =>
  s.addUserOption((o) => o.setName('member').setDescription(d).setRequired(true));
const reason = (s) =>
  s.addStringOption((o) =>
    o.setName('reason').setDescription('Reason (kept in the case)').setMaxLength(400),
  );
const confirm = (s) =>
  s.addBooleanOption((o) =>
    o.setName('confirm').setDescription('Must be true to run this').setRequired(true),
  );
const data = new SlashCommandBuilder()
  .setName('modtools')
  .setDescription(
    'Member tools: quarantine, freeze, mass ban, dehoist, voice kick, role all, purge.',
  )
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    reason(
      member(
        s.setName('quarantine').setDescription('Take all roles and apply the quarantine role.'),
      ),
    ),
  )
  .addSubcommand((s) =>
    member(
      s.setName('unquarantine').setDescription('Release a quarantined member and give roles back.'),
    ),
  )
  .addSubcommand((s) =>
    reason(
      member(
        s
          .setName('freeze')
          .setDescription('Owner/delegate: instant timeout and strip all removable roles.'),
      ),
    ).addIntegerOption((o) =>
      o
        .setName('minutes')
        .setDescription('Timeout length, 1-40320 minutes (default 60)')
        .setMinValue(1)
        .setMaxValue(40320),
    ),
  )
  .addSubcommand((s) =>
    member(
      s
        .setName('unfreeze')
        .setDescription('Owner/delegate: end the timeout and give saved roles back.'),
    ),
  )
  .addSubcommand((s) =>
    reason(
      confirm(
        s
          .setName('massban')
          .setDescription('Owner/delegate: ban several user IDs at once, with a per-user report.')
          .addStringOption((o) =>
            o
              .setName('ids')
              .setDescription(
                `Up to ${MASSBAN_MAX} user IDs or mentions, separated by space or comma`,
              )
              .setRequired(true)
              .setMaxLength(1000),
          ),
      ),
    ),
  )
  .addSubcommand((s) =>
    reason(
      s
        .setName('hackban')
        .setDescription('Ban by user ID, also for people who are not in the server.')
        .addStringOption((o) =>
          o.setName('ids').setDescription('Up to 5 user IDs').setRequired(true).setMaxLength(200),
        ),
    ),
  )
  .addSubcommand((s) =>
    reason(
      member(
        s
          .setName('softban')
          .setDescription('Ban then unban at once: removes 7 days of their messages.'),
      ),
    ),
  )
  .addSubcommand((s) =>
    member(s.setName('voicekick').setDescription('Disconnect a member from voice.')),
  )
  .addSubcommand((s) =>
    s
      .setName('dehoist')
      .setDescription('Remove ! # . and similar hoisting characters from the start of a name.')
      .addUserOption((o) => o.setName('member').setDescription('One member (empty = everyone)'))
      .addBooleanOption((o) => o.setName('confirm').setDescription('Required true for everyone')),
  )
  .addSubcommand((s) =>
    confirm(
      s
        .setName('roleall')
        .setDescription('Owner/delegate: give a role to every human member (bots skipped).')
        .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true)),
    ),
  )
  .addSubcommand((s) =>
    s
      .setName('purge')
      .setDescription('Preview a filtered bulk delete (user, bots, links). Nothing is deleted yet.')
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('How many to delete, 1-100')
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel (default: this one)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addUserOption((o) => o.setName('user').setDescription('Only this user'))
      .addBooleanOption((o) => o.setName('bots').setDescription('Only bot messages'))
      .addBooleanOption((o) => o.setName('links').setDescription('Only messages with links')),
  )
  .addSubcommand((s) =>
    confirm(
      s
        .setName('purgeconfirm')
        .setDescription('Delete the messages from your purge preview (valid 2 minutes).')
        .addStringOption((o) =>
          o
            .setName('plan')
            .setDescription('Plan code from the preview')
            .setRequired(true)
            .setMaxLength(12),
        ),
    ),
  );
const PERM = {
  quarantine: P.ManageRoles,
  unquarantine: P.ManageRoles,
  hackban: P.BanMembers,
  softban: P.BanMembers,
  voicekick: P.MoveMembers,
  dehoist: P.ManageNicknames,
  purge: P.ManageMessages,
  purgeconfirm: P.ManageMessages,
};
const GATED = { freeze: 'freeze', unfreeze: 'freeze', massban: 'massban', roleall: 'roleall' };
const row = (i, c, r) =>
  `${r.ok ? 'OK' : 'NO'} <@${r.id}>${r.ok ? '' : ' - ' + tr(i, c)('mtWhy_' + r.why)}`;
export default {
  category: 'moderation',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    const sub = i.options.getSubcommand();
    if (GATED[sub]) await requireSecurityAccess(i, c, GATED[sub]);
    else needPerm(i, PERM[sub]);
    const [actor, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }).catch(() => null),
      i.guild.members.fetchMe({ force: true }),
    ]);
    const why = i.options.getString('reason') ?? tr(i, c)('noReason');
    const target = async () =>
      i.guild.members
        .fetch({ user: i.options.getUser('member', true).id, force: true })
        .catch(() => {
          throw new UserError('modTargetUnavailable');
        });
    const gate = (perm) => {
      if (!bot.permissions.has(perm)) throw new UserError('mtBotPerm');
    };
    if (sub === 'quarantine') {
      gate(P.ManageRoles);
      const r = await quarantineMember(i, c, await target(), bot, actor, why);
      return say(i, c, 'mtDone_quarantine', { count: r.removed });
    }
    if (sub === 'unquarantine') {
      const r = await unquarantineMember(i.guild, c, i.options.getUser('member', true).id);
      return say(i, c, 'mtDone_unquarantine', { count: r.restored });
    }
    if (sub === 'freeze') {
      const r = await freezeMember(
        i,
        c,
        await target(),
        bot,
        i.options.getInteger('minutes') ?? 60,
        why,
      );
      return say(i, c, r.timedOut && r.stripped ? 'mtDone_freeze' : 'mtDone_freezePartial', {
        count: r.removed,
      });
    }
    if (sub === 'unfreeze') {
      const r = await unfreezeMember(i, c, await target(), bot);
      return say(i, c, 'mtDone_unfreeze', { count: r.restored, skipped: r.skipped });
    }
    if (sub === 'massban' || sub === 'hackban') {
      if (sub === 'massban' && i.options.getBoolean('confirm', true) !== true)
        throw new UserError('mtConfirm');
      gate(P.BanMembers);
      const ids = parseIds(i.options.getString('ids', true), sub === 'massban' ? MASSBAN_MAX : 5);
      const out = await banMany(i, c, ids, {
        reason: why,
        bot,
        actor,
        checkActor: sub === 'hackban',
      });
      const ok = out.filter((r) => r.ok).length;
      return say(i, c, 'mtDone_ban', {
        ok,
        failed: out.length - ok,
        lines: out.map((r) => row(i, c, r)).join('\n'),
      });
    }
    if (sub === 'softban') {
      gate(P.BanMembers);
      const [r] = await banMany(i, c, [i.options.getUser('member', true).id], {
        reason: why,
        bot,
        actor,
        checkActor: true,
        soft: true,
      });
      if (!r.ok) throw new UserError('mtBlocked_' + r.why);
      return say(i, c, 'mtDone_softban', { user: `<@${r.id}>` });
    }
    if (sub === 'voicekick') {
      gate(P.MoveMembers);
      const m = await target();
      await voiceKick(m, i.user.id);
      return say(i, c, 'mtDone_voicekick', { user: `<@${m.id}>` });
    }
    if (sub === 'dehoist') {
      gate(P.ManageNicknames);
      const one = i.options.getUser('member');
      if (!one && i.options.getBoolean('confirm') !== true) throw new UserError('mtConfirm');
      const list = one ? [await target()] : [...(await i.guild.members.fetch()).values()];
      const r = await dehoist(i, c, list, bot);
      return say(i, c, 'mtDone_dehoist', r);
    }
    if (sub === 'roleall') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mtConfirm');
      const role = i.options.getRole('role', true);
      const r = await roleAll(i, c, i.guild.roles.cache.get(role.id) ?? role, bot, (p) =>
        say(i, c, 'mtRoleAllProgress', { added: p.added, failed: p.failed, total: p.total }),
      );
      return say(i, c, r.cut ? 'mtRoleAllCut' : 'mtRoleAllDone', r);
    }
    if (sub === 'purge') {
      const ch = i.options.getChannel('channel') ?? i.channel;
      const channel = await i.guild.channels.fetch(ch.id, { force: true });
      if (!channel.permissionsFor(bot)?.has(P.ManageMessages)) throw new UserError('mtBotPerm');
      const r = await planPurge(i, c, channel, {
        count: i.options.getInteger('count', true),
        userId: i.options.getUser('user')?.id,
        bots: i.options.getBoolean('bots') === true,
        links: i.options.getBoolean('links') === true,
      });
      return say(i, c, 'mtPurgePreview', {
        count: r.count,
        plan: r.plan,
        channel: `<#${channel.id}>`,
      });
    }
    if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mtConfirm');
    const r = await runPurge(i, c, i.options.getString('plan', true));
    return say(i, c, 'mtPurgeDone', r);
  },
};
