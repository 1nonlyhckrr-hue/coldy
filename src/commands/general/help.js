import { UserError } from '../../utils/errors.js';
import { HelpNavigation, helpView } from '../../services/helpNavigation.js';
import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Public interactive command directory with categories, pages and details.')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Result page 1-100').setMinValue(1).setMaxValue(100),
    )
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('Exact installed category, for example music or utility')
        .setMaxLength(32),
    )
    .addStringOption((o) =>
      o
        .setName('search')
        .setDescription('Literal case-insensitive command/description search')
        .setMinLength(1)
        .setMaxLength(80),
    )
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('Exact installed path for native parameter details, e.g. music play')
        .setMinLength(1)
        .setMaxLength(80),
    ),
  async execute(i, c) {
    const state = {
      guildId: i.guildId,
      page: i.options?.getInteger?.('page') ?? 1,
      category: i.options?.getString?.('category'),
      search: i.options?.getString?.('search'),
      command: i.options?.getString?.('command'),
    };
    if (state.command && (state.category || state.search))
      throw new UserError('helpDetailConflict');
    c.helpNavigation ??= new HelpNavigation();
    // Validate before creating a public session or replying.
    helpView(c, state, 'preview');
    const id = c.helpNavigation.create(i.guildId, state);
    await i.reply(helpView(c, state, id));
  },
};
