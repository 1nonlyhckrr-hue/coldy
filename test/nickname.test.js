import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { ModerationCases } from '../src/services/moderation.js';
import { setNickname } from '../src/services/nickname.js';
import command from '../src/commands/moderation/nickname.js';
import { translate } from '../src/services/localization.js';
const ids = {
  actor: '100000000000000001',
  bot: '100000000000000002',
  target: '100000000000000003',
  owner: '100000000000000004',
};
function setup() {
  const db = openDatabase(':memory:'),
    calls = [];
  const member = (id, n) => ({
    id,
    guild: { id: 'g' },
    permissions: { has: () => true },
    roles: { highest: { position: n, comparePositionTo: (r) => n - r.position } },
  });
  const actor = member(ids.actor, 5),
    bot = member(ids.bot, 8),
    target = member(ids.target, 2);
  target.nickname = null;
  target.setNickname = async (v) => {
    calls.push(v);
    target.nickname = v;
  };
  const i = {
    id: 'i',
    guildId: 'g',
    user: { id: ids.actor },
    client: { user: { id: ids.bot } },
    appPermissions: { has: () => true },
    guild: {
      id: 'g',
      ownerId: ids.owner,
      members: {
        fetch: async ({ user }) => (user === ids.actor ? actor : target),
        fetchMe: async () => bot,
      },
    },
  };
  return { db, c: { cases: new ModerationCases(db) }, i, actor, bot, target, calls };
}
test('nickname confirmed update/reset verifies exact current member and cases exclude text', async () => {
  const s = setup();
  try {
    await setNickname(s.i, s.c, { targetId: ids.target, nickname: 'New Nick', confirm: true });
    assert.deepEqual(s.calls, ['New Nick']);
    assert(!s.db.prepare('SELECT reason FROM moderation_cases').get().reason.includes('New Nick'));
    assert.equal(
      (await setNickname(s.i, s.c, { targetId: ids.target, nickname: 'New Nick', confirm: true }))
        .changed,
      false,
    );
    s.i.id = 'reset';
    await setNickname(s.i, s.c, { targetId: ids.target, nickname: null, confirm: true });
    assert.deepEqual(s.calls, ['New Nick', null]);
  } finally {
    s.db.close();
  }
});
test('nickname input,confirmation,identity,permissions and hierarchy prevent native effects', async () => {
  for (const kind of [
    'confirm',
    'input',
    'actor',
    'bot',
    'target',
    'guild',
    'actorPermission',
    'appPermission',
    'hierarchy',
    'owner',
  ]) {
    const s = setup();
    if (kind === 'actor') s.actor.id = ids.owner;
    if (kind === 'bot') s.bot.id = ids.owner;
    if (kind === 'target') s.target.id = ids.owner;
    if (kind === 'guild') s.target.guild.id = 'other';
    if (kind === 'actorPermission') s.actor.permissions.has = () => false;
    if (kind === 'appPermission') s.i.appPermissions.has = () => false;
    if (kind === 'hierarchy') s.actor.roles.highest.comparePositionTo = () => 0;
    if (kind === 'owner') s.i.guild.ownerId = ids.target;
    try {
      await assert.rejects(() =>
        setNickname(s.i, s.c, {
          targetId: ids.target,
          nickname: kind === 'input' ? '@everyone' : 'Nick',
          confirm: kind !== 'confirm',
        }),
      );
      assert.equal(s.calls.length, 0);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 0);
    } finally {
      s.db.close();
    }
  }
});
test('nickname reservation/network/postacceptance/storage failures do not retry', async () => {
  for (const kind of ['reserve', 'network', 'verification', 'storage']) {
    const s = setup();
    let n = 0;
    s.target.setNickname = async (v) => {
      n++;
      if (kind === 'network') throw Error('network');
      if (kind !== 'verification') s.target.nickname = v;
    };
    if (kind === 'reserve')
      s.c.cases.begin = () => {
        throw Error('db');
      };
    if (kind === 'storage')
      s.c.cases.finish = () => {
        throw Error('db');
      };
    try {
      await assert.rejects(() =>
        setNickname(s.i, s.c, { targetId: ids.target, nickname: 'Nick', confirm: true }),
      );
      assert.equal(n, kind === 'reserve' ? 0 : 1);
      if (kind !== 'reserve') {
        s.i.id = 'new';
        await assert.rejects(
          () => setNickname(s.i, s.c, { targetId: ids.target, nickname: null, confirm: true }),
          /nicknameUncertain/,
        );
        assert.equal(n, 1);
      }
    } finally {
      s.db.close();
    }
  }
});
test('nickname command renders private no-ping localized state without repeating nickname text', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup(),
      replies = [];
    s.c.localization = { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) };
    s.i.deferReply = async (p) => assert.equal(p.flags, 64);
    s.i.editReply = async (p) => replies.push(p);
    s.i.options = {
      getUser: () => ({ id: ids.target }),
      getString: () => 'Private Name',
      getBoolean: () => true,
    };
    try {
      await command.execute(s.i, s.c);
      assert.equal(replies.length, 1);
      assert.deepEqual(replies[0].allowedMentions.parse, []);
      assert(!replies[0].embeds[0].data.description.includes('Private Name'));
    } finally {
      s.db.close();
    }
  }
});
test('nickname concurrent target changes reserve once and postacceptance404 remains uncertain', async () => {
  for (const kind of ['concurrent', 'post404']) {
    const s = setup();
    let release,
      n = 0,
      reads = 0;
    const wait = new Promise((r) => {
      release = r;
    });
    s.target.setNickname = async (v) => {
      n++;
      if (kind === 'concurrent') await wait;
      s.target.nickname = v;
    };
    const fetch = s.i.guild.members.fetch;
    s.i.guild.members.fetch = async (o) => {
      if (o.user === ids.target && ++reads > 1 && kind === 'post404') {
        const e = new Error('gone');
        e.code = 10007;
        e.status = 404;
        throw e;
      }
      return fetch(o);
    };
    try {
      const first = setNickname(s.i, s.c, {
        targetId: ids.target,
        nickname: 'Nick',
        confirm: true,
      });
      if (kind === 'concurrent') {
        await assert.rejects(
          () =>
            setNickname({ ...s.i, id: 'other' }, s.c, {
              targetId: ids.target,
              nickname: 'Other',
              confirm: true,
            }),
          /nicknameUncertain/,
        );
        release();
        await first;
        assert.equal(s.target.nickname, 'Nick');
      } else {
        await assert.rejects(() => first, /nicknameUncertain/);
        assert.equal(s.db.prepare('SELECT status FROM moderation_cases').get().status, 'uncertain');
      }
      assert.equal(n, 1);
      assert.equal(s.db.prepare('SELECT count(*) n FROM moderation_cases').get().n, 1);
    } finally {
      release();
      s.db.close();
    }
  }
});
test('nickname pending operation remains blocked after actual SQLite reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'emika-nick-restart-')),
    path = join(dir, 'db');
  let db = openDatabase(path);
  try {
    new ModerationCases(db).begin({
      guildId: 'g',
      targetId: ids.target,
      actorId: ids.actor,
      action: 'nickname',
      reason: 'unknown',
      interactionId: 'old',
    });
    db.close();
    db = openDatabase(path);
    const s = setup();
    s.db.close();
    s.c.cases = new ModerationCases(db);
    await assert.rejects(
      () => setNickname(s.i, s.c, { targetId: ids.target, nickname: 'Nick', confirm: true }),
      /nicknameUncertain/,
    );
    assert.equal(s.calls.length, 0);
    assert.equal(db.prepare('SELECT status FROM moderation_cases').get().status, 'pending');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
