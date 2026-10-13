import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { runSteal } from '../../services/steal.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('steal')
    .setDescription('Name a command you saw another bot use. Emika wires it or queues it honestly.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName('command')
        .setDescription('The other bot command, for example ban or music play')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(60),
    )
    .addUserOption((o) => o.setName('bot').setDescription('Which bot you saw it on (optional)')),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      bot = i.options.getUser('bot');
    const out = runSteal(c, t, {
      input: i.options.getString('command', true),
      userId: i.user.id,
      guildId: i.guildId,
      botName: bot?.username ?? null,
    });
    await i.editReply(
      lunaPayload(
        { content: out.text, allowedMentions: { parse: [] } },
        {
          kind: out.status === 'wired' ? 'success' : 'info',
          locale: c.localization.locale(i.guildId),
        },
      ),
    );
  },
};
