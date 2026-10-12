import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { editPrivateVoice } from './voiceMaster.js';
import { UserError, handleInteractionError } from '../utils/errors.js';
import { lunaPayload } from '../utils/embeds.js';
import { translate } from './localization.js';
export class VoiceControls {
  constructor(db, now = Date.now) {
    this.db = db;
    this.now = now;
  }
  create(g, u, id) {
    const token = randomUUID();
    this.db
      .prepare("INSERT INTO vm_control_panels VALUES(?,?,?,?,?,'ready')")
      .run(token, g, u, id, this.now() + 600000);
    return token;
  }
  get(token) {
    return this.db.prepare('SELECT * FROM vm_control_panels WHERE token=?').get(token);
  }
  reserve(token) {
    return (
      this.db
        .prepare(
          "UPDATE vm_control_panels SET status='reserved' WHERE token=? AND status='ready' AND expires_at>?",
        )
        .run(token, this.now()).changes === 1
    );
  }
  finish(token, status) {
    this.db
      .prepare("UPDATE vm_control_panels SET status=? WHERE token=? AND status='reserved'")
      .run(status, token);
  }
  recover() {
    this.db
      .prepare("UPDATE vm_control_panels SET status='uncertain' WHERE status='reserved'")
      .run();
  }
  cleanup() {
    this.db.prepare('DELETE FROM vm_control_panels WHERE expires_at<?').run(this.now() - 86400000);
  }
}
export async function privateVoiceControls(i, c) {
  const member = await i.guild.members.fetch({ user: i.user.id, force: true }),
    row = c.voiceMaster.owned(i.guildId, i.user.id);
  if (
    i.guild?.id !== i.guildId ||
    member?.id !== i.user.id ||
    member.guild?.id !== i.guildId ||
    member.user?.bot !== false ||
    row?.status !== 'active'
  )
    throw new UserError('vmNotActive');
  const token = c.voiceControls.create(i.guildId, i.user.id, row.id),
    locale = c.localization.locale(i.guildId);
  return {
    content: translate(locale, 'vmControlStatus'),
    components: [
      new ActionRowBuilder().addComponents(
        ...['lock', 'unlock', 'close'].map((action) =>
          new ButtonBuilder()
            .setCustomId('luna:vm:' + token + ':' + action)
            .setLabel(translate(locale, 'vmControl_' + action))
            .setStyle(action === 'close' ? ButtonStyle.Danger : ButtonStyle.Secondary),
        ),
      ),
    ],
    allowedMentions: { parse: [], repliedUser: false },
  };
}
export function createVoiceControlHandler(c) {
  return async (i) => {
    if (!i.isButton() || !i.customId?.startsWith('luna:vm:')) return false;
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const match = /^luna:vm:([a-f0-9-]{36}):(lock|unlock|close)$/.exec(i.customId);
      if (!match) throw new UserError('vmControlExpired');
      const panel = c.voiceControls.get(match[1]),
        row = c.voiceMaster.owned(i.guildId, i.user.id);
      if (
        !panel ||
        panel.guild_id !== i.guildId ||
        panel.owner_id !== i.user.id ||
        panel.expires_at <= c.voiceControls.now() ||
        panel.status !== 'ready' ||
        row?.id !== panel.channel_row ||
        row.status !== 'active'
      )
        throw new UserError('vmControlExpired');
      if (!c.voiceControls.reserve(panel.token)) throw new UserError('vmControlExpired');
      try {
        const id = await editPrivateVoice(i, c, { action: match[2], share: match[2] === 'unlock' });
        c.voiceControls.finish(panel.token, 'completed');
        await i.editReply(
          lunaPayload(
            {
              content: c.localization.t(i.guildId, 'vmEdited', { id }),
              allowedMentions: { parse: [], repliedUser: false },
            },
            { locale: c.localization.locale(i.guildId) },
          ),
        );
      } catch (error) {
        c.voiceControls.finish(panel.token, 'uncertain');
        throw error;
      }
    } catch (error) {
      await handleInteractionError(error, i, c.logger, c.localization);
    }
    return true;
  };
}
