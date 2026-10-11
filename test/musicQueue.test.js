import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicQueues } from '../src/services/musicQueue.js';
import { validateMusicCatalog, requireDaveNode } from '../src/services/musicPolicy.js';
import { LavalinkAdapter } from '../src/services/lavalinkAdapter.js';
const catalog = [
  {
    id: 'sample',
    title: 'Owner sample',
    author: 'Owner',
    url: 'https://audio.example.com/sample.mp3',
    rightsCleared: true,
    rightsNote: 'TEST FIXTURE ONLY, not a real approved audio source',
  },
];
function setup() {
  const calls = [],
    adapter = {
      resolve: async () => ({ encoded: 'track' }),
      join: async (...a) => calls.push(['join', ...a]),
      play: async (...a) => calls.push(['play', ...a]),
      leave: async (...a) => calls.push(['leave', ...a]),
      pause: async (...a) => calls.push(['pause', ...a]),
    };
  return { calls, adapter, q: new MusicQueues(adapter, catalog) };
}
test('catalog requires explicit reviewed rights and direct safe HTTPS file, not arbitrary user URLs', () => {
  assert.equal(validateMusicCatalog(catalog)[0].id, 'sample');
  for (const change of [
    { rightsCleared: false },
    { rightsNote: '' },
    { url: 'http://audio.example.com/a.mp3' },
    { url: 'https://127.0.0.1/a.mp3' },
    { url: 'https://audio.local/a.mp3' },
    { url: 'https://user:pass@audio.example.com/a.mp3' },
    { url: 'https://audio.example.com/a.mp3?token=secret' },
    { url: 'https://youtube.com/watch' },
    { id: 'BAD' },
  ])
    assert.throws(() => validateMusicCatalog([{ ...catalog[0], ...change }]));
  assert.throws(() => validateMusicCatalog([catalog[0], catalog[0]]));
});
test('node requires stable4.2+ and HTTP source support, not genericV4 claim', () => {
  assert(requireDaveNode({ version: { major: 4, minor: 2 }, sourceManagers: ['http'] }));
  for (const info of [
    null,
    { version: { major: 4, minor: 1 }, sourceManagers: ['http'] },
    { version: { major: 4, minor: 2, preRelease: 'beta' }, sourceManagers: ['http'] },
    { version: { major: 4, minor: 2 }, sourceManagers: ['youtube'] },
  ])
    assert.throws(() => requireDaveNode(info));
});
test('music joins once, enqueues bounded queue and only matching finished event advances', async () => {
  const s = setup();
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  const token = s.q.sessions.get('g').current.eventId;
  assert.equal(s.calls.filter((x) => x[0] === 'join').length, 1);
  assert.equal(s.q.snapshot('g').queue.length, 1);
  await s.q.ended('g', 'old', 'finished');
  assert.equal(s.q.snapshot('g').queue.length, 1);
  await s.q.ended('g', token, 'finished');
  assert.equal(s.q.snapshot('g').queue.length, 0);
  await s.q.ended('g', token, 'finished');
  assert(s.q.snapshot('g').current);
});
test('finished queue leaves unless24/7 stay is explicitly enabled', async () => {
  for (const stay of [false, true]) {
    const s = setup();
    await s.q.enqueue('g', 'vc', 'sample', 'u');
    if (stay) await s.q.stay('g', true);
    await s.q.ended('g', s.q.sessions.get('g').current.eventId, 'finished');
    assert.equal(s.q.snapshot('g') !== null, stay);
    if (stay) {
      assert.equal(s.q.snapshot('g').status, 'idle');
      await s.q.stay('g', false);
      assert.equal(s.q.snapshot('g'), null);
    }
  }
});
test('provider play/join uncertainty freezes without retry/cascade', async () => {
  for (const operation of ['play', 'join']) {
    const s = setup();
    let n = 0;
    s.adapter[operation] = async () => {
      n++;
      throw new Error('SECRET');
    };
    await assert.rejects(
      () => s.q.enqueue('g', 'vc', 'sample', 'u'),
      (e) => !e.message.includes('SECRET'),
    );
    await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
    assert.equal(n, 1);
    assert.equal(s.q.snapshot('g').status, 'uncertain');
    await s.q.stop('g');
    assert.equal(s.q.snapshot('g'), null);
  }
});
test('track exception freezes queue, pause failure contained and stop clears only after leave', async () => {
  const s = setup();
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  await s.q.ended('g', s.q.sessions.get('g').current.eventId, 'error');
  assert.equal(s.calls.filter((x) => x[0] === 'play').length, 1);
  assert.equal(s.q.snapshot('g').status, 'uncertain');
  await assert.rejects(() => s.q.pause('g', true));
  s.adapter.leave = async () => {
    throw new Error('network');
  };
  await assert.rejects(() => s.q.stop('g'));
  assert(s.q.snapshot('g'));
});
test('pause/resume, catalog/queue/channel/session limits and lock gates work', async () => {
  const s = setup();
  s.q.maxTracks = 2;
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  await s.q.pause('g', true);
  assert.equal(s.q.snapshot('g').paused, true);
  await s.q.pause('g', false);
  assert.equal(s.q.snapshot('g').paused, false);
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicQueueFull/);
  await assert.rejects(() => s.q.enqueue('g', 'other', 'sample', 'u'), /musicDifferentChannel/);
  await assert.rejects(() => s.q.enqueue('new', 'vc', 'absent', 'u'), /musicCatalogMissing/);
  s.q.maxGuilds = 1;
  await assert.rejects(() => s.q.enqueue('new', 'vc', 'sample', 'u'), /musicGuildLimit/);
  s.q.active.add('g');
  await assert.rejects(() => s.q.stop('g'), /musicBusy/);
});
test('adapter resolves only exact direct HTTP audio, refuses substituted tracks/playlists', async () => {
  const node = {
    state: 1,
    info: { version: { major: 4, minor: 2 }, sourceManagers: ['http'] },
    rest: {
      resolve: async () => ({
        loadType: 'track',
        data: {
          encoded: 'test',
          info: { sourceName: 'http', isStream: false, uri: catalog[0].url },
        },
      }),
    },
  };
  const a = new LavalinkAdapter({ nodes: new Map([['n', node]]) });
  assert.equal((await a.resolve(catalog[0])).encoded, 'test');
  for (const result of [
    { loadType: 'playlist', data: {} },
    { loadType: 'track', data: { info: { sourceName: 'youtube', uri: catalog[0].url } } },
    {
      loadType: 'track',
      data: { info: { sourceName: 'http', isStream: true, uri: catalog[0].url } },
    },
  ]) {
    node.rest.resolve = async () => result;
    await assert.rejects(() => a.resolve(catalog[0]));
  }
});

