import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityType } from 'discord.js';
import { openDatabase } from '../src/database/index.js';
import { BotActivity } from '../src/services/botActivity.js';
import activity from '../src/commands/antinuke/activity.js';
const OWNER = '111111111111111111',
  DELEGATE = '222222222222222222',
  G = '333333333333333333';
function setup(userId, args) {
  const db = openDatabase(':memory:'),
    presence = [],
    ba = new BotActivity(db);
  const c = {
    config: { ownerIds: [OWNER] },
    botActivity: ba,
    securityAccess: { delegated: (g, u, f) => u === DELEGATE && f === 'activity' },
    localization: { locale: () => 'en', t: (g, k, p) => k + (p ? JSON.stringify(p) : '') },
  };
  const replies = [];
  const i = {
    user: { id: userId },
    guildId: G,
    client: { user: { setPresence: (p) => presence.push(p) } },
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
    options: {
      getSubcommand: () => args.sub,
      getString: (n) => args[n] ?? null,
    },
  };
  return { db, c, i, presence, replies };
}
test('persists, validates and applies the presence', () => {
  const db = openDatabase(':memory:'),
    ba = new BotActivity(db);
  try {
    assert.equal(ba.get(), null);
    ba.set('watching', ' over you ');
    assert.deepEqual(ba.get(), { type: 'watching', text: 'over you', url: null });
    assert.throws(() => ba.set('streaming', 'x', 'http://evil'));
    assert.throws(() => ba.set('flying', 'x'));
    assert.throws(() => ba.set('playing', ' '));
    ba.set('streaming', 'live', 'https://twitch.tv/emika');
    const got = [];
    ba.apply({ user: { setPresence: (p) => got.push(p) } });
    assert.equal(got[0].activities[0].type, ActivityType.Streaming);
    assert.equal(ba.clear(), 1);
    ba.apply({ user: { setPresence: (p) => got.push(p) } });
    assert.deepEqual(got[1].activities, []);
  } finally {
    db.close();
  }
});
test('owner and delegate may set; others and plain admins are refused', async () => {
  for (const [uid, ok] of [
    [OWNER, true],
    [DELEGATE, true],
    ['444444444444444444', false],
  ]) {
    const f = setup(uid, { sub: 'set', type: 'playing', text: 'hello' });
    try {
      if (ok) {
        await activity.execute(f.i, f.c);
        assert.equal(f.presence.length, 1);
        assert.equal(f.c.botActivity.get().text, 'hello');
      } else {
        await assert.rejects(() => activity.execute(f.i, f.c), { message: /activityDenied/ });
        assert.equal(f.c.botActivity.get(), null);
      }
    } finally {
      f.db.close();
    }
  }
});
test('streaming without a valid link is refused; clear resets', async () => {
  const f = setup(OWNER, { sub: 'set', type: 'streaming', text: 'live', url: 'nope' });
  try {
    await assert.rejects(() => activity.execute(f.i, f.c), { message: /activityUrl/ });
    f.c.botActivity.set('playing', 'x');
    const g = setup(OWNER, { sub: 'clear' });
    g.c.botActivity = f.c.botActivity;
    await activity.execute(g.i, g.c);
    assert.equal(f.c.botActivity.get(), null);
  } finally {
    f.db.close();
  }
});
