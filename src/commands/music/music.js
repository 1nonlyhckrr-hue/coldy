import {
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { UserError } from '../../utils/errors.js';
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
  ['skip', 'Stop current track once and advance waiting queue;uncertain failures freeze.'],
  ['nowplaying', 'Show current track.'],
])
  data.addSubcommand((s) => s.setName(name).setDescription(description));
data.addSubcommand((s) =>
  s
    .setName('queue')
    .setDescription('Show ten queued tracks per page;current track separate.')
    .addIntegerOption((o) =>
      o.setName('page').setDescription('Queue page1-5').setMinValue(1).setMaxValue(5),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('remove')
    .setDescription('Remove one queued position;never stops current track.')
    .addIntegerOption((o) =>
      o
        .setName('position')
        .setDescription('Exact queue position1-50')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true),
    ),
);
data.addSubcommand((s) =>
  s
    .setName('move')
    .setDescription(
      'Move one waiting track to exact final queue position;current playback untouched.',
    )
    .addIntegerOption((o) =>
      o
        .setName('from')
        .setDescription('Waiting queue source1-50')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('to')
        .setDescription('Final queue destination1-50')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true),
    ),
);
for (const [name, description] of [
  ['clear', 'Clear waiting tracks only;current track keeps playing.'],
  ['shuffle', 'Randomize waiting tracks only;current track unchanged.'],
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
    const channelId = channel.id;
    if (sub === 'play')
      await c.music.enqueueItem(
        i.guildId,
        channelId,
        musicRequest(i.options.getString('query', true)),
        i.user.id,
        {
          beforeEffect: async () => {
            const now = await requireMusicVoice(i, c, { joining: true });
            if (now.channel.id !== channelId) throw new UserError('voiceMoved');
          },
        },
      );
    if (['remove', 'clear', 'shuffle'].includes(sub))
      await c.music.editQueue(
        i.guildId,
        sub,
        sub === 'remove' ? i.options.getInteger('position', true) : undefined,
      );
    if (sub === 'move')
      await c.music.moveQueued(
        i.guildId,
        i.options.getInteger('from', true),
        i.options.getInteger('to', true),
        {
          beforeEffect: async () => {
            const now = await requireMusicVoice(i, c);
            if (now.channel.id !== channelId) throw new UserError('voiceMoved');
          },
        },
      );
    if (sub === 'pause' || sub === 'resume') await c.music.pause(i.guildId, sub === 'pause');
    if (sub === 'skip')
      await c.music.skip(i.guildId, {
        beforeEffect: async () => {
          const now = await requireMusicVoice(i, c);
          if (now.channel.id !== channelId) throw new UserError('voiceMoved');
        },
      });
    if (sub === 'stop') await c.music.stop(i.guildId);
    if (sub === 'stay') await c.music.stay(i.guildId, i.options.getBoolean('enabled', true));
    const s = c.music.snapshot(i.guildId),
      current = s?.current
        ? t('musicTrack', { title: clean(s.current.title), author: clean(s.current.author) })
        : t('musicNone');
    let content = t('musicHeader') + '\n' + t('musicAction_' + sub) + '\n' + current;
    if (sub === 'queue') {
      const page = i.options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > 5)
        throw new UserError('musicQueuePosition');
      content += '\n' + t('musicQueuePage', { page });
      content +=
        '\n' +
        (s?.queue.slice((page - 1) * 10, page * 10).length
          ? s.queue
              .slice((page - 1) * 10, page * 10)
              .map((r, n) => `${(page - 1) * 10 + n + 1}. ${clean(r.title)} | ${clean(r.author)}`)
              .join('\n')
          : t('musicQueueEmpty')) +
        '\n' +
        t('musicQueueCount', { n: s?.queue.length ?? 0 });
    }
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
