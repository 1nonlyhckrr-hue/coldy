import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { CommandRestrictions } from '../src/services/permit.js';
import command from '../src/commands/permit/permit.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  other = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new CommandRestrictions(db);
  for (const guild of ['g', 'other'])
    for (const cmd of ['fun', 'poll']) {
      for (const kind of ['user', 'role'])
        for (const n of [id, other]) r.set(guild, cmd, kind, n, true);
      for (const n of [id, other]) r.setChannel(guild, cmd, n, true);
    }
  return { db, r };
}
test('permit scope clears all exact matching stored commands isolated kind/id/guild no grants and remaining denies apply', async () => {
  for (const kind of ['user', 'role', 'channel']) {
    const s = setup();
    try {
      assert.equal(s.r.clearScope('g', kind, id), 2);
      assert.equal(s.r.clearScope('g', kind, id), 0);
      assert.equal(s.r.list('other').length, 8);
      assert.equal(s.r.channelRules('other').length, 4);
      assert.equal(s.r.list('g').length, kind === 'channel' ? 8 : 6);
      assert.equal(s.r.channelRules('g').length, kind === 'channel' ? 2 : 4);
      for (const invalid of ['', 'bad', '123', '1'.repeat(21)])
        assert.throws(() => s.r.clearScope('g', kind, invalid));
      assert.throws(() => s.r.clearScope('g', 'all', id));
      const i = {
        guildId: 'g',
        channelId: other,
        user: { id },
        guild: {
          id: 'g',
          ownerId: 'owner',
          members: {
            fetch: async () => ({ id, guild: { id: 'g' }, roles: { cache: new Set([id]) } }),
          },
        },
      };
      assert.equal(await s.r.ownStatus(i, 'fun'), 'denied');
      assert.equal(await s.r.ownStatus(i, 'help'), 'exempt');
    } finally {
      s.db.close();
    }
  }
});
test('permit scope database abort preserves all denies and stored removed-command cleanup supported', () => {
  const s = setup();
  try {
    s.r.set('g', 'removed-command', 'user', id, true);
    s.db.exec(
      "CREATE TRIGGER fail_scope BEFORE DELETE ON command_restrictions WHEN OLD.command_name='poll' BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    const before = JSON.stringify(s.r.exportRules('g'));
    assert.throws(() => s.r.clearScope('g', 'user', id));
    assert.equal(JSON.stringify(s.r.exportRules('g')), before);
    s.db.exec('DROP TRIGGER fail_scope');
    assert.equal(s.r.clearScope('g', 'user', id), 3);
  } finally {
    s.db.close();
  }
});
test('permit clearuser/clearrole/clearchannel manager confirmation private3locale no subject/native lookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const kind of ['user', 'role', 'channel']) {
      const s = setup();
      try {
        let confirm = false,
          reply;
        const actor = { id: 'u', guild: { id: 'g' }, permissions: { has: () => true } },
          i = {
            guildId: 'g',
            user: { id: 'u' },
            guild: { id: 'g', members: { fetch: async () => actor } },
            deferReply: async (p) => assert.equal(p.flags, 64),
            editReply: async (p) => {
              reply = p;
            },
            options: {
              getSubcommand: () => 'clear' + kind,
              getString: () => id,
              getBoolean: () => confirm,
            },
          },
          c = {
            commandRestrictions: s.r,
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          };
        const before = JSON.stringify(s.r.exportRules('g'));
        await assert.rejects(() => command.execute(i, c), /permitClearConfirm/);
        assert.equal(JSON.stringify(s.r.exportRules('g')), before);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert(!reply.embeds[0].data.description.includes('permitScopeCleared'));
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
