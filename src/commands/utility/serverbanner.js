import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { lunaPayload } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
export default {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('serverbanner')
    .setDescription('Fetch current server banner link,no member enumeration.')
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await i.client.guilds.fetch({ guild: i.guildId, force: true });
    if (
      guild?.id !== i.guildId ||
      !(
        guild.banner === null ||
        (typeof guild.banner === 'string' && /^(?:a_)?[a-f0-9]{32}$/.test(guild.banner))
      )
    )
      throw new UserError('serverBannerUnavailable');
    let url = null;
    if (guild.banner !== null) {
      url = guild.bannerURL({ size: 1024 });
      if (typeof url !== 'string') throw new UserError('serverBannerUnavailable');
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'cdn.discordapp.com' ||
        parsed.username ||
        parsed.password ||
        (parsed.pathname !== `/banners/${guild.id}/${guild.banner}.webp` &&
          parsed.pathname !== `/banners/${guild.id}/${guild.banner}.gif` &&
          parsed.pathname !== `/banners/${guild.id}/${guild.banner}.png`)
      )
        throw new UserError('serverBannerUnavailable');
    }
    await i.editReply(
      lunaPayload(
        {
          content: c.localization.t(i.guildId, url ? 'serverBannerValue' : 'serverBannerNone', {
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
