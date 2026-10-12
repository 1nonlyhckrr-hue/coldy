import {
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits as P,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { reactEmojis, reactTrigger, reactionEmoji } from '../../services/autoreact.js';
import { UserError } from '../../utils/errors.js';
import { lunaPayload } from '../../utils/embeds.js';
import { translate } from '../../services/localization.js';
async function manager(i) {
  if (i.guild?.id !== i.guildId) throw new UserError('guildOnly');
  const m = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (m?.id !== i.user.id || m.guild?.id !== i.guildId || !m.permissions?.has(P.ManageGuild))
    throw new UserError('userPermission');
}
const data = new SlashCommandBuilder()
  .setName('react')
  .setDescription('Opt-in literal single-word auto-reaction rules,normal text channels only.')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(P.ManageGuild);
for (const sub of ['add', 'remove', 'list', 'reset'])
  data.addSubcommand((s) => {
    s.setName(sub).setDescription(
      {
        add: 'Set one singleword trigger with1-10distinct emojiJSONstrings,max10rules;futuremessagesonly.',
        remove: 'Remove one literal singleword rule;existing reactions unchanged.',
        list: 'Private saved trigger/emojiJSON,not native reactions proof.',
        reset: 'Clear all auto-reaction rules only;existing reactions and receipts unchanged.',
      }[sub],
    );
    if (['add', 'remove'].includes(sub))
      s.addStringOption((o) =>
        o
          .setName('trigger')
          .setDescription('1-50letter/digit/underscore word,NFKClowercase match')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50),
      );
    if (sub === 'add')
      s.addStringOption((o) =>
        o
          .setName('emojis')
          .setDescription('JSONarray1-10Unicodeemoji or currentguildemoji-ID strings')
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(1000),
      );
    return s;
  });
export default {
  category: 'automations',
  data,
  async execute(i, c) {
    await manager(i);
    const sub = i.options.getSubcommand();
    if (sub === 'add') {
      if (c.config.messageEventsEnabled !== true) throw new UserError('autoreactEvents');
      const trigger = i.options.getString('trigger', true),
        text = i.options.getString('emojis', true);
      reactTrigger(trigger);
      for (const emoji of reactEmojis(text)) await reactionEmoji(i.guild, emoji);
      await manager(i);
      if (c.config.messageEventsEnabled !== true) throw new UserError('autoreactEvents');
      c.autoReactions.add(i.guildId, trigger, text);
    } else if (sub === 'remove')
      c.autoReactions.remove(i.guildId, i.options.getString('trigger', true));
    else if (sub === 'reset') c.autoReactions.reset(i.guildId);
    else if (sub !== 'list') throw new UserError('unknownCommand');
    const records = c.autoReactions
        .list(i.guildId)
        .map(({ trigger, emojis }) => ({ trigger, emojis })),
      locale = c.guildConfig.get(i.guildId).language;
    await i.reply(
      lunaPayload(
        {
          content: translate(locale, 'autoreactStatus'),
          flags: MessageFlags.Ephemeral,
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify({ records }, null, 2) + '\n'), {
              name: 'emika-autoreact-policy.json',
            }),
          ],
          allowedMentions: { parse: [], repliedUser: false },
        },
        { locale },
      ),
    );
  },
};
