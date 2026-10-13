import { SlashCommandBuilder, InteractionContextType } from 'discord.js';
import { begin, say } from '../../utils/toolReply.js';
import { UserError } from '../../utils/errors.js';
import { clip } from '../../services/modCase.js';
const data = new SlashCommandBuilder()
  .setName('report')
  .setDescription('Report a problem to the server moderators (private).')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) =>
    o.setName('text').setDescription('What happened').setRequired(true).setMaxLength(1000),
  )
  .addUserOption((o) => o.setName('member').setDescription('Who this is about'))
  .addBooleanOption((o) =>
    o.setName('anonymous').setDescription('Do not show your name to moderators'),
  );
export default {
  category: 'moderation',
  data,
  cooldownMs: 60000,
  async execute(i, c) {
    await begin(i);
    if (!c.logHub.channelId(i.guildId, 'mod')) throw new UserError('rpNoModlog');
    const anon = i.options.getBoolean('anonymous') === true,
      who = i.options.getUser('member');
    const sent = await c.logHub.send(i.guild, 'mod', 'rpReport', {
      from: anon ? '-' : `<@${i.user.id}>`,
      about: who ? `<@${who.id}>` : '-',
      channel: i.channelId ? `<#${i.channelId}>` : '-',
      text: clip(i.options.getString('text', true), 1000),
    });
    if (!sent) throw new UserError('rpNoModlog');
    return say(i, c, 'rpSent');
  },
};
