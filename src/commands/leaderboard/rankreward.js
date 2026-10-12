import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import {
  configureRankReward,
  removeRankReward,
  eligibleRankRewards,
  claimRankReward,
} from '../../services/rankRewards.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('rankreward')
  .setDescription(
    'Owner-approved zero-permission role milestones; member-confirmed claim, not auto grants.',
  )
  .setContexts(InteractionContextType.Guild);
for (const sub of ['set', 'remove', 'config', 'eligible', 'claim'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        set: 'Owner confirm: zero-permission existing role; retained 90 day messages or sampled voice minutes.',
        remove: 'Owner confirm: remove rule only; never remove granted roles or erase receipts.',
        config: 'Private stored milestone rules, not count or role-access guarantee.',
        eligible: 'Only your retained 90 day eligibility; tracking/privacy checks, no grant.',
        claim: 'Your explicit one-shot role grant; no automatic claim/regrant/revocation.',
      }[sub],
    );
    if (['set', 'remove', 'claim'].includes(sub)) {
      s.addRoleOption((o) =>
        o
          .setName('role')
          .setDescription('Existing zero-permission cosmetic role')
          .setRequired(true),
      );
      s.addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm rule/grant action').setRequired(true),
      );
    }
    if (sub === 'set') {
      s.addStringOption((o) =>
        o
          .setName('kind')
          .setDescription('Retained 90 UTCday metric, not all-time')
          .addChoices(
            { name: 'Messages', value: 'messages' },
            { name: 'Sampled voice minutes', value: 'voice-minutes' },
          )
          .setRequired(true),
      );
      s.addIntegerOption((o) =>
        o
          .setName('threshold')
          .setDescription('1-900000 retained messages or sampled voice minutes')
          .setMinValue(1)
          .setMaxValue(900000)
          .setRequired(true),
      );
    }
    return s;
  });
export default {
  category: 'leaderboard',
  data,
  async execute(i, c) {
    const sub = i.options.getSubcommand();
    let result;
    if (sub === 'set')
      await configureRankReward(i, c, {
        roleId: i.options.getRole('role', true).id,
        kind: i.options.getString('kind', true),
        threshold: i.options.getInteger('threshold', true),
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (sub === 'remove')
      await removeRankReward(i, c, {
        roleId: i.options.getRole('role', true).id,
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (sub === 'claim')
      result = await claimRankReward(i, c, {
        roleId: i.options.getRole('role', true).id,
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (sub === 'eligible') result = await eligibleRankRewards(i, c);
    else if (sub === 'config') result = c.rankRewards.rules(i.guildId);
    else throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'rankRewardStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(
              Buffer.from(JSON.stringify(result ?? c.rankRewards.rules(i.guildId), null, 2) + '\n'),
              { name: 'emika-rank-rewards.json' },
            ),
          ],
        },
        { locale },
      ),
    );
  },
};
