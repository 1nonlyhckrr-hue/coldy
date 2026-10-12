import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('voicelb')
  .setDescription('Opt-in sampled human voice time,90UTCdays retained,no startup backfill.')
  .setContexts(InteractionContextType.Guild);
for (const sub of ['enable', 'disable', 'config', 'stats', 'top', 'resetmine', 'optout', 'optin'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        enable:
          'Manage Server:start future voicejoin sampling;no credit for alreadyconnected sessions.',
        disable: 'Manage Server:stop sampling and discard unfinished intervals;counts retained.',
        config: 'Private saved voice tracking switch and your privacy preference.',
        stats: 'Only your settled sampled voice milliseconds today/week/90retainedUTCdays.',
        top: 'Private ten sampled voice ranks/page;not full call duration or speaking activity.',
        resetmine: 'Erase only your voice counts and active sample;privacy preference kept.',
        optout: 'Erase your counts/active sample and stop future sampling here.',
        optin: 'Allow future join samples if server tracking enabled;no existing-call backfill.',
      }[sub],
    );
    if (sub === 'top') {
      s.addStringOption((o) =>
        o
          .setName('period')
          .setDescription('UTC calendar window')
          .addChoices(...['today', 'week', 'retained'].map((value) => ({ name: value, value }))),
      );
      s.addIntegerOption((o) =>
        o.setName('page').setDescription('Ten rows/page1-1000').setMinValue(1).setMaxValue(1000),
      );
    }
    return s;
  });
export default {
  category: 'leaderboard',
  data,
  async execute(i, c) {
    if (i.guild?.id !== i.guildId) throw new UserError('guildOnly');
    const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (actor?.id !== i.user.id || actor.guild?.id !== i.guildId || actor.user?.bot !== false)
      throw new UserError('voiceRankUnavailable');
    const sub = i.options.getSubcommand(),
      r = c.voiceRanks;
    if (['enable', 'disable'].includes(sub)) {
      if (!actor.permissions?.has(P.ManageGuild)) throw new UserError('userPermission');
      if (sub === 'enable' && c.config.voiceEventsEnabled !== true)
        throw new UserError('voiceRankEvents');
      r.enable(i.guildId, sub === 'enable');
    } else if (sub === 'resetmine') r.resetMine(i.guildId, i.user.id);
    else if (['optout', 'optin'].includes(sub)) r.privacy(i.guildId, i.user.id, sub === 'optout');
    else if (!['config', 'stats', 'top'].includes(sub)) throw new UserError('unknownCommand');
    const result =
      sub === 'top'
        ? {
            rows: r.top(
              i.guildId,
              i.options.getString('period') ?? 'week',
              i.options.getInteger('page') ?? 1,
            ),
          }
        : sub === 'stats'
          ? r.stats(i.guildId, i.user.id)
          : { enabled: !!r.config(i.guildId).enabled, optedOut: r.optedOut(i.guildId, i.user.id) };
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'voiceRankStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
              name: 'emika-voice-ranks.json',
            }),
          ],
        },
        { locale },
      ),
    );
  },
};
