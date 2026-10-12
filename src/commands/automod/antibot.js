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
// AntiBot managers need ManageGuild;reuse independent source-of-truth fetch without role authority.
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
  .setName('antibot')
  .setDescription('Opt-in bot-message deletion in selected text channels;Emika/webhooks excluded.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const sub of ['add', 'remove', 'config', 'reset', 'wladd', 'wlremove'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        add: 'Enable bot-message deletion in one text channel,max25;explicit confirm required.',
        remove: 'Stop future bot-message deletion in one channel;submitted effects may finish.',
        config: 'Private saved channel and bot whitelist IDs;not live deletion proof.',
        reset: 'Clear channels and whitelist;existing receipts/messages untouched.',
        wladd: 'Whitelist one current bot member,max100;Emika always exempt.',
        wlremove: 'Remove one exact stored bot ID,including departed bots.',
      }[sub],
    );
    if (['add', 'remove'].includes(sub))
      s.addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Normal text channel')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      );
    if (sub === 'add')
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm future automatic deletion of nonwhitelisted bot messages')
          .setRequired(true),
      );
    if (sub === 'wladd')
      s.addUserOption((o) =>
        o.setName('user').setDescription('Current bot member').setRequired(true),
      );
    if (sub === 'wlremove')
      s.addStringOption((o) =>
        o
          .setName('user-id')
          .setDescription('Exact stored bot ID')
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
    if (sub === 'add') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('antibotConfirm');
      if (c.config.messageEventsEnabled !== true) throw new UserError('antibotEvents');
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
      if (c.config.messageEventsEnabled !== true) throw new UserError('antibotEvents');
      c.antiBot.add(i.guildId, id);
    } else if (sub === 'remove')
      c.antiBot.remove(i.guildId, i.options.getChannel('channel', true).id);
    else if (sub === 'wladd') {
      const user = i.options.getUser('user', true),
        member = await i.guild.members.fetch({ user: user.id, force: true });
      await manager(i);
      if (member?.id !== user.id || member.guild?.id !== i.guildId || member.user?.bot !== true)
        throw new UserError('antibotInput');
      c.antiBot.wlAdd(i.guildId, user.id);
    } else if (sub === 'wlremove')
      c.antiBot.wlRemove(i.guildId, i.options.getString('user-id', true));
    else if (sub === 'reset') c.antiBot.reset(i.guildId);
    else if (sub !== 'config') throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language,
      result = {
        channelIds: c.antiBot.channels(i.guildId),
        whitelistedBotIds: c.antiBot.whitelist(i.guildId),
      };
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'antibotStatus'),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n'), {
              name: 'emika-antibot-policy.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
