import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
import {
  textDigest,
  sortTextLines,
  uniqueTextLines,
  compareTextLines,
  formatJson,
  normalizeText,
  integerStatistics,
  integerFactors,
  convertIntegerBase,
  encodeBase64,
  decodeBase64,
  urlComponent,
  parseDuration,
  textStatistics,
  escapeText,
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
    .setDescription('Private Discord ID, time and embed-color helpers; no API changes.')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('sortlines')
        .setDescription('Private exact-line UTF-16 sort TXT, no trimming or locale collation.')
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('1-1200 characters, max 100 lines')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('direction')
            .setDescription('Code-unit order')
            .addChoices(
              { name: 'Ascending', value: 'ascending' },
              { name: 'Descending', value: 'descending' },
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('uniquelines')
        .setDescription(
          'Private exact-line deduplication TXT, first occurrence order kept, no trimming.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('1-1200 characters, max 100 lines')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => {
      s.setName('comparelines').setDescription(
        'Private exact-line sets JSON: only left/only right/common, no full diff or evaluation.',
      );
      for (const key of ['left', 'right'])
        s.addStringOption((o) =>
          o
            .setName(key)
            .setDescription('1-1200 characters, max 100 lines')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        );
      return s;
    })
    .addSubcommand((s) =>
      s
        .setName('integerstats')
        .setDescription(
          'Private count/sum/min/max/mean/median of 2-20 explicit integers, no storage.',
        )
        .addStringOption((o) =>
          o
            .setName('values')
            .setDescription('2-20 integers -1000000 to 1000000 separated by |, no spaces')
            .setMinLength(3)
            .setMaxLength(219)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('gcdlcm')
        .setDescription('Private exact GCD/LCM of two positive integers, no settings changed.')
        .addIntegerOption((o) =>
          o
            .setName('a')
            .setDescription('Positive integer 1-1000000000')
            .setMinValue(1)
            .setMaxValue(1000000000)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('b')
            .setDescription('Positive integer 1-1000000000')
            .setMinValue(1)
            .setMaxValue(1000000000)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => {
      s.setName('baseconvert')
        .setDescription(
          'Private unsigned 64 bit integer base 2/8/10/16 conversion, no prefixes/signs.',
        )
        .addStringOption((o) =>
          o
            .setName('number')
            .setDescription('Unsigned digits only, no spaces/prefixes, maximum 64 bits')
            .setMinLength(1)
            .setMaxLength(64)
            .setRequired(true),
        );
      for (const key of ['from', 'to'])
        s.addIntegerOption((o) =>
          o
            .setName(key)
            .setDescription('Integer base')
            .addChoices(...[2, 8, 10, 16].map((value) => ({ name: String(value), value })))
            .setRequired(true),
        );
      return s;
    })
    .addSubcommand((s) =>
      s
        .setName('base64encode')
        .setDescription(
          'Private exact UTF-8 text to standard Base64 TXT, not encryption/no evaluation.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Exact UTF-8 text, 1-1200 characters')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('base64decode')
        .setDescription(
          'Private canonical padded standard Base64 to valid UTF-8 TXT, no evaluation.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Canonical standard Base64, 1-1600 characters, no whitespace')
            .setMinLength(1)
            .setMaxLength(1600)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('urlcomponent')
        .setDescription(
          'Private URI component encoding/decoding TXT, not a URL fetch or form parser.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Explicit component text, 1-1200 characters')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('direction')
            .setDescription('Encode or decode one URI component')
            .addChoices({ name: 'Encode', value: 'encode' }, { name: 'Decode', value: 'decode' })
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sha256')
        .setDescription('SHA256 of explicit exact UTF-8 text, no URL/file fetch/password storage.')
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Text 1-1200 UTF-16 units, not trimmed; do not paste secrets')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('jsonformat')
        .setDescription(
          'Private pretty JSON TXT, keeps number spelling/key order/duplicates; no execution/storage.',
        )
        .addStringOption((o) =>
          o
            .setName('json')
            .setDescription('Valid JSON 1-1800 chars, do not paste secrets')
            .setMinLength(1)
            .setMaxLength(1800)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('normalize')
        .setDescription(
          'Private explicit Unicode normalization TXT; compatibility forms may change meaning.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Text 1-1200 UTF-16 units, no persistence')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('form')
            .setDescription('Explicit normalization form, no inferred selection')
            .addChoices(...['NFC', 'NFD', 'NFKC', 'NFKD'].map((value) => ({ name: value, value })))
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('duration')
        .setDescription(
          'Parse explicit elapsed duration into seconds; no reminder/calendar arithmetic.',
        )
        .addStringOption((o) =>
          o
            .setName('duration')
            .setDescription('Descending unique d/h/m/s e.g. 1d2h30m, max 365 days, no spaces')
            .setMinLength(2)
            .setMaxLength(80)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('textstats')
        .setDescription(
          'Count explicit text UTF-16/code points/graphemes/UTF-8 bytes/lines privately.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Text 1-1200 UTF-16 units; not stored or sent elsewhere')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('escapetext')
        .setDescription(
          'Escape common Discord markdown and neutralize @ in supplied text privately.',
        )
        .addStringOption((o) =>
          o
            .setName('text')
            .setDescription('Text 1-1200 UTF-16 units; returns TXT, no send or settings change')
            .setMinLength(1)
            .setMaxLength(1200)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('snowflake')
        .setDescription('Decode supplied ID timestamp/bits; does not fetch or verify an object.')
        .addStringOption((o) =>
          o
            .setName('id')
            .setDescription('Positive decimal Discord snowflake, up to unsigned 64 bits')
            .setMinLength(1)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timestamp')
        .setDescription(
          'Format explicit Unix seconds for client-local Discord display; not a reminder.',
        )
        .addIntegerOption((o) =>
          o
            .setName('seconds')
            .setDescription('Unix seconds 0-253402300799, not milliseconds')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discord display style, default f')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('localtimestamp')
        .setDescription(
          'Convert explicit local date time/named zone to Discord timestamp, not a scheduled send.',
        )
        .addStringOption((o) =>
          o
            .setName('local')
            .setDescription('Exact YYYY-MM-DDTHH: mm: ss; DSTgap/overlap rejected')
            .setMinLength(19)
            .setMaxLength(19)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('timezone')
            .setDescription('Named timezone e.g. Asia/Kolkata or UTC')
            .setMaxLength(80)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discord display style, default f')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timezone')
        .setDescription(
          'Display explicit Unix seconds in one named zone, not inferred time/location.',
        )
        .addIntegerOption((o) =>
          o
            .setName('seconds')
            .setDescription('Unix seconds 0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('timezone')
            .setDescription('Named timezone e.g. America/New_York or UTC')
            .setMaxLength(80)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timedifference')
        .setDescription(
          'Signed elapsed seconds and absolute day/hour/minute/second breakdown, no calendar days.',
        )
        .addIntegerOption((o) =>
          o
            .setName('start')
            .setDescription('Start Unix seconds 0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('end')
            .setDescription('End Unix seconds 0-253402300799')
            .setMinValue(0)
            .setMaxValue(253402300799)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('permissions')
        .setDescription(
          'Decode explicit raw permission bits; not effective member/channel permissions.',
        )
        .addStringOption((o) =>
          o
            .setName('bits')
            .setDescription('Unsigned 64 bit decimal, 0 allowed, no leading zeros')
            .setMinLength(1)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => {
      s.setName('rgb').setDescription(
        'Convert explicit RGB components to six-digit hex and decimal, no settings changed.',
      );
      for (const name of ['red', 'green', 'blue'])
        s.addIntegerOption((o) =>
          o
            .setName(name)
            .setDescription('Component 0-255')
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
          'Convert explicit ISO seconds with Z/offset into Discord timestamp, not schedule.',
        )
        .addStringOption((o) =>
          o
            .setName('iso')
            .setDescription('YYYY-MM-DDTHH: mm: ss Z or signed HH: mm offset, up to 14 hours')
            .setMinLength(20)
            .setMaxLength(25)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('style')
            .setDescription('Discord display style, default f')
            .addChoices(...TIMESTAMP_STYLES.map((v) => ({ name: v, value: v }))),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('color')
        .setDescription('Convert six hex digits to RGB/decimal; does not change bot settings.')
        .addStringOption((o) =>
          o
            .setName('hex')
            .setDescription('Six hex digits, with optional#')
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
    if (['sortlines', 'uniquelines', 'comparelines'].includes(sub)) {
      const { AttachmentBuilder } = await import('discord.js');
      const output =
        sub === 'sortlines'
          ? sortTextLines(i.options.getString('text', true), i.options.getString('direction', true))
          : sub === 'uniquelines'
            ? uniqueTextLines(i.options.getString('text', true))
            : JSON.stringify(
                compareTextLines(
                  i.options.getString('left', true),
                  i.options.getString('right', true),
                ),
                null,
                2,
              ) + '\n';
      await i.reply(
        lunaPayload(
          {
            content: t('toolsLinesConverted'),
            flags: MessageFlags.Ephemeral,
            files: [
              new AttachmentBuilder(Buffer.from(output, 'utf8'), {
                name: sub + (sub === 'comparelines' ? '.json' : '.txt'),
              }),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    } else if (sub === 'integerstats')
      text = t('toolsIntegerStats', integerStatistics(i.options.getString('values', true)));
    else if (sub === 'gcdlcm')
      text = t(
        'toolsIntegerFactors',
        integerFactors(i.options.getInteger('a', true), i.options.getInteger('b', true)),
      );
    else if (sub === 'baseconvert')
      text = t(
        'toolsBaseConverted',
        convertIntegerBase(
          i.options.getString('number', true),
          i.options.getInteger('from', true),
          i.options.getInteger('to', true),
        ),
      );
    else if (['base64encode', 'base64decode', 'urlcomponent'].includes(sub)) {
      const { AttachmentBuilder } = await import('discord.js'),
        input = i.options.getString('text', true);
      const output =
        sub === 'base64encode'
          ? encodeBase64(input)
          : sub === 'base64decode'
            ? decodeBase64(input)
            : urlComponent(input, i.options.getString('direction', true));
      await i.reply(
        lunaPayload(
          {
            content: t('toolsEncodedText'),
            flags: MessageFlags.Ephemeral,
            files: [
              new AttachmentBuilder(Buffer.from(output, 'utf8'), { name: sub + '-text.txt' }),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    } else if (sub === 'sha256')
      text = t('toolsDigest', textDigest(i.options.getString('text', true)));
    else if (sub === 'jsonformat' || sub === 'normalize') {
      const { AttachmentBuilder } = await import('discord.js');
      const output =
        sub === 'jsonformat'
          ? formatJson(i.options.getString('json', true))
          : normalizeText(i.options.getString('text', true), i.options.getString('form', true));
      await i.reply(
        lunaPayload(
          {
            content: t(sub === 'jsonformat' ? 'toolsJsonFormatted' : 'toolsTextNormalized'),
            flags: MessageFlags.Ephemeral,
            files: [
              new AttachmentBuilder(Buffer.from(output, 'utf8'), {
                name: sub === 'jsonformat' ? 'formatted-json.txt' : 'normalized-text.txt',
              }),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    } else if (sub === 'duration')
      text = t('toolsDuration', parseDuration(i.options.getString('duration', true)));
    else if (sub === 'textstats')
      text = t('toolsTextStats', textStatistics(i.options.getString('text', true)));
    else if (sub === 'escapetext') {
      const { AttachmentBuilder } = await import('discord.js');
      await i.reply(
        lunaPayload(
          {
            content: t('toolsEscapeText'),
            flags: MessageFlags.Ephemeral,
            files: [
              new AttachmentBuilder(
                Buffer.from(escapeText(i.options.getString('text', true)), 'utf8'),
                { name: 'escaped-text.txt' },
              ),
            ],
            allowedMentions: { parse: [], repliedUser: false },
          },
          { locale },
        ),
      );
      return;
    } else if (sub === 'permissions') {
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
