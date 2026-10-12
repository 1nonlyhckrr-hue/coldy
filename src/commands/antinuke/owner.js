import { SlashCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { SECURITY_FEATURES, isBotOwner } from '../../services/securityAccess.js';
const features = SECURITY_FEATURES.map((f) => ({ name: f, value: f }));
const data = new SlashCommandBuilder()
  .setName('owner')
  .setDescription('Bot owner only: choose who may use Emika security commands in this server.')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('allow')
      .setDescription('Let a member use a security feature (default: nobody is delegated).')
      .addUserOption((o) => o.setName('user').setDescription('Member to allow').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('feature')
          .setDescription('Feature to allow, or all')
          .setRequired(true)
          .addChoices(...features),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('revoke')
      .setDescription('Remove a delegation (one feature, or everything if feature is empty).')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('feature')
          .setDescription('Feature to remove')
          .addChoices(...features),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show delegated users in this server.'));
export default {
  category: 'antinuke',
  data,
  async execute(i, c) {
    if (!isBotOwner(c, i.user.id)) throw new UserError('ownerOnly');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const t = (k, p) => c.localization.t(i.guildId, k, p),
      sub = i.options.getSubcommand();
    let text;
    if (sub === 'allow') {
      const u = i.options.getUser('user', true);
      if (u.bot) throw new UserError('securityAccessInvalid');
      c.securityAccess.allow(i.guildId, u.id, i.options.getString('feature', true), i.user.id);
      text = t('securityAllowed', { user: u.id, feature: i.options.getString('feature', true) });
    } else if (sub === 'revoke') {
      const u = i.options.getUser('user', true),
        n = c.securityAccess.revoke(i.guildId, u.id, i.options.getString('feature'));
      text = t('securityRevoked', { user: u.id, count: n });
    } else {
      const rows = c.securityAccess.list(i.guildId);
      text =
        t('securityList') +
        '\n' +
        (rows.map((r) => `<@${r.user_id}> - ${r.feature}`).join('\n') || t('antinukeEmpty'));
    }
    await i.editReply(
      lunaPayload(
        { content: text, allowedMentions: { parse: [] } },
        { locale: c.localization.locale(i.guildId) },
      ),
    );
  },
};
