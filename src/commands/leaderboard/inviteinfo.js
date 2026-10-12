import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
export default {
  category: 'leaderboard',
  data: new SlashCommandBuilder()
    .setName('inviteinfo')
    .setDescription(
      'Private current native metadata for your own active invites; no join attribution or tracking.',
    )
    .setContexts(InteractionContextType.Guild),
  async execute(i, c) {
    const guild = await i.guild?.fetch();
    const [actor, bot] = await Promise.all([
      i.guild.members.fetch({ user: i.user.id, force: true }),
      i.guild.members.fetchMe({ force: true }),
    ]);
    if (
      guild?.id !== i.guildId ||
      actor?.id !== i.user.id ||
      actor.guild?.id !== i.guildId ||
      actor.user?.bot !== false ||
      bot?.id !== i.client?.user?.id ||
      bot.guild?.id !== i.guildId ||
      !bot.permissions?.has(P.ManageGuild) ||
      !i.appPermissions?.has(P.ManageGuild)
    )
      throw new UserError('inviteInfoUnavailable');
    const invites = await i.guild.invites.fetch();
    if (!invites || typeof invites.values !== 'function' || invites.size > 1000)
      throw new UserError('inviteInfoUnavailable');
    const records = [];
    for (const invite of invites.values()) {
      if (invite.guild?.id !== i.guildId || invite.inviter?.id !== i.user.id) continue;
      if (
        typeof invite.code !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(invite.code) ||
        !Number.isSafeInteger(invite.uses) ||
        invite.uses < 0 ||
        !Number.isSafeInteger(invite.maxUses) ||
        invite.maxUses < 0 ||
        !Number.isSafeInteger(invite.maxAge) ||
        invite.maxAge < 0 ||
        typeof invite.temporary !== 'boolean' ||
        (invite.expiresTimestamp !== null && !Number.isSafeInteger(invite.expiresTimestamp))
      )
        throw new UserError('inviteInfoUnavailable');
      if (invite.expiresTimestamp !== null && invite.expiresTimestamp <= Date.now()) continue;
      records.push({
        code: invite.code,
        uses: invite.uses,
        maxUses: invite.maxUses,
        maxAgeSeconds: invite.maxAge,
        temporary: invite.temporary,
        expiresAt: invite.expiresTimestamp,
      });
    }
    records.sort((a, b) => a.code.localeCompare(b.code));
    const observed = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (
      observed?.id !== i.user.id ||
      observed.guild?.id !== i.guildId ||
      observed.user?.bot !== false
    )
      throw new UserError('inviteInfoUnavailable');
    const locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'inviteInfoStatus'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false },
          files: [
            new AttachmentBuilder(
              Buffer.from(
                JSON.stringify(
                  {
                    total: records.length,
                    truncated: records.length > 25,
                    records: records.slice(0, 25),
                  },
                  null,
                  2,
                ) + '\n',
              ),
              { name: 'emika-own-invites.json' },
            ),
          ],
        },
        { locale },
      ),
    );
  },
};
