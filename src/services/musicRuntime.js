import { UserError } from '../utils/errors.js';
import { requireVoiceReady, voiceOccupancy } from './voiceReadiness.js';
import { PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { LavalinkAdapter } from './lavalinkAdapter.js';
export function musicRequest(query) {
  if (
    typeof query !== 'string' ||
    !query.trim() ||
    query.length > 180 ||
    /[\x00-\x1f\x7f]/.test(query)
  )
    throw new UserError('musicQueryInvalid');
  query = query.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(query))
    return {
      url: 'https://www.youtube.com/watch?v=' + query,
      title: 'YouTube ' + query,
      author: 'YouTube',
      id: query,
    };
  if (/https?:|www\.|^[a-z]+:|[<>]/i.test(query)) throw new UserError('musicQueryInvalid');
  return { url: 'ytsearch:' + query, title: query, author: 'YouTube', id: 'search' };
}
export function validateMusicNodeConfig({
  enabled = false,
  riskAccepted = false,
  url = '',
  auth = '',
} = {}) {
  if (!enabled) return null;
  if (riskAccepted !== true) throw new Error('Music risk acknowledgement required');
  if (typeof auth !== 'string' || !auth || auth.length > 500)
    throw new Error('Music node auth required');
  let u;
  try {
    u = new URL('https://' + url);
  } catch {
    throw new Error('Invalid music node address');
  }
  if (
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash ||
    !u.hostname.includes('.') ||
    /^(?:\d+\.){3}\d+$/.test(u.hostname) ||
    u.hostname.endsWith('.local') ||
    u.hostname.endsWith('.internal') ||
    url.includes('://')
  )
    throw new Error('Invalid music node address');
  return { name: 'luna-music', url: u.host, auth, secure: true };
}
export class YouTubeLavalinkAdapter extends LavalinkAdapter {
  constructor(manager) {
    super(manager);
    this.requiredSource = 'youtube';
  }
  node() {
    const node = super.node();
    if (!node.info.sourceManagers.includes('youtube')) throw new UserError('musicLoadFailed');
    return node;
  }
  async resolve(item) {
    const result = await this.node().rest.resolve(item.url);
    const track =
      result?.loadType === 'search'
        ? result.data?.[0]
        : result?.loadType === 'track'
          ? result.data
          : null;
    const info = track?.info;
    if (
      !track?.encoded ||
      typeof track.encoded !== 'string' ||
      info?.sourceName !== 'youtube' ||
      info.isStream ||
      typeof info.identifier !== 'string' ||
      !/^[A-Za-z0-9_-]{11}$/.test(info.identifier) ||
      typeof info.title !== 'string' ||
      typeof info.author !== 'string' ||
      !Number.isFinite(info.length) ||
      info.length <= 0 ||
      info.length > 7200000 ||
      (item.id !== 'search' && info.identifier !== item.id)
    )
      throw new UserError('musicLoadFailed');
    return {
      encoded: track.encoded,
      item: {
        id: info.identifier,
        title: info.title.slice(0, 100),
        author: info.author.slice(0, 100),
      },
    };
  }
}
export async function requireMusicVoice(i, c, { joining = false } = {}) {
  if (!c.music) throw new UserError('musicRuntimeDisabled');
  requireVoiceReady(i, c);
  if (!i.guildId || i.guild?.id !== i.guildId) throw new UserError('musicVoiceDenied');
  const actor = await i.guild.members.fetch({ user: i.user.id, force: true });
  const bot = await i.guild.members.fetchMe({ force: true });
  if (
    actor?.id !== i.user.id ||
    actor.guild?.id !== i.guildId ||
    bot?.id !== i.client?.user?.id ||
    bot.guild?.id !== i.guildId ||
    actor.user?.bot ||
    !actor.voice?.channelId
  )
    throw new UserError('musicVoiceDenied');
  const channel = await i.guild.channels.fetch(actor.voice.channelId, { force: true });
  if (
    channel?.id !== actor.voice.channelId ||
    channel.guildId !== i.guildId ||
    channel.type !== ChannelType.GuildVoice
  )
    throw new UserError('musicVoiceDenied');
  if (
    !channel.permissionsFor(actor)?.has([P.ViewChannel, P.Connect]) ||
    !channel.permissionsFor(bot)?.has([P.ViewChannel, P.Connect, P.Speak]) ||
    !i.appPermissions?.has([P.Connect, P.Speak])
  )
    throw new UserError('musicVoiceDenied');
  const s = c.music.snapshot(i.guildId);
  if (s && s.channelId !== channel.id) throw new UserError('musicDifferentChannel');
  if (bot.voice?.channelId && bot.voice.channelId !== channel.id)
    throw new UserError('musicDifferentChannel');
  if (
    joining &&
    !bot.voice?.channelId &&
    channel.userLimit > 0 &&
    voiceOccupancy(i.guild, channel.id) >= channel.userLimit
  )
    throw new UserError('voiceChannelFull');
  const current = await i.guild.members.fetch({ user: i.user.id, force: true });
  if (
    current?.id !== i.user.id ||
    current.guild?.id !== i.guildId ||
    current.voice?.channelId !== channel.id
  )
    throw new UserError('voiceMoved');
  requireVoiceReady(i, c);
  return { channel, actor: current };
}