test('adapter uses server-echoed per-play userData token so repeated encoded tracks cannot consume stale ends', async () => {
  const { EventEmitter } = await import('node:events');
  const player = new EventEmitter(),
    plays = [],
    manager = {
      nodes: new Map([
        ['n', { state: 1, info: { version: { major: 4, minor: 2 }, sourceManagers: ['http'] } }],
      ]),
      players: new Map([['g', player]]),
      joinVoiceChannel: async () => player,
    };
  player.playTrack = async (p) => plays.push(p);
  const a = new LavalinkAdapter(manager),
    ends = [];
  a.onEnded = async (...args) => ends.push(args);
  await a.join('g', 'vc');
  await a.play('g', 'same', 'old');
  await a.play('g', 'same', 'new');
  player.emit('end', {
    track: { encoded: 'same', userData: { lunaEventId: 'old' } },
    reason: 'finished',
  });
  assert.equal(ends.length, 0);
  player.emit('end', {
    track: { encoded: 'same', userData: { lunaEventId: 'new' } },
    reason: 'finished',
  });
  assert.deepEqual(ends[0], ['g', 'new', 'finished']);
  assert.equal(plays[1].track.userData.lunaEventId, 'new');
});
test('failed resolve releases newly reserved queue capacity without joining', async () => {
  for (const mode of ['throws', 'empty']) {
    const s = setup();
    s.adapter.resolve = async () => {
      if (mode === 'throws') throw new Error('provider');
      return null;
    };
    await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'));
    assert.equal(s.q.snapshot('g'), null);
    assert.equal(s.calls.length, 0);
  }
});

