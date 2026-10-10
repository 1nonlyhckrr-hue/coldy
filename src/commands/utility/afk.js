import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Opt-in own status,reason disclosed only in this exact channel.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Set status up to7days,clear on your next eligible server message.')
      .addStringOption((o) =>
        o
          .setName('reason')
          .setDescription('Public reason for this channel,no private details')
          .setMinLength(1)
          .setMaxLength(200)
          .setRequired(true),
      )
      .addBooleanOption((o) =>
        o
          .setName('share')
          .setDescription('Confirm sharing this reason when mentioned in this exact channel')
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('clear').setDescription('Erase your status and reason here.'))
  .addSubcommand((s) =>
    s.setName('status').setDescription('Privately view your status and disclosure channel.'),
  );
export default {
  category: 'utility',
  data,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      t = (k, p) => c.localization.t(i.guildId, k, p);
    let text;
    if (sub === 'set') {
      if (!c.config.messageEventsEnabled) throw new UserError('responderRuntimeDisabled');
      if (i.options.getBoolean('share', true) !== true) throw new UserError('afkShareConfirm');
      c.afk.set(i.guildId, i.user.id, i.channelId, i.options.getString('reason', true));
      text = t('afkSaved');
    } else if (sub === 'clear') {
      c.afk.clear(i.guildId, i.user.id);
      text = t('afkCleared');
    } else if (sub === 'status') {
      const row = c.afk.get(i.guildId, i.user.id);
      text = row
        ? t('afkOwnStatus', { channel: row.channel_id, reason: row.reason })
        : t('afkEmpty');
    } else throw new UserError('unknownCommand');
    await i.editReply(
      lunaPayload(
        { content: text, allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
