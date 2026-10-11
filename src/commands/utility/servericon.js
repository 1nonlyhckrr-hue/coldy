import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('servericon')
    .setDescription('Fetch current server icon link,no member enumeration.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await i.client.guilds.fetch({ guild: i.guildId, force: true });
    if (
      guild?.id !== i.guildId ||
      !(
        guild.icon === null ||
        (typeof guild.icon === 'string' && /^(?:a_)?[a-f0-9]{32}$/.test(guild.icon))
      )
    )
      throw new UserError('serverIconUnavailable');
    let url = null;
    if (guild.icon !== null) {
      url = guild.iconURL({ size: 1024 });
      if (typeof url !== 'string') throw new UserError('serverIconUnavailable');
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'cdn.discordapp.com' ||
        parsed.username ||
        parsed.password ||
        (parsed.pathname !== `/icons/${guild.id}/${guild.icon}.webp` &&
          parsed.pathname !== `/icons/${guild.id}/${guild.icon}.gif` &&
          parsed.pathname !== `/icons/${guild.id}/${guild.icon}.png`)
      )
        throw new UserError('serverIconUnavailable');
    }
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, url ? 'serverIconValue' : 'serverIconNone', {
            id: guild.id,
            ...(url ? { url } : {}),
          }),
          allowedMentions: { parse: [] },
        },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
