import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import { begin, say, needPerm } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { requireSecurityAccess } from '../../services/securityAccess.js';
import {
  setJoinGate,
  setRaidMode,
  releaseHeld,
  emergencyOn,
  emergencyOff,
  altSignals,
  similarNames,
} from '../../services/raidTools.js';
const data = new SlashCommandBuilder()
  .setName('raid')
  .setDescription('Raid tools: join gate, raid mode, emergency, alt check, invite tracking.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('joingate')
      .setDescription('Owner/delegate: kick new members whose account is younger than N days.')
      .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))
      .addIntegerOption((o) =>
        o
          .setName('days')
          .setDescription('Minimum account age in days, 1-365 (default 7)')
          .setMinValue(1)
          .setMaxValue(365),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('raidmode')
      .setDescription('Owner/delegate: while on, every new member is kicked or held (timed out).')
      .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('kick (default) or hold = 24 h timeout, released when mode goes off')
          .addChoices({ name: 'kick', value: 'kick' }, { name: 'hold', value: 'hold' }),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('emergency')
      .setDescription('Owner/delegate: lockdown + raid mode (kick) + alert the server owner.')
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Must be true').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('emergencyoff')
      .setDescription('Owner/delegate: undo the lockdown and raid mode, release held members.')
      .addBooleanOption((o) =>
        o.setName('confirm').setDescription('Must be true').setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('altcheck')
      .setDescription('Account age and signals that hint at an alt account (a score, not proof).')
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('invites')
      .setDescription("Invite tracking: turn on, see who invited a member or an inviter's numbers.")
      .addBooleanOption((o) => o.setName('enabled').setDescription('Turn tracking on or off'))
      .addUserOption((o) =>
        o.setName('inviter').setDescription("Show this person's invite numbers"),
      )
      .addUserOption((o) => o.setName('who').setDescription('Show who invited this member')),
  );
export default {
  category: 'antinuke',
  data,
  cooldownMs: 3000,
  async execute(i, c) {
    await begin(i);
    const sub = i.options.getSubcommand();
    if (['joingate', 'raidmode'].includes(sub)) await requireSecurityAccess(i, c, 'raid');
    else if (['emergency', 'emergencyoff'].includes(sub))
      await requireSecurityAccess(i, c, 'emergency');
    else needPerm(i, sub === 'altcheck' ? P.ModerateMembers : P.ManageGuild);
    const g = i.guildId;
    if (sub === 'joingate') {
      const bot = await i.guild.members.fetchMe({ force: true });
      if (!bot.permissions.has(P.KickMembers)) throw new UserError('mtBotPerm');
      const cfg = setJoinGate(
        c,
        g,
        i.options.getBoolean('enabled', true),
        i.options.getInteger('days'),
      );
      return say(i, c, cfg.enabled ? 'rtGateOn' : 'rtGateOff', { days: cfg.minDays });
    }
    if (sub === 'raidmode') {
      const on = i.options.getBoolean('enabled', true);
      if (on) {
        const bot = await i.guild.members.fetchMe({ force: true });
        if (!bot.permissions.has(P.KickMembers) || !bot.permissions.has(P.ModerateMembers))
          throw new UserError('mtBotPerm');
      }
      const act = i.options.getString('action');
      const cfg = setRaidMode(c, g, on, act === 'hold' ? 'timeout' : act);
      if (!on) {
        const released = await releaseHeld(c, i.guild);
        return say(i, c, 'rtRaidOff', { released });
      }
      return say(i, c, 'rtRaidOn_' + cfg.action);
    }
    if (sub === 'emergency' || sub === 'emergencyoff') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mtConfirm');
      if (sub === 'emergency') {
        const r = await emergencyOn(c, i.guild, i.user.id);
        return say(i, c, 'rtEmergencyDone', {
          locked: r.locked,
          failed: r.failed,
          dm: r.dm ? 'yes' : 'no',
          alert: r.alerted ? 'yes' : 'no',
        });
      }
      const r = await emergencyOff(c, i.guild);
      return say(i, c, 'rtEmergencyEnded', {
        restored: r.restored,
        failed: r.failed,
        released: r.released,
      });
    }
    if (sub === 'altcheck') {
      const member = await i.guild.members.fetch({
        user: i.options.getUser('member', true).id,
        force: true,
      });
      const r = altSignals(member);
      const t = (k, p) => c.localization.t(g, k, p);
      const sim = similarNames(member, [...i.guild.members.cache.values()]);
      return say(i, c, 'rtAlt', {
        user: `<@${member.id}>`,
        score: r.score,
        age: r.ageDays,
        signals:
          r.signals.map(([k, n]) => `${t('rtSig_' + k)} (+${n})`).join(', ') || t('rtSig_none'),
        similar: sim.map((x) => `<@${x}>`).join(' ') || '-',
      });
    }
    // invites
    const enabled = i.options.getBoolean('enabled');
    if (enabled !== null) {
      if (enabled) {
        const bot = await i.guild.members.fetchMe({ force: true });
        if (!bot.permissions.has(P.ManageGuild)) throw new UserError('mtBotPerm');
        await c.invites.snapshot(i.guild);
      }
      c.features.setConfig(g, 'invites', { enabled: false }, { enabled });
      return say(i, c, enabled ? 'rtInvOn' : 'rtInvOff');
    }
    if (!c.invites.enabled(g)) throw new UserError('rtInvNotOn');
    const who = i.options.getUser('who');
    if (who) {
      const rec = c.invites.invited(g, who.id);
      return say(i, c, rec ? 'rtInvWho' : 'rtInvUnknown', {
        user: `<@${who.id}>`,
        inviter: rec?.inviter ? `<@${rec.inviter}>` : '?',
        code: rec?.code ?? '?',
      });
    }
    const inviter = i.options.getUser('inviter');
    if (!inviter) throw new UserError('rtInvPick');
    const st = c.invites.stats(g, inviter.id);
    return say(i, c, 'rtInvStats', {
      user: `<@${inviter.id}>`,
      total: st.total,
      stayed: st.stayed,
      quick: st.quick,
      young: st.young,
      suspect: c.localization.t(g, st.suspect ? 'rtInvSuspect' : 'rtInvClean'),
    });
  },
};
