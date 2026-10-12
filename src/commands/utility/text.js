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
  .setDescription('Private literal text transformations;no execution,fetch or stored data.')
  .setContexts(InteractionContextType.Guild);
for (const [name, description] of [
  [
    'reverselines',
    'Reverse exact1-100linesTXT,blanklines preserved,CRLF/CRtoLF,no character reversal.',
  ],
  [
    'jsonkeys',
    'JSONobject own top-levelkeys in parserorder JSON,no recursion,duplicatekeys lastwins.',
  ],
  [
    'jsonarraytypes',
    'JSONarray top-level typecounts/lengthJSON,no numericstatistics or schema validation.',
  ],
  ['hexencode', 'LiteralUTF8 text to lowercase hexadecimalTXT,no encryption or execution.'],
  ['hexdecode', 'Evenlength strict hex to validUTF8TXT,no NUL/replacementdecoding/execution.'],
  [
    'jsonunquote',
    'Decode exactlyone JSONstring to literalUTF8TXT,no NUL/unpairedsurrogates or execution.',
  ],
  ['queryencode', 'JSON1-50string key/valuepairs to formquery,+forspace,repeats kept,no URLfetch.'],
  [
    'querydecode',
    'Strict rawformquery to key/valuepairs JSON,+isspace,repeats kept,no leading? or fragment.',
  ],
  [
    'urlparts',
    'Parse absoluteHTTP(S) URL into normalizedpartsJSON;no credentials,fetch or safetycheck.',
  ],
  [
    'csvencode',
    'JSON array of1-50strings to quoted single CSV record;not spreadsheet formula sanitization.',
  ],
  [
    'csvdecode',
    'Strict single CSV record to JSON array,1-50fields;quoted newlines kept,no formula execution.',
  ],
  [
    'jsonquote',
    'Literal text to one quoted JSON string;keeps Unicode,no parsing,execution or HTML safety.',
  ],
  ['htmlencode', 'Encode five HTML entities in literal text;not a sanitizer or HTML parser.'],
  [
    'htmldecode',
    'Decode amp/lt/gt/quot/#39 once;other entities unchanged,no parsing or execution.',
  ],
  [
    'numberlines',
    'Number1-100 exact lines,normalizeCRLF/CR toLF;blanklines preserved,no trimming.',
  ],
])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(description)
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literal text,1-1200characters;never executed or fetched.')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1200),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('replace')
    .setDescription(
      'Replace all case-sensitive non-overlapping literal matches,JSONcount/text;no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literaltext,1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('find')
        .setDescription('Exactliteral,1-200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    )
    .addStringOption((o) =>
      o
        .setName('replacement')
        .setDescription('Literalreplacement,max200characters;omit todelete')
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('findlines')
    .setDescription(
      'Exactcase-sensitive literal matching lines/1basednumbers JSON,max100lines;no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literaltext,1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('find')
        .setDescription('Exactsingleline literal,1-200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('slice')
    .setDescription(
      'Exact1based Unicode codepoint slice TXT;not graphemes,may split combining sequences.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literaltext,1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addIntegerOption((o) =>
      o
        .setName('start')
        .setDescription('1based codepoint start')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1200),
    )
    .addIntegerOption((o) =>
      o
        .setName('count')
        .setDescription('Codepointcount,fully within text')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('jsonpointer')
    .setDescription(
      'Select exact own JSONvalue byRFC6901pointer;no inheritedproperties,parsernumbersemantics.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('JSONdocument1-1200characters,duplicatekeys lastwins')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('pointer')
        .setDescription('RFC6901 /key/0;~0for~ and~1for/;omitforroot,max200')
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('split')
    .setDescription(
      'Literalcase-sensitive non-overlapping split to JSONstrings,emptyparts kept,no regex.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literaltext1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('separator')
        .setDescription('Exactnonemptyseparator1-200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(200),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('join')
    .setDescription('JSONarray0-100literalstrings tojoinedTXT,empties preserved,no evaluation.')
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('JSONarray1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('separator')
        .setDescription('Literalseparator0-200characters;omitfornone')
        .setMaxLength(200),
    ),
);
for (const name of ['indent', 'outdent'])
  data.addSubcommand((s) =>
    s
      .setName(name)
      .setDescription(
        name === 'indent'
          ? 'Prefix1-16ASCIIspaces to everyline,blanklines included,CRLF/CRtoLF,max100lines.'
          : 'Removeup to1-16leadingASCIIspaces perline,no tabs/otherwhitespace,CRLF/CRtoLF.',
      )
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('Literaltext1-1200characters,max100lines')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(1200),
      )
      .addIntegerOption((o) =>
        o
          .setName('spaces')
          .setDescription('ASCIIspaces1-16perline')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(16),
      ),
  );
data.addSubcommand((s) =>
  s
    .setName('lineendings')
    .setDescription(
      'Convert allCRLF/CR/LF linebreaks toLF orCRLF TXT,no trimming/trailingline addition.',
    )
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Literaltext1-1200characters')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1200),
    )
    .addStringOption((o) =>
      o
        .setName('style')
        .setDescription('Literaloutputlinebreak encoding')
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
