import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  ChannelType,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { jailAuthority, setupJail, changeJail } from '../../services/jail.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('jail')
  .setDescription('Bounded native timeout jail, not role stripping or single-channel isolation.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ModerateMembers);
for (const sub of ['setup', 'config', 'reset', 'apply', 'release', 'list'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        setup:
          'Owner: record existing normal text jail reference channel, no permission or role edits.',
        config: 'Private stored reference channel policy, not isolation proof.',
        reset: 'Owner: forget policy only when no live or uncertain jail records.',
        apply:
          'Confirmed 1 s-28 d native timeout; roles unchanged, no existing timeout overwritten.',
        release: 'Confirmed clear exact owned current timeout only; drift/uncertain blocks.',
        list: 'Up to 25 active/uncertain jail metadata; expired native timeouts settle locally.',
      }[sub],
    );
    if (!['config', 'list'].includes(sub))
      s.addBooleanOption((o) =>
        o.setName('confirm').setDescription('Confirm bounded jail action').setRequired(true),
      );
    if (sub === 'setup')
      s.addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Existing normal text reference channel, not timeout exemption')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      );
    if (['apply', 'release'].includes(sub)) {
      s.addUserOption((o) =>
        o.setName('member').setDescription('One current human member').setRequired(true),
      );
    }
    if (sub === 'apply')
      s.addStringOption((o) =>
        o
          .setName('duration')
          .setDescription('Required 1 s-28 d, no permanent jail')
          .setRequired(true)
          .setMaxLength(12),
      );
    if (['apply', 'release'].includes(sub))
      s.addStringOption((o) =>
        o.setName('reason').setDescription('Moderation case reason').setMaxLength(400),
      );
    return s;
  });
export default {
  category: 'moderation',
  data,
  async execute(i, c) {
    const sub = i.options.getSubcommand();
    await jailAuthority(i, ['setup', 'reset'].includes(sub));
    let result;
    if (sub === 'setup')
      await setupJail(i, c, {
        channelId: i.options.getChannel('channel', true).id,
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (sub === 'reset') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('jailConfirm');
      c.jail.reset(i.guildId);
    } else if (['apply', 'release'].includes(sub))
      result = await changeJail(i, c, {
        userId: i.options.getUser('member', true).id,
        release: sub === 'release',
        duration: sub === 'apply' ? i.options.getString('duration', true) : undefined,
        reason: i.options.getString('reason') ?? 'Confirmed bounded timeout jail',
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (!['config', 'list'].includes(sub)) throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'jailStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(
              Buffer.from(
                JSON.stringify(
                  result ?? { policy: c.jail.config(i.guildId), ...c.jail.list(i.guildId) },
                  null,
                  2,
                ) + '\n',
              ),
              { name: 'emika-jail.json' },
            ),
          ],
        },
        { locale },
      ),
    );
  },
};
