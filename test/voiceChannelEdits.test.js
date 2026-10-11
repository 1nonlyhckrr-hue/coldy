import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { VoiceReadiness } from '../src/services/voiceReadiness.js';
import { editEmptyVoiceChannel } from '../src/services/voiceChannelEdits.js';
import command from '../src/commands/utility/channel.js';
import { translate } from '../src/services/localization.js';
function setup() {
  const db = openDatabase(':memory:'),
    calls = [],
    ready = new VoiceReadiness();
  ready.initialReady();
  const actor = { id: 'u', guild: { id: 'g' } },
    bot = { id: 'b', guild: { id: 'g' } },
    ch = {
      id: '100000000000000001',
      guildId: 'g',
      type: 2,
      userLimit: 0,
      bitrate: 64000,
      rtcRegion: 'india',
      permissionsFor: () => ({ has: () => true }),
      setUserLimit: async (v) => {
        calls.push(v);
        ch.userLimit = v;
      },
      setBitrate: async (v) => {
        calls.push(v);
        ch.bitrate = v;
      },
      setRTCRegion: async (v) => {
        calls.push(v);
        ch.rtcRegion = v;
      },
    };
  const i = {
    id: 'i',
    guildId: 'g',
    user: { id: 'u' },
    client: { user: { id: 'b' }, isReady: () => true },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      voiceStates: { cache: new Map() },
      channels: { fetch: async () => ch },
      members: { fetch: async () => actor, fetchMe: async () => bot },
    },
  };
  return {
    db,
    c: {
      cases: new ModerationCases(db),
      config: { voiceEventsEnabled: true },
      voiceReadiness: ready,
    },
    i,
    actor,
    bot,
    ch,
    calls,
  };
}
test('emptyvoicechannel limit/bitrate/autoregion exacteffects/observation/cases no-op no access/moves', async () => {
  const s = setup();
  try {
    for (const [action, value] of [
      ['voicelimit', 5],
      ['voicebitrate', 96],
      ['voiceregionauto', undefined],
    ]) {
      s.i.id = action;
      await editEmptyVoiceChannel(s.i, s.c, { channelId: s.ch.id, action, value, confirm: true });
    }
    assert.deepEqual(s.calls, [5, 96000, null]);
    assert.equal(
      (
        await editEmptyVoiceChannel(s.i, s.c, {
          channelId: s.ch.id,
          action: 'voicelimit',
          value: 5,
          confirm: true,
        })
      ).changed,
      false,
    );
    assert(
      s.db
        .prepare('SELECT status FROM moderation_cases')
        .all()
        .every((r) => r.status === 'completed'),
    );
  } finally {
    s.db.close();
  }
});
test('emptyvoicechannel readiness/occupancy/permission/identity/confirmation/input/unknown effects fail closed', async () => {
  for (const kind of [
    'confirm',
    'input',
    'occupied',
    'runtime',
    'unsafe',
    'actor',
    'bot',
    'permission',
    'network',
    'observe',
    'storage',
  ]) {
    const s = setup();
    try {
      if (kind === 'occupied') s.i.guild.voiceStates.cache.set('u', { channelId: s.ch.id });
      if (kind === 'runtime') s.c.config.voiceEventsEnabled = false;
      if (kind === 'unsafe') s.c.voiceReadiness.disconnected(0);
      if (kind === 'actor') s.actor.id = 'wrong';
      if (kind === 'bot') s.bot.id = 'wrong';
      if (kind === 'permission') s.ch.permissionsFor = () => ({ has: () => false });
      if (kind === 'network')
        s.ch.setBitrate = async (v) => {
          s.calls.push(v);
          throw Error('network');
        };
      if (kind === 'observe')
        s.ch.setBitrate = async (v) => {
          s.calls.push(v);
        };
      if (kind === 'storage')
        s.c.cases.finish = () => {
          throw Error('db');
        };
      const args = {
        channelId: s.ch.id,
        action: 'voicebitrate',
        value: kind === 'input' ? 97 : 96,
        confirm: kind !== 'confirm',
      };
      await assert.rejects(() => editEmptyVoiceChannel(s.i, s.c, args));
      const effect = ['network', 'observe', 'storage'].includes(kind);
      assert.equal(s.calls.length, effect ? 1 : 0);
      if (effect) {
        s.i.id = 'retry';
        await assert.rejects(
          () => editEmptyVoiceChannel(s.i, s.c, { ...args, action: 'voiceregionauto' }),
          /voiceChannelUncertain/,
        );
        assert.equal(s.calls.length, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('emptyvoice threepaths private3locale sharedembeds confirmednativeobserved no pings', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
      let sub = 'voicelimit',
        reply;
      s.i.deferReply = async (p) => assert.equal(p.flags, 64);
      s.i.editReply = async (p) => {
        reply = p;
      };
      s.i.options = {
        getSubcommand: () => sub,
        getChannel: () => s.ch,
        getBoolean: () => true,
        getInteger: (n) => (n === 'page' ? null : sub === 'voicelimit' ? 5 : 96),
      };
      for (sub of ['voicelimit', 'voicebitrate', 'voiceregionauto']) {
        s.i.id = sub;
        await command.execute(s.i, s.c);
        assert.deepEqual(reply.allowedMentions.parse, []);
      }
      assert.deepEqual(s.calls, [5, 96000, null]);
    } finally {
      s.db.close();
    }
  }
});
