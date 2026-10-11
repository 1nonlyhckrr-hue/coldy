import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
import {
  decodePermissions,
  rgbColor,
  isoTimestamp,
  decodeSnowflake,
  localTimestamp,
  showInZone,
  timeDifference,
  timestampMarkup,
  decodeColor,
  TIMESTAMP_STYLES,
} from '../../services/discordTools.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('tools')
    .setDescription('Private Discord ID,time and embed-color helpers;no API changes.')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('snowflake')
        .setDescription('Decode supplied ID timestamp/bits;does not fetch or verify an object.')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('Positive decimal Discord snowflake,up to unsigned64bits')
            .setMinLength(1)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timestamp')
        .setDescription(
          'Format explicit Unix seconds for client-local Discord display;not a reminder.',
        )
        .addIntegerOption((o) =>
          o
            .setName('seconds')
            .setDescription('Unix seconds0-253402300799,not milliseconds')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discord display style,defaultf')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('localtimestamp')
        .setDescription(
          'Convert explicit localdatetime/namedzone to Discordtimestamp,not a scheduledsend.',
        )
        .addStringOption((o) =>
          o
            .setName('local')
            .setDescription('Exact YYYY-MM-DDTHH:mm:ss;DSTgap/overlap rejected')
            .setMinLength(19)
            .setMaxLength(19)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('timezone')
            .setDescription('Namedtimezone e.g.Asia/Kolkata or UTC')
            .setMaxLength(80)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discorddisplaystyle,defaultf')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timezone')
        .setDescription('Display explicitUnixseconds in one namedzone,not inferredtime/location.')
        .addIntegerOption((o) =>
          o
            .setName('seconds')
            .setDescription('Unixseconds0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('timezone')
            .setDescription('Namedtimezone e.g.America/New_York or UTC')
            .setMaxLength(80)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timedifference')
        .setDescription(
          'Signed elapsedseconds and absoluteday/hour/minute/second breakdown,no calendardays.',
        )
        .addIntegerOption((o) =>
          o
            .setName('start')
            .setDescription('StartUnixseconds0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('end')
            .setDescription('EndUnixseconds0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('permissions')
        .setDescription(
          'Decode explicit raw permission bits;not effective member/channel permissions.',
        )
        .addStringOption((o) =>
          o
            .setName('bits')
            .setDescription('Unsigned64bit decimal,0allowed,no leadingzeros')
            .setMinLength(1)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => {
      s.setName('rgb').setDescription(
        'Convert explicit RGB components to six-digit hex and decimal,no settings changed.',
      );
      for (const name of ['red', 'green', 'blue'])
        s.addIntegerOption((o) =>
          o
            .setName(name)
            .setDescription('Component0-255')
            .setMinValue(0)
            .setMaxValue(255)
            .setRequired(true),
        );
      return s;
    })
    .addSubcommand((s) =>
      s
        .setName('isotimestamp')
        .setDescription(
          'Convert explicit ISO seconds with Z/offset into Discordtimestamp,not schedule.',
        )
        .addStringOption((o) =>
          o
            .setName('iso')
            .setDescription('YYYY-MM-DDTHH:mm:ssZ or signedHH:mm offset,up to14hours')
            .setMinLength(20)
            .setMaxLength(25)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discorddisplaystyle,defaultf')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('color')
        .setDescription('Convert six hex digits to RGB/decimal;does not change bot settings.')
        .addStringOption((o) =>
          o
            .setName('hex')
            .setDescription('Six hex digits,with optional#')
            .setMinLength(6)
            .setMaxLength(7)
            .setRequired(true),
        ),
    ),
  async execute(i, c) {
    const locale = c.localization.locale(i.guildId),
      t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'permissions') {
      const r = decodePermissions(i.options.getString('bits', true));
      text = t('toolsPermissions', { ...r, flags: r.flags.join(', ') || '-' });
    } else if (sub === 'rgb')
      text = t(
        'toolsColor',
        rgbColor(...['red', 'green', 'blue'].map((k) => i.options.getInteger(k, true))),
      );
    else if (sub === 'isotimestamp')
      text = t(
        'toolsTimestamp',
        isoTimestamp(i.options.getString('iso', true), i.options.getString('style') ?? 'f'),
      );
    else if (sub === 'snowflake') {
      const r = decodeSnowflake(i.options.getString('id', true));
      text = t('toolsSnowflake', { ...r, timestamp: `<t:${Math.floor(r.milliseconds / 1000)}:F>` });
    } else if (sub === 'timestamp') {
      const seconds = i.options.getInteger('seconds', true),
        style = i.options.getString('style') ?? 'f';
      text = t('toolsTimestamp', { ...timestampMarkup(seconds, style), seconds });
    } else if (sub === 'localtimestamp') {
      const r = localTimestamp(
        i.options.getString('local', true),
        i.options.getString('timezone', true),
        i.options.getString('style') ?? 'f',
      );
      text = t('toolsLocalTimestamp', r);
    } else if (sub === 'timezone')
      text = t(
        'toolsZoneTime',
        showInZone(i.options.getInteger('seconds', true), i.options.getString('timezone', true)),
      );
    else if (sub === 'timedifference')
      text = t(
        'toolsTimeDifference',
        timeDifference(i.options.getInteger('start', true), i.options.getInteger('end', true)),
      );
    else if (sub === 'color') text = t('toolsColor', decodeColor(i.options.getString('hex', true)));
    else throw new UserError('unknownCommand');
    await i.reply(
      lunaPayload(
        {
          content: text,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
