import {
  SlashCommandBuilder,
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js';
import {
  matrixRowspace,
  matrixColumnspace,
  solveGeneralMatrix,
  subtractMatrices,
  cofactorMatrix,
  adjugateMatrix,
  matrixTrace,
  matrixRref,
  matrixNullspace,
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
    'Private exact bounded integer matrix helpers, no evaluation/storage/native effects.',
  )
  .setContexts(InteractionContextType.Guild);
for (const sub of [
  'rowspace',
  'columnspace',
  'solvegeneral',
  'subtract',
  'cofactor',
  'adjugate',
  'trace',
  'rref',
  'nullspace',
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
        rowspace: 'Exact rational independent row space basis from reduced row echelon form.',
        columnspace: 'Independent original integer column vectors, zero-based pivot columns.',
        solvegeneral:
          'Rectangular 1-4 integer system: inconsistent/unique/infinite rational affine solution.',
        subtract: 'Subtract equal shape 1-4 integer matrices; exact decimal strings.',
        cofactor:
          'Signed minors of square 1-4 integer matrix; 1 by 1 cofactor is 1, singular accepted.',
        adjugate: 'Transpose cofactor matrix, not inverse; square 1-4 integers, singular accepted.',
        trace: 'Exact trace of square 1-4 integer matrix; decimal string output.',
        rref: 'Exact rational reduced row echelon form with zero-based pivot columns.',
        nullspace: 'Exact rational nullspace basis vectors; zero-based free columns, no tolerance.',
        rank: 'Exact rational rank of 1-4 by 1-4 integer matrix, no floating point tolerance.',
        inverse: 'Exact rational inverse of square 1-4 integer matrix; singular rejected.',
        solve:
          'Solve square 1-4 integer system with one-column RHS; unique rational solution only.',
        add: 'Add equal shape 1-4 integer matrices JSON; exact output decimal strings.',
        scale:
          'Multiply each matrix integer by explicit bounded scalar; exact output decimal strings.',
        power: 'Square integer matrix power 0-10, 0 identity; exact output decimal strings.',
        transpose:
          'Transpose 1-4 by 1-4 integer matrix JSON; exact integer outputs are decimal strings.',
        multiply:
          'Multiply compatible 1-4 by 1-4 integer matrices JSON; exact outputs decimal strings.',
        determinant: 'Exact determinant of square 1-4 integer matrix JSON; result decimal string.',
      }[sub],
    );
    for (const key of ['multiply', 'add', 'subtract'].includes(sub)
      ? ['left', 'right']
      : ['solve', 'solvegeneral'].includes(sub)
        ? ['matrix', 'right']
        : ['matrix'])
      s.addStringOption((o) =>
        o
          .setName(key)
          .setDescription(
            'Rectangular JSON array of arrays, integers -1000000 to 1000000, 1-4 rows/columns',
          )
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(1200),
      );
    if (sub === 'scale' || sub === 'power')
      s.addIntegerOption((o) =>
        o
          .setName(sub === 'scale' ? 'scalar' : 'exponent')
          .setDescription(
            sub === 'scale' ? 'Integer -1000000 to 1000000' : 'Non negative integer 0-10',
          )
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
    if (sub === 'rowspace') result = matrixRowspace(i.options.getString('matrix', true));
    else if (sub === 'columnspace') result = matrixColumnspace(i.options.getString('matrix', true));
    else if (sub === 'solvegeneral')
      result = solveGeneralMatrix(
        i.options.getString('matrix', true),
        i.options.getString('right', true),
      );
    else if (sub === 'subtract')
      result = subtractMatrices(
        i.options.getString('left', true),
        i.options.getString('right', true),
      );
    else if (sub === 'cofactor') result = cofactorMatrix(i.options.getString('matrix', true));
    else if (sub === 'adjugate') result = adjugateMatrix(i.options.getString('matrix', true));
    else if (sub === 'trace') result = matrixTrace(i.options.getString('matrix', true));
    else if (sub === 'rref') result = matrixRref(i.options.getString('matrix', true));
    else if (sub === 'nullspace') result = matrixNullspace(i.options.getString('matrix', true));
    else if (sub === 'rank') result = matrixRank(i.options.getString('matrix', true));
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
            ['inverse', 'solve', 'rref', 'nullspace', 'rowspace', 'solvegeneral'].includes(sub)
              ? 'matrixRationalResult'
              : 'matrixResult',
          ),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(result, null, 2) + '\n', 'utf8'), {
              name: 'emika-matrix-' + sub + '.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
