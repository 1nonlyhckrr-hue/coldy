import {
  SlashCommandBuilder,
  InteractionContextType,
  ChannelType,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { configureEventMode, changeEventMode, eventAuthority } from '../../services/eventMode.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription(
    'Owner-only bounded selected-channel event visibility; exact owned restore, not server isolation.',
  )
  .setContexts(InteractionContextType.Guild);
for (const sub of ['setup', 'enable', 'disable', 'reset', 'config'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        setup:
          'Select a visible event category and 1-10 outside text channels; at least 100 members, no creation.',
        enable:
          'Confirm selected everyone View denies; event category unchanged; partial effects possible.',
        disable:
          'Confirm exact snapshot owned restore only; third party drift/uncertainty blocks overwrite.',
        reset: 'Forget inactive fully restored policy only; never delete category/channels.',
        config: 'Private stored policy/receipt states, not proof complete server isolation.',
      }[sub],
    );
    if (sub !== 'config')
      s.addBooleanOption((o) =>
        o
          .setName('confirm')
          .setDescription('Confirm bounded event visibility configuration/effect')
          .setRequired(true),
      );
    if (sub === 'setup') {
      s.addChannelOption((o) =>
        o
          .setName('category')
          .setDescription('Existing event category')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildCategory),
      );
      s.addStringOption((o) =>
        o
          .setName('channels')
          .setDescription('JSON array 1-10 outside normal text channel-ID strings')
          .setRequired(true)
          .setMaxLength(250),
      );
    }
    return s;
  });
export default {
  category: 'automations',
  data,
  async execute(i, c) {
    await eventAuthority(i);
    const sub = i.options.getSubcommand();
    if (sub === 'setup') {
      let channels;
      try {
        channels = JSON.parse(i.options.getString('channels', true));
      } catch {
        throw new UserError('eventModeInput');
      }
      await configureEventMode(i, c, {
        categoryId: i.options.getChannel('category', true).id,
        channels,
        confirm: i.options.getBoolean('confirm', true),
      });
    } else if (['enable', 'disable'].includes(sub))
      await changeEventMode(i, c, {
        enable: sub === 'enable',
        confirm: i.options.getBoolean('confirm', true),
      });
    else if (sub === 'reset') {
      if (i.options.getBoolean('confirm', true) !== true) throw new UserError('eventModeConfirm');
      c.eventMode.reset(i.guildId);
    } else if (sub !== 'config') throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'eventModeStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(
              Buffer.from(
                JSON.stringify(
                  {
                    policy: c.eventMode.get(i.guildId),
                    records: c.eventMode
                      .records(i.guildId)
                      .map((r) => ({ channelId: r.channel_id, status: r.status })),
                  },
                  null,
                  2,
                ) + '\n',
              ),
              { name: 'emika-event-mode.json' },
            ),
          ],
        },
        { locale },
      ),
    );
  },
};
