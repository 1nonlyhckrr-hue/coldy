import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import {
  htmlEncode,
  htmlDecode,
  numberLines,
  csvEncode,
  csvDecode,
  jsonQuote,
  replaceLiteral,
  findLiteralLines,
  sliceCodepoints,
  queryEncode,
  queryDecode,
  urlParts,
  hexEncode,
  hexDecode,
  jsonUnquote,
  jsonKeys,
  jsonPointer,
  jsonArrayTypes,
  splitLiteral,
  joinStrings,
  reverseLines,
  indentLines,
  lineEndings,
} from '../../services/textTransforms.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('text')
  .setDescription('Private literal text transformations; no execution, fetch or stored data.')
  .setContexts(InteractionContextType.Guild);
for (const [name, description] of [
  [
    'reverselines',
    'Reverse exact 1-100 lines TXT, blank lines preserved, CRLF/CR to LF, no character reversal.',
  ],
  [
    'jsonkeys',
    'JSON object own top-level keys in parser order JSON, no recursion, duplicate keys last wins.',
  ],
  [
    'jsonarraytypes',
    'JSON array top-level type counts/length JSON, no numeric statistics or schema validation.',
  ],
  ['hexencode', 'Literal UTF-8 text to lowercase hexadecimal TXT, no encryption or execution.'],
  [
    'hexdecode',
    'Even length strict hex to valid UTF-8 TXT, no NUL/replacement decoding/execution.',
  ],
  [
    'jsonunquote',
    'Decode exactly one JSON string to literal UTF-8 TXT, no NUL/unpaired surrogates or execution.',
  ],
  [
    'queryencode',
    'JSON 1-50 string key/value pairs to form query, + for space, repeats kept, no URL fetch.',
  ],
  [
    'querydecode',
    'Strict raw form query to key/value pairs JSON, + is space, repeats kept, no leading? or fragment.',
  ],
  [
    'urlparts',
    'Parse absolute HTTP(S) URL into normalized parts JSON; no credentials, fetch or safety check.',
  ],
  [
    'csvencode',
    'JSON array of 1-50 strings to quoted single CSV record; not spreadsheet formula sanitization.',
  ],
  [
    'csvdecode',
    'Strict single CSV record to JSON array, 1-50 fields; quoted newlines kept, no formula execution.',
  ],
  [
    'jsonquote',
    'Literal text to one quoted JSON string; keeps Unicode, no parsing, execution or HTML safety.',
  ],
  ['htmlencode', 'Encode five HTML entities in literal text; not a sanitizer or HTML parser.'],
  [
    'htmldecode',
    'Decode amp/lt/gt/quot/#39 once; other entities unchanged, no parsing or execution.',
  ],
  [
    'numberlines',
    'Number 1-100 exact lines, normalize CRLF/CR to LF; blank lines preserved, no trimming.',
  ],
])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(description)
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literal text, 1-1200 characters; never executed or fetched.')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1200),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('replace')
    .setDescription(
      'Replace all case-sensitive non-overlapping literal matches, JSON count/text; no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literal text, 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('find')
        .setDescription('Exact literal, 1-200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    )
    .addStringOption((o) =>
      o
        .setName('replacement')
        .setDescription('Literal replacement, max 200 characters; omit to delete')
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('findlines')
    .setDescription(
      'Exact case-sensitive literal matching lines/1 based numbers JSON, max 100 lines; no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literal text, 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('find')
        .setDescription('Exact single line literal, 1-200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('slice')
    .setDescription(
      'Exact 1 based Unicode code point slice TXT; not graphemes, may split combining sequences.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literal text, 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addIntegerOption((o) =>
      o
        .setName('start')
        .setDescription('1 based code point start')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1200),
    )
    .addIntegerOption((o) =>
      o
        .setName('count')
        .setDescription('Code point count, fully within text')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('jsonpointer')
    .setDescription(
      'Select exact own JSON value by RFC 6901 pointer; no inherited properties, parser number semantics.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('JSON document 1-1200 characters, duplicate keys last wins')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('pointer')
        .setDescription('RFC 6901 /key/0; ~0 for ~ and ~1 for /; omit for root, max 200')
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('split')
    .setDescription(
      'Literal case-sensitive non-overlapping split to JSON strings, empty parts kept, no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literal text 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('separator')
        .setDescription('Exact nonempty separator 1-200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('join')
    .setDescription(
      'JSON array 0-100 literal strings to joined TXT, empties preserved, no evaluation.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('JSON array 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('separator')
        .setDescription('Literal separator 0-200 characters; omit for none')
        .setMaxLength(200),
    ),
);
for (const name of ['indent', 'outdent'])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(
        name === 'indent'
          ? 'Prefix 1-16 ASCII spaces to every line, blank lines included, CRLF/CR to LF, max 100 lines.'
          : 'Remove up to 1-16 leading ASCII spaces per line, no tabs/other whitespace, CRLF/CR to LF.',
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literal text 1-1200 characters, max 100 lines')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1200),
      )
      .addIntegerOption((o) =>
        o
          .setName('spaces')
          .setDescription('ASCII spaces 1-16 per line')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(16),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('lineendings')
    .setDescription(
      'Convert all CRLF/CR/LF line breaks to LF or CRLF TXT, no trimming/trailing line addition.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literal text 1-1200 characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('style')
        .setDescription('Literal output line break encoding')
        .setRequired(true)
        .addChoices({ name: 'LF', value: 'lf' }, { name: 'CRLF', value: 'crlf' }),
    ),
);
export default {
  category: 'utility',
  data,
  async execute(i, c) {
    const sub = i.options.getSubcommand();
    if (
      ![
        'replace',
        'findlines',
        'slice',
        'htmlencode',
        'htmldecode',
        'numberlines',
        'csvencode',
        'csvdecode',
        'jsonquote',
        'queryencode',
        'querydecode',
        'urlparts',
        'hexencode',
        'hexdecode',
        'jsonunquote',
        'jsonkeys',
        'jsonarraytypes',
        'jsonpointer',
        'split',
        'join',
        'reverselines',
        'indent',
        'outdent',
        'lineendings',
      ].includes(sub)
    )
      throw new UserError('unknownCommand');
    let text;
    const value = i.options.getString('text', true);
    if (['indent', 'outdent'].includes(sub))
      text = indentLines(value, i.options.getInteger('spaces', true), sub === 'outdent');
    else if (sub === 'lineendings') text = lineEndings(value, i.options.getString('style', true));
    else if (sub === 'split') text = splitLiteral(value, i.options.getString('separator', true));
    else if (sub === 'join') text = joinStrings(value, i.options.getString('separator') ?? '');
    else if (sub === 'jsonpointer') text = jsonPointer(value, i.options.getString('pointer') ?? '');
    else if (sub === 'replace')
      text =
        JSON.stringify(
          replaceLiteral(
            value,
            i.options.getString('find', true),
            i.options.getString('replacement') ?? '',
          ),
          null,
          2,
        ) + '\n';
    else if (sub === 'findlines')
      text =
        JSON.stringify(findLiteralLines(value, i.options.getString('find', true)), null, 2) + '\n';
    else if (sub === 'slice')
      text = sliceCodepoints(
        value,
        i.options.getInteger('start', true),
        i.options.getInteger('count', true),
      );
    else {
      const fn = {
        htmlencode: htmlEncode,
        htmldecode: htmlDecode,
        numberlines: numberLines,
        csvencode: csvEncode,
        csvdecode: csvDecode,
        jsonquote: jsonQuote,
        queryencode: queryEncode,
        querydecode: queryDecode,
        urlparts: urlParts,
        hexencode: hexEncode,
        hexdecode: hexDecode,
        jsonunquote: jsonUnquote,
        jsonkeys: jsonKeys,
        jsonarraytypes: jsonArrayTypes,
        reverselines: reverseLines,
      }[sub];
      if (!fn) throw new UserError('unknownCommand');
      text = fn(value);
    }
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'textTransform_' + sub),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'emika-' + sub + '.txt' }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
