import {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { requireVoiceReady } from '../../services/voiceReadiness.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('vmjoin')
  .setDescription(
    'Opt-in existing lobby join-to-create private VoiceMaster channel;no automatic cleanup.',
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageChannels | P.MoveMembers);
for (const sub of ['setup', 'off', 'config'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        setup:
          'Use existing normalvoice lobby;confirm future privatechannel creation and member move.',
        off: 'Stop future join-to-create;existing ownedchannels/uncertain moves retained.',
        config: 'Private saved lobby and actor IDs,not native state or automaticcleanup proof.',
      }[sub],
    );
    if (sub === 'setup') {
      s.addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Existing lobby,not managed or AFK channel')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildVoice),
      );
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm future humanjoins create privatechannel and move joiner')
          .setRequired(true),
      );
    }
    return s;
  });
async function manager(i) {
  const m = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    i.guild?.id !== i.guildId ||
    m?.id !== i.user.id ||
    m.guild?.id !== i.guildId ||
    !m.permissions?.has([P.ManageChannels, P.MoveMembers])
  )
    throw new UserError('userPermission');
}
export default {
  category: 'voicemaster',
  data,
  async execute(i, c) {
    await manager(i);
    const sub = i.options.getSubcommand();
    if (sub === 'setup') {
      requireVoiceReady(i, c);
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('vmJoinConfirm');
      const id = i.options.getChannel('channel', true).id,
        [channel, bot] = await Promise.all([
          i.guild.channels.fetch(id, { force: true }),
          i.guild.members.fetchMe({ force: true }),
        ]);
      await manager(i);
      if (
        !c.voiceMaster.config(i.guildId) ||
        channel?.id !== id ||
        channel.guildId !== i.guildId ||
        channel.type !== ChannelType.GuildVoice ||
        i.guild.afkChannelId === id ||
        c.voiceMaster.db
          .prepare(
            "SELECT id FROM voice_master_channels WHERE guild_id=? AND channel_id=? AND status!='closed'",
          )
          .get(i.guildId, id) ||
        bot?.id !== i.client?.user?.id ||
        bot.guild?.id !== i.guildId ||
        !bot.permissions?.has([P.MoveMembers, P.ManageChannels]) ||
        !channel.permissionsFor(bot)?.has([P.ViewChannel, P.Connect, P.MoveMembers])
      )
        throw new UserError('vmJoinUnavailable');
      requireVoiceReady(i, c);
      c.voiceJoin.set(i.guildId, id, i.user.id);
    } else if (sub === 'off') c.voiceJoin.off(i.guildId);
    else if (sub !== 'config') throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'vmJoinStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(
              Buffer.from(JSON.stringify(c.voiceJoin.get(i.guildId), null, 2) + '\n'),
              { name: 'emika-voice-join-policy.json' },
            ),
          ],
        },
        { locale },
      ),
    );
  },
};
