import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { musicRequest, requireMusicVoice } from '../../services/musicRuntime.js';
import { translate } from '../../services/localization.js';
import { lunaPayload } from '../../utils/embeds.js';
const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Opt-in experimental public-node YouTube playback;source/uptime risks apply.')
  .setContexts(InteractionContextType.Guild);
data.addSubcommand((s) =>
  s
    .setName('play')
    .setDescription('Queue first YouTube search result or exact11-character video ID.')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Search words or video ID;no URLs/playlists/live streams')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(180),
    ),
);
for (const [name, description] of [
  ['pause', 'Pause current track.'],
  ['resume', 'Resume current track.'],
  ['stop', 'Disconnect and clear this server session.'],
  ['queue', 'Show current in-memory queue;not persistent history.'],
  ['nowplaying', 'Show current track.'],
])
  data.addSubcommand((s) => s.setName(name).setDescription(description));
data.addSubcommand((s) =>
  s
    .setName('stay')
    .setDescription(
      'Keep idle VC connection while this process/node are healthy;not uptime guarantee.',
    )
    .addBooleanOption((o) =>
      o.setName('enabled').setDescription('Keep connection after queue ends').setRequired(true),
    ),
);
const clean = (s) =>
  escapeMarkdown(
    String(s)
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .slice(0, 100),
  );
export default {
  category: 'music',
  data,
  cooldownMs: 5000,
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = i.options.getSubcommand(),
      locale = c.localization?.locale(i.guildId) ?? c.guildConfig?.language(i.guildId) ?? 'en',
      t = (k, v) => translate(locale, k, v);
    const { channel } = await requireMusicVoice(i, c, { joining: sub === 'play' });
    if (sub === 'play')
      await c.music.enqueueItem(
        i.guildId,
        channel.id,
        musicRequest(i.options.getString('query', true)),
        i.user.id,
      );
    if (sub === 'pause' || sub === 'resume') await c.music.pause(i.guildId, sub === 'pause');
    if (sub === 'stop') await c.music.stop(i.guildId);
    if (sub === 'stay') await c.music.stay(i.guildId, i.options.getBoolean('enabled', true));
    const s = c.music.snapshot(i.guildId),
      current = s?.current
        ? t('musicTrack', { title: clean(s.current.title), author: clean(s.current.author) })
        : t('musicNone');
    let content = t('musicHeader') + '\n' + t('musicAction_' + sub) + '\n' + current;
    if (sub === 'queue')
      content +=
        '\n' +
        (s?.queue.length
          ? s.queue
              .slice(0, 10)
              .map((r, n) => `${n + 1}. ${clean(r.title)} | ${clean(r.author)}`)
              .join('\n')
          : t('musicQueueEmpty')) +
        '\n' +
        t('musicQueueCount', { n: s?.queue.length ?? 0 });
    if (s)
      content +=
        '\n' +
        t('musicSession', {
          state: clean(s.status),
          stay: String(s.keepConnected),
          paused: String(s.paused),
        });
    await i.editReply(lunaPayload({ content, allowedMentions: { parse: [] } }, { locale }));
  },
};
