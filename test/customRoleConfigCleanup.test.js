import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { CustomRoles } from '../src/services/customRoles.js';
import command from '../src/commands/customrole/customrole.js';
import { translate } from '../src/services/localization.js';
const role = '100000000000000001',
  other = '100000000000000002',
  gate = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:'),
    r = new CustomRoles(db);
  for (const g of ['g', 'other']) {
    r.map(g, 'one', role);
    r.map(g, 'two', other);
    r.setRequired(g, gate);
    r.setCreation(g, true);
  }
  r.reserveCreation('g', 'owner', 'Style', 1, 'create');
  return { db, r };
}
test('selfrole stored cleanup exactID/gate/reset isolated ownership/uncertainty retained no native role effects', () => {
  const s = setup();
  try {
    const creation = JSON.stringify(s.r.created('g', 'owner'));
    assert.equal(s.r.unmapRole('g', role), 1);
    assert.equal(s.r.unmapRole('g', role), 0);
    assert(s.r.get('g', 'two'));
    assert(s.r.get('other', 'one'));
    assert.equal(s.r.required('g'), gate);
    s.r.clearRequired('g');
    assert.equal(s.r.required('g'), null);
    assert(s.r.creationEnabled('g'));
    assert.equal(s.r.resetConfig('g'), 1);
    assert.equal(s.r.resetConfig('g'), 0);
    assert.equal(s.r.creationEnabled('g'), false);
    assert.equal(s.r.list('g').length, 0);
    assert.equal(s.r.required('other'), gate);
    assert(s.r.creationEnabled('other'));
    assert.equal(JSON.stringify(s.r.created('g', 'owner')), creation);
  } finally {
    s.db.close();
  }
});
test('customrole reset allthree tables atomic storageabort,roleID invalid no deletes', () => {
  const s = setup();
  try {
    for (const v of ['bad', '', null, '1'.repeat(21)]) assert.throws(() => s.r.unmapRole('g', v));
    s.db.exec(
      "CREATE TRIGGER fail_reset BEFORE DELETE ON custom_role_creation_config BEGIN SELECT RAISE(ABORT,'stop');END;",
    );
    assert.throws(() => s.r.resetConfig('g'));
    assert.equal(s.r.list('g').length, 2);
    assert.equal(s.r.required('g'), gate);
    assert(s.r.creationEnabled('g'));
  } finally {
    s.db.close();
  }
});
test('customrole configcleanup native manager/confirm/private3locale no destination/targetlookup', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['unmaprole', 'clearrequired', 'resetconfig']) {
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
            options: { getSubcommand: () => sub, getBoolean: () => confirm, getString: () => role },
          },
          c = {
            customRoles: s.r,
            localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
          };
        await assert.rejects(() => command.execute(i, c), /customClearConfirm/);
        assert.equal(s.r.list('g').length, 2);
        confirm = true;
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        actor.permissions.has = () => false;
        await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
      } finally {
        s.db.close();
      }
    }
});
