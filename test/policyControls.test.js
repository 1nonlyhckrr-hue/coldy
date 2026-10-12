import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AutoMod } from '../src/services/automod.js';
import { AntinukeAlerts } from '../src/services/antinuke.js';
import automod from '../src/commands/automod/automod.js';
import antinuke from '../src/commands/antinuke/antinuke.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001';
function setup() {
  const db = openDatabase(':memory:'),
    r = new AutoMod(db);
  r.patch('g', {
    enabled: true,
    action: 'timeout',
    timeoutMinutes: 20,
    rules: { words: true, spam: true, caps: true },
    words: ['bad'],
    ignoredChannels: [id],
    mentionLimit: 9,
    capsPercent: 95,
    capsMinLetters: 60,
    spamMessages: 9,
    spamRepeats: 8,
    spamWindowSeconds: 25,
  });
  r.recent.set('g:u', [1]);
  r.recent.set('other:u', [2]);
  return { db, r };
}
test('disable allsix rule switches keepenabled/action/words/exclusions/thresholds otherguild clearsownspam only', () => {
  const s = setup();
  try {
    const before = s.r.get('g');
    assert.equal(s.r.disableRules('g'), 3);
    assert.deepEqual(s.r.get('g'), {
      ...before,
      rules: Object.fromEntries(Object.keys(before.rules).map((k) => [k, false])),
    });
    assert(!s.r.recent.has('g:u'));
    assert(s.r.recent.has('other:u'));
    assert.equal(s.r.disableRules('g'), 0);
    assert.equal(s.r.get('other').enabled, false);
  } finally {
    s.db.close();
  }
});
test('threshold defaults exact preserveotherpolicy abortleavespolicy+spamwindow unchanged', () => {
  const s = setup();
  try {
    const before = s.r.get('g'),
      patch = s.r.patch;
    s.r.patch = () => {
      throw Error('abort');
    };
    assert.throws(() => s.r.resetThresholds('g'), /abort/);
    assert.deepEqual(s.r.get('g'), before);
    assert(s.r.recent.has('g:u'));
    s.r.patch = patch;
    s.r.resetThresholds('g');
    assert.deepEqual(s.r.get('g'), {
      ...before,
      mentionLimit: 5,
      capsPercent: 80,
      capsMinLetters: 20,
      spamMessages: 6,
      spamRepeats: 3,
      spamWindowSeconds: 10,
    });
    assert(!s.r.recent.has('g:u'));
    assert(s.r.recent.has('other:u'));
  } finally {
    s.db.close();
  }
});
test('policy3paths currentmanager confirmbeforechanges trustIDs private3locale exactbytes no nativeclaims', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['disablerules', 'resetthresholds', 'trustlist']) {
      const s = setup();
      try {
        const alerts = new AntinukeAlerts(s.db);
        alerts.trust('g', id, true);
        let reply,
          allowed = true,
          confirm = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async () => ({ id, guild: { id: 'g' }, permissions: { has: () => allowed } }),
            },
          },
          options: { getSubcommand: () => sub, getBoolean: () => confirm },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
            automod: s.r,
            antinuke: alerts,
            guildConfig: { get: () => ({ language: locale }) },
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          },
          cmd = sub === 'trustlist' ? antinuke : automod;
        if (sub !== 'trustlist') {
          confirm = false;
          const before = s.r.get('g');
          await assert.rejects(() => cmd.execute(i, c), /automodResetConfirm/);
          assert.deepEqual(s.r.get('g'), before);
          confirm = true;
        }
        await cmd.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub === 'trustlist')
          assert.deepEqual(JSON.parse(reply.files[0].attachment.toString()), {
            trustedUserIds: [id],
          });
        allowed = false;
        c.automod = c.antinuke = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(() => cmd.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
