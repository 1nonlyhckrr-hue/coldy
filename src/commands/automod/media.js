import {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
// Media managers need ManageGuild;reuse independent source-of-truth fetch without role authority.
async function manager(i) {
  if (i.guild?.id !== i.guildId) throw new UserError('guildOnly');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    !actor.permissions?.has(P.ManageGuild)
  )
    throw new UserError('userPermission');
  return actor;
}
const data = new SlashCommandBuilder()
  .setName('media')
  .setDescription(
    'Opt-in one text-channel attachment-only policy;deletion of fresh nonmedia messages.',
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const sub of ['setup', 'remove', 'config', 'bypassadd', 'bypassremove', 'bypassshow'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        setup: 'Enable one normaltextchannel attachment-only policy;explicit confirm required.',
        remove: 'Disable future attachment-only deletion;already submitted deletion may finish.',
        config: 'Private saved media policy,bypasses count and runtime caveats.',
        bypassadd: 'Exempt one confirmed current human member,max100saved bypasses.',
        bypassremove: 'Remove one exact stored bypass member ID,including departed members.',
        bypassshow: 'Private saved bypass IDs only,not native membership proof.',
      }[sub],
    );
    if (sub === 'setup') {
      s.addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Normal text channel')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      );
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm automatic deletion of fresh messages with no attachments')
          .setRequired(true),
      );
    }
    if (sub === 'bypassadd')
      s.addUserOption((o) =>
        o.setName('user').setDescription('One human current member').setRequired(true),
      );
    if (sub === 'bypassremove')
      s.addStringOption((o) =>
        o
          .setName('user-id')
          .setDescription('Exact saved member ID')
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20),
      );
    return s;
  });
export default {
  category: 'automod',
  data,
  async execute(i, c) {
    await manager(i);
    const sub = i.options.getSubcommand();
    if (sub === 'setup') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('mediaConfirm');
      if (c.config.messageEventsEnabled !== true) throw new UserError('mediaEvents');
      const id = i.options.getChannel('channel', true).id,
        [channel, bot] = await Promise.all([
          i.guild.channels.fetch(id, { force: true }),
          i.guild.members.fetchMe({ force: true }),
        ]);
      await manager(i);
      if (
        channel?.id !== id ||
        channel.guildId !== i.guildId ||
        channel.type !== ChannelType.GuildText ||
        bot?.id !== i.client?.user?.id ||
        bot.guild?.id !== i.guildId ||
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages])
      )
        throw new UserError('botPermission');
      if (c.config.messageEventsEnabled !== true) throw new UserError('mediaEvents');
      c.mediaPolicy.setup(i.guildId, id);
    } else if (sub === 'remove') c.mediaPolicy.remove(i.guildId);
    else if (sub === 'bypassadd') {
      const user = i.options.getUser('user', true),
        member = await i.guild.members.fetch({ user: user.id, force: true });
      await manager(i);
      if (member?.id !== user.id || member.guild?.id !== i.guildId || member.user?.bot !== false)
        throw new UserError('mediaInput');
      c.mediaPolicy.addBypass(i.guildId, user.id);
    } else if (sub === 'bypassremove')
      c.mediaPolicy.removeBypass(i.guildId, i.options.getString('user-id', true));
    else if (!['config', 'bypassshow'].includes(sub)) throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language,
      result = {
        channelId: c.mediaPolicy.get(i.guildId)?.channel_id ?? null,
        bypassIds: c.mediaPolicy.bypasses(i.guildId),
      };
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'mediaStatus'),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
              name: 'emika-media-policy.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
