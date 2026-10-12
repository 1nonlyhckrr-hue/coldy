import {
  SlashCommandBuilder,
  InteractionContextType,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import {
  squaredDistance,
  projectVector,
  rejectVector,
  dotProduct,
  crossProduct,
  squaredNorm,
} from '../../services/vectors.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
const data = new SlashCommandBuilder()
  .setName('vector')
  .setDescription(
    'Private bounded integer vector products and exact squared norm; no native effects.',
  )
  .setContexts(InteractionContextType.Guild);
for (const [name, description] of [
  [
    'distancesquared',
    'Exact squared Euclidean distance of equal-length 1-4 integer vectors; not square root.',
  ],
  [
    'project',
    'Exact rational projection of left onto nonzero right vector; no unit normalization.',
  ],
  ['reject', 'Exact rational perpendicular remainder left minus projection onto nonzero right.'],
  ['dot', 'Exact dot product of equal-length 1-4 integer vectors JSON; decimal string output.'],
  ['cross', 'Exact ordered right-hand 3D cross product of integer vectors JSON; decimal strings.'],
  [
    'normsquared',
    'Exact squared Euclidean norm of 1-4 integer vector JSON; not square root/normalization.',
  ],
])
  data.addSubcommand((s) => {
    s.setName(name).setDescription(description);
    for (const key of name === 'normsquared' ? ['vector'] : ['left', 'right'])
      s.addStringOption((o) =>
        o
          .setName(key)
          .setDescription('JSON array 1-4 integers -1000000 to 1000000; cross requires 3')
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(200),
      );
    return s;
  });
export default {
  category: 'utility',
  data,
  async execute(i, c) {
    const sub = i.options.getSubcommand();
    let result;
    if (sub === 'distancesquared')
      result = squaredDistance(
        i.options.getString('left', true),
        i.options.getString('right', true),
      );
    else if (sub === 'project')
      result = projectVector(i.options.getString('left', true), i.options.getString('right', true));
    else if (sub === 'reject')
      result = rejectVector(i.options.getString('left', true), i.options.getString('right', true));
    else if (sub === 'dot')
      result = dotProduct(i.options.getString('left', true), i.options.getString('right', true));
    else if (sub === 'cross')
      result = crossProduct(i.options.getString('left', true), i.options.getString('right', true));
    else if (sub === 'normsquared') result = squaredNorm(i.options.getString('vector', true));
    else throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(
            locale,
            ['project', 'reject'].includes(sub) ? 'vectorRationalResult' : 'vectorResult',
          ),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n', 'utf8'), {
              name: 'emika-vector-' + sub + '.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