test('queue remove targets waiting position only and invalid values preserve all state', async () => {
  const s = setup();
  for (let n = 0; n < 4; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const current = s.q.sessions.get('g').current;
  const waiting = [...s.q.sessions.get('g').queue];
  const calls = s.calls.length;
  for (const position of [0, -1, 4, 1.5, '1', null])
    await assert.rejects(() => s.q.editQueue('g', 'remove', position), /musicQueuePosition/);
  assert.deepEqual(s.q.sessions.get('g').queue, waiting);
  await s.q.editQueue('g', 'remove', 2);
  assert.deepEqual(s.q.sessions.get('g').queue, [waiting[0], waiting[2]]);
  assert.equal(s.q.sessions.get('g').current, current);
  assert.equal(s.calls.length, calls);
});
test('queue clear and shuffle never affect current playback or provider', async () => {
  const s = setup();
  for (let n = 0; n < 5; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  await s.q.pause('g', true);
  await s.q.stay('g', true);
  const session = s.q.sessions.get('g'),
    current = session.current;
  const ids = session.queue.map((t) => t.eventId).sort(),
    calls = s.calls.length;
  await s.q.editQueue('g', 'shuffle', undefined, () => 0);
  assert.deepEqual(session.queue.map((t) => t.eventId).sort(), ids);
  assert.equal(session.current, current);
  assert.equal(session.paused, true);
  assert.equal(session.keepConnected, true);
  await s.q.editQueue('g', 'clear');
  assert.equal(session.queue.length, 0);
  assert.equal(session.current, current);
  assert.equal(s.calls.length, calls);
});
test('queue edits reject missing, uncertain, locked, invalid action and bad RNG without mutation', async () => {
  const s = setup();
  await assert.rejects(() => s.q.editQueue('g', 'clear'), /musicNoSession/);
  for (let n = 0; n < 4; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const before = [...s.q.sessions.get('g').queue];
  let n = 0;
  await assert.rejects(() => s.q.editQueue('g', 'shuffle', undefined, () => (++n === 1 ? 0 : 99)));
  await assert.rejects(() => s.q.editQueue('g', 'other'));
  assert.deepEqual(s.q.sessions.get('g').queue, before);
  s.q.active.add('g');
  await assert.rejects(() => s.q.editQueue('g', 'clear'), /musicBusy/);
  s.q.active.delete('g');
  s.q.sessions.get('g').status = 'uncertain';
  for (const action of ['clear', 'shuffle', 'remove'])
    await assert.rejects(() => s.q.editQueue('g', action, 1), /musicUncertain/);
  assert.deepEqual(s.q.sessions.get('g').queue, before);
});
test('uncertain current track cannot cascade on a late finished event', async () => {
  const s = setup();
  for (let n = 0; n < 2; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const event = s.q.sessions.get('g').current.eventId,
    calls = s.calls.length;
  await s.q.ended('g', event, 'error');
  assert.equal(await s.q.ended('g', event, 'finished'), false);
  assert.equal(s.q.snapshot('g').queue.length, 1);
  assert.equal(s.q.snapshot('g').status, 'uncertain');
  assert.equal(s.calls.length, calls);
});

test('malformed node version/source types cannot satisfy stable compatibility guard', () => {
  for (const minor of [undefined, null, NaN, Infinity, '2', 2.1])
    assert.throws(() =>
      requireDaveNode({ version: { major: 4, minor }, sourceManagers: ['http'] }),
    );
  for (const sourceManagers of ['http', null, { includes: () => true }])
    assert.throws(() => requireDaveNode({ version: { major: 4, minor: 2 }, sourceManagers }));
});
test('post-resolution lost voice authority removes unjoined reservation without native effect', async () => {
  const s = setup();
  let checks = 0;
  await assert.rejects(
    () =>
      s.q.enqueueItem('g', 'vc', catalog[0], 'u', {
        beforeEffect: async () => {
          checks++;
          throw new Error('voiceMoved');
        },
      }),
    /voiceMoved/,
  );
  assert.equal(checks, 1);
  assert.equal(s.q.snapshot('g'), null);
  assert.equal(s.calls.length, 0);
});
test('post-join lost voice authority freezes joined session without playback or automatic disconnect', async () => {
  const s = setup();
  let checks = 0;
  await assert.rejects(
    () =>
      s.q.enqueueItem('g', 'vc', catalog[0], 'u', {
        beforeEffect: async () => {
          if (++checks === 2) throw new Error('voiceMoved');
        },
      }),
    /voiceMoved/,
  );
  assert.deepEqual(s.calls, [['join', 'g', 'vc']]);
  assert.equal(s.q.snapshot('g').status, 'uncertain');
  assert.equal(s.q.snapshot('g').current, null);
  await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
  await s.q.stop('g');
  assert.equal(s.q.snapshot('g'), null);
});
test('existing session delayed resolve denial preserves queue and current track', async () => {
  const s = setup();
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  const before = s.q.snapshot('g'),
    calls = s.calls.length;
  await assert.rejects(() =>
    s.q.enqueueItem('g', 'vc', catalog[0], 'u', {
      beforeEffect: async () => {
        throw new Error('voiceMoved');
      },
    }),
  );
  assert.deepEqual(s.q.snapshot('g'), before);
  assert.equal(s.calls.length, calls);
});

test('observed stable4.2.2 metadata shape passes strict guard without enabling a provider', () => {
  const observed = {
    version: { semver: '4.2.2', major: 4, minor: 2, patch: 2, preRelease: '' },
    sourceManagers: ['youtube', 'http'],
  };
  assert.equal(requireDaveNode(observed, 'youtube'), true);
  assert.equal(requireDaveNode(observed, 'http'), true);
  assert.throws(() =>
    requireDaveNode(
      { ...observed, version: { ...observed.version, preRelease: 'SNAPSHOT' } },
      'youtube',
    ),
  );
});

test('explicit skip confirms stop once then advances only one waiting track and ignores stopped ack', async () => {
  const s = setup();
  for (let n = 0; n < 3; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const old = s.q.sessions.get('g').current.eventId;
  let stops = 0;
  s.adapter.stopTrack = async () => {
    stops++;
    assert.equal(await s.q.ended('g', old, 'stopped'), false);
  };
  await s.q.skip('g');
  assert.equal(stops, 1);
  assert.equal(s.q.snapshot('g').queue.length, 1);
  assert.notEqual(s.q.sessions.get('g').current.eventId, old);
  assert.equal(await s.q.ended('g', old, 'stopped'), false);
  assert.equal(s.calls.filter((c) => c[0] === 'play').length, 2);
});
test('skip last track respects idle stay and otherwise disconnects without replay', async () => {
  for (const stay of [false, true]) {
    const s = setup();
    s.adapter.stopTrack = async () => {};
    await s.q.enqueue('g', 'vc', 'sample', 'u');
    if (stay) await s.q.stay('g', true);
    await s.q.skip('g');
    assert.equal(s.q.snapshot('g') !== null, stay);
    if (stay) assert.equal(s.q.snapshot('g').status, 'idle');
    assert.equal(s.calls.filter((c) => c[0] === 'play').length, 1);
  }
});
test('skip uncertain stop,provider race or poststop lost authority freezes without next play', async () => {
  for (const kind of ['stop', 'race', 'authority']) {
    const s = setup();
    for (let n = 0; n < 2; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
    let stops = 0,
      checks = 0;
    const event = s.q.sessions.get('g').current.eventId;
    s.adapter.stopTrack = async () => {
      stops++;
      if (kind === 'stop') throw Error('SECRET');
      if (kind === 'race') await s.q.ended('g', event, 'error');
    };
    await assert.rejects(() =>
      s.q.skip('g', {
        beforeEffect: async () => {
          if (++checks === 2 && kind === 'authority') throw Error('voiceMoved');
        },
      }),
    );
    assert.equal(s.q.snapshot('g').status, 'uncertain');
    assert.equal(s.q.snapshot('g').queue.length, 1);
    assert.equal(s.calls.filter((c) => c[0] === 'play').length, 1);
    await assert.rejects(() => s.q.skip('g'), /musicUncertain/);
    assert.equal(stops, 1);
  }
});
test('skip missing locked or preeffect denied sessions never stop playback', async () => {
  const s = setup();
  let stops = 0;
  s.adapter.stopTrack = async () => {
    stops++;
  };
  await assert.rejects(() => s.q.skip('g'), /musicNoTrack/);
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  const before = s.q.snapshot('g');
  await assert.rejects(() =>
    s.q.skip('g', {
      beforeEffect: async () => {
        throw Error('voiceMoved');
      },
    }),
  );
  assert.deepEqual(s.q.snapshot('g'), before);
  s.q.active.add('g');
  await assert.rejects(() => s.q.skip('g'), /musicBusy/);
  assert.equal(stops, 0);
});
test('adapter stopTrack uses installed player stop method without disconnecting or changing event token', async () => {
  let stops = 0;
  const a = new LavalinkAdapter({
    players: new Map([
      [
        'g',
        {
          stopTrack: async () => {
            stops++;
          },
        },
      ],
    ]),
  });
  a.eventIds.set('g', { eventId: 'e' });
  await a.stopTrack('g');
  assert.equal(stops, 1);
  assert.equal(a.eventIds.get('g').eventId, 'e');
  await assert.rejects(() => a.stopTrack('other'), /musicNoSession/);
});

test('move queued track uses final destination indices forward backward same-position preserving playback/requesters', async () => {
  const s = setup();
  for (let n = 0; n < 5; n++) await s.q.enqueue('g', 'vc', 'sample', 'u' + n);
  const session = s.q.sessions.get('g'),
    current = session.current,
    initial = [...session.queue],
    calls = s.calls.length;
  await s.q.moveQueued('g', 1, 4);
  assert.deepEqual(session.queue, [initial[1], initial[2], initial[3], initial[0]]);
  await s.q.moveQueued('g', 4, 1);
  assert.deepEqual(session.queue, initial);
  await s.q.moveQueued('g', 2, 2);
  assert.deepEqual(session.queue, initial);
  assert.equal(session.current, current);
  assert.equal(s.calls.length, calls);
});
test('move queue bounds lock uncertainty and preeffect authority failures preserve all waiting state', async () => {
  const s = setup();
  await assert.rejects(() => s.q.moveQueued('g', 1, 1), /musicNoSession/);
  for (let n = 0; n < 3; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const initial = [...s.q.sessions.get('g').queue];
  for (const [a, b] of [
    [0, 1],
    [1, 3],
    [1.5, 1],
    [1, '2'],
  ])
    await assert.rejects(() => s.q.moveQueued('g', a, b), /musicQueuePosition/);
  await assert.rejects(() =>
    s.q.moveQueued('g', 1, 2, {
      beforeEffect: async () => {
        throw Error('authority lost');
      },
    }),
  );
  assert.deepEqual(s.q.sessions.get('g').queue, initial);
  s.q.active.add('g');
  await assert.rejects(() => s.q.moveQueued('g', 1, 2), /musicBusy/);
  s.q.active.delete('g');
  s.q.sessions.get('g').status = 'uncertain';
  await assert.rejects(() => s.q.moveQueued('g', 1, 2), /musicUncertain/);
  assert.deepEqual(s.q.sessions.get('g').queue, initial);
});
test('move awaiting authority cannot rewrite invalidated provider session after concurrent errors', async () => {
  const s = setup();
  for (let n = 0; n < 3; n++) await s.q.enqueue('g', 'vc', 'sample', 'u');
  const session = s.q.sessions.get('g'),
    initial = [...session.queue];
  await assert.rejects(
    () =>
      s.q.moveQueued('g', 1, 2, {
        beforeEffect: async () => {
          session.status = 'uncertain';
        },
      }),
    /musicUncertain/,
  );
  assert.deepEqual(session.queue, initial);
});

test('enqueue provider error while resolution awaits never appends stale track or restarts uncertain session', async () => {
  const s = setup();
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  const session = s.q.sessions.get('g'),
    initial = [...session.queue],
    calls = s.calls.length;
  const resolve = s.q.adapter.resolve;
  s.q.adapter.resolve = async (item) => {
    session.status = 'uncertain';
    return resolve(item);
  };
  await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
  assert.deepEqual(session.queue, initial);
  assert.equal(s.calls.length, calls);
  assert.equal(session.status, 'uncertain');
});
test('enqueue final authority await invalidation cannot append or play after joined session becomes uncertain', async () => {
  const s = setup();
  let guards = 0;
  await assert.rejects(
    () =>
      s.q.enqueueItem('g', 'vc', s.q.catalog.get('sample'), 'u', {
        beforeEffect: async () => {
          if (++guards === 2) s.q.sessions.get('g').status = 'uncertain';
        },
      }),
    /musicUncertain/,
  );
  assert.equal(guards, 2);
  const session = s.q.sessions.get('g');
  assert.equal(session.status, 'uncertain');
  assert.equal(session.queue.length, 0);
  assert.equal(session.current, null);
  assert(!s.calls.some((c) => c[0] === 'play'));
});
test('enqueue resolution against removed or replaced session cannot mutate detached/replacement guild queue', async () => {
  for (const replace of [false, true]) {
    const s = setup();
    await s.q.enqueue('g', 'vc', 'sample', 'u');
    const old = s.q.sessions.get('g'),
      resolve = s.q.adapter.resolve;
    let newer;
    s.q.adapter.resolve = async (item) => {
      s.q.sessions.delete('g');
      if (replace) {
        newer = { ...old, queue: [], current: null };
        s.q.sessions.set('g', newer);
      }
      return resolve(item);
    };
    const calls = s.calls.length;
    await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
    assert.equal(old.queue.length, 0);
    if (replace) {
      assert.equal(newer.queue.length, 0);
      assert.equal(s.q.sessions.get('g'), newer);
    } else assert.equal(s.q.snapshot('g'), null);
    assert.equal(s.calls.length, calls);
  }
});

test('actual provider ended callback during queue resolution and uncertain joining handshake cannot resume playback', async () => {
  const s = setup();
  await s.q.enqueue('g', 'vc', 'sample', 'u');
  const session = s.q.sessions.get('g'),
    resolve = s.q.adapter.resolve,
    calls = s.calls.length;
  s.q.adapter.resolve = async (item) => {
    await s.q.ended('g', session.current.eventId, 'error');
    return resolve(item);
  };
  await assert.rejects(() => s.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
  assert.equal(session.queue.length, 0);
  assert.equal(session.status, 'uncertain');
  assert.equal(s.calls.length, calls);
  const joining = setup();
  joining.adapter.join = async () => {
    joining.q.sessions.get('g').status = 'uncertain';
  };
  await assert.rejects(() => joining.q.enqueue('g', 'vc', 'sample', 'u'), /musicUncertain/);
  assert.equal(joining.q.sessions.get('g').status, 'uncertain');
  assert.equal(joining.q.sessions.get('g').queue.length, 0);
  assert(!joining.calls.some((c) => c[0] === 'play'));
});
