import { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits as P } from 'discord.js';
import welcome from './welcome.js';
// Reuse the same authorization, copy validation, modal and preview pipeline.
const data = new SlashCommandBuilder()
  .setName('goodbye')
  .setDescription('Copy, edit and preview goodbye messages.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild)
  .addSubcommand((s) => s.setName('edit').setDescription('Edit goodbye text and image/GIF.'))
  .addSubcommand((s) =>
    s
      .setName('copy')
      .setDescription('Copy a message into your goodbye template.')
      .addStringOption((o) =>
        o
          .setName('link')
          .setDescription('Message link you can read')
          .setRequired(true)
          .setMaxLength(200),
      ),
  )
  .addSubcommand((s) => s.setName('preview').setDescription('Privately preview your goodbye card.'))
  .addSubcommand((s) =>
    s.setName('test').setDescription('Send a goodbye test to the configured channel.'),
  );
export default {
  category: 'welcomer',
  data,
  userPermissions: [P.ManageGuild],
  async execute(i, c) {
    const options = new Proxy(i.options, {
      get(target, key) {
        if (key === 'getString')
          return (name, required) =>
            ['kind', 'type'].includes(name) ? 'goodbye' : target.getString(name, required);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const interaction = new Proxy(i, {
      get(target, key) {
        if (key === 'options') return options;
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return welcome.execute(interaction, c, 'goodbye');
  },
};
