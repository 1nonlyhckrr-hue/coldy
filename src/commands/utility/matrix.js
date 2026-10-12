import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js';
import {
  matrixRank,
  inverseMatrix,
  solveMatrix,
  addMatrices,
  scaleMatrix,
  powerMatrix,
  transposeMatrix,
  multiplyMatrices,
  matrixDeterminant,
} from '../../services/matrix.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
const data = new SlashCommandBuilder()
  .setName('matrix')
  .setDescription(
    'Private exact bounded integer matrix helpers,no evaluation/storage/native effects.',
  )
  .setContexts(InteractionContextType.Guild);
for (const sub of [
  'transpose',
  'multiply',
  'determinant',
  'add',
  'scale',
  'power',
  'rank',
  'inverse',
  'solve',
])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        rank: 'Exact rational rank of1-4by1-4integer matrix,no floatingpoint tolerance.',
        inverse: 'Exact rational inverse of square1-4integer matrix;singular rejected.',
        solve: 'Solve square1-4integer system with one-column RHS;unique rational solution only.',
        add: 'Add equalshape1-4integer matrices JSON;exact output decimalstrings.',
        scale:
          'Multiply each matrix integer by explicit bounded scalar;exact output decimalstrings.',
        power: 'Square integer matrix power0-10,0identity;exact output decimalstrings.',
        transpose:
          'Transpose1-4by1-4integer matrix JSON;exact integer outputs are decimal strings.',
        multiply: 'Multiply compatible1-4by1-4integer matrices JSON;exact outputs decimal strings.',
        determinant: 'Exact determinant of square1-4integer matrix JSON;result decimal string.',
      }[sub],
    );
    for (const key of ['multiply', 'add'].includes(sub)
      ? ['left', 'right']
      : sub === 'solve'
        ? ['matrix', 'right']
        : ['matrix'])
      s.addStringOption((o) =>
        o
          .setName(key)
          .setDescription(
            'RectangularJSONarray ofarrays,integers -1000000to1000000,1-4rows/columns',
          )
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(1200),
      );
    if (sub === 'scale' || sub === 'power')
      s.addIntegerOption((o) =>
        o
          .setName(sub === 'scale' ? 'scalar' : 'exponent')
          .setDescription(sub === 'scale' ? 'Integer -1000000to1000000' : 'Nonnegative integer0-10')
          .setRequired(true)
          .setMinValue(sub === 'scale' ? -1000000 : 0)
          .setMaxValue(sub === 'scale' ? 1000000 : 10),
      );
    return s;
  });
export default {
  category: 'utility',
  data,
  async execute(i, c) {
    const sub = i.options.getSubcommand();
    let result;
    if (sub === 'rank') result = matrixRank(i.options.getString('matrix', true));
    else if (sub === 'inverse') result = inverseMatrix(i.options.getString('matrix', true));
    else if (sub === 'solve')
      result = solveMatrix(i.options.getString('matrix', true), i.options.getString('right', true));
    else if (sub === 'add')
      result = addMatrices(i.options.getString('left', true), i.options.getString('right', true));
    else if (sub === 'scale')
      result = scaleMatrix(
        i.options.getString('matrix', true),
        i.options.getInteger('scalar', true),
      );
    else if (sub === 'power')
      result = powerMatrix(
        i.options.getString('matrix', true),
        i.options.getInteger('exponent', true),
      );
    else if (sub === 'transpose') result = transposeMatrix(i.options.getString('matrix', true));
    else if (sub === 'multiply')
      result = multiplyMatrices(
        i.options.getString('left', true),
        i.options.getString('right', true),
      );
    else if (sub === 'determinant') result = matrixDeterminant(i.options.getString('matrix', true));
    else throw new UserError('unknownCommand');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(
            locale,
            ['inverse', 'solve'].includes(sub) ? 'matrixRationalResult' : 'matrixResult',
          ),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n', 'utf8'), {
              name: 'luna-matrix-' + sub + '.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
