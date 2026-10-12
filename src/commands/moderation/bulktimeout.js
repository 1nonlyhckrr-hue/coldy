import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { previewBulkTimeout, confirmBulkTimeout } from '../../services/bulkTimeout.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
export default {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('bulktimeout')
    .setDescription(
      'Preview then confirm clearing1-10exact current human timeout deadlines,not serverwide.',
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('preview')
        .setDescription(
          'Explicit1-10memberIDstrings JSON;private exactdeadline preview valid120s,no effects.',
        )
        .addStringOption((o) =>
          o
            .setName('members')
            .setDescription('JSONarray1-10distinct member ID strings')
            .setRequired(true)
            .setMaxLength(250),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('confirm')
        .setDescription(
          'Your exact unexpired preview;freshpermission/deadline guards,partial/uncertain stops,no retry.',
        )
        .addIntegerOption((o) =>
          o.setName('plan-id').setDescription('Exact preview ID').setMinValue(1).setRequired(true),
        )
        .addBooleanOption((o) =>
          o
            .setName('confirm')
            .setDescription('Confirm clearing every displayed exact timeout')
            .setRequired(true),
        ),
    ),
  async execute(i, c) {
    let result;
    if (i.options.getSubcommand() === 'preview') {
      let ids;
      try {
        ids = JSON.parse(i.options.getString('members', true));
      } catch {
        throw new UserError('bulkTimeoutInput');
      }
      result = await previewBulkTimeout(i, c, ids);
    } else if (i.options.getSubcommand() === 'confirm')
      result = await confirmBulkTimeout(i, c, {
        id: i.options.getInteger('plan-id', true),
        confirm: i.options.getBoolean('confirm', true),
      });
    else throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'bulkTimeoutStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
              name: 'emika-bulk-timeout.json',
            }),
          ],
        },
        { locale },
      ),
    );
  },
};
