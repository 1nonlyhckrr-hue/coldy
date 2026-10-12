import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { CustomRoles } from '../src/services/customRoles.js';
import command from '../src/commands/customrole/customroleaudit.js';
import { translate } from '../src/services/localization.js';
const id = '100000000000000001',
  role = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new CustomRoles(db);
  r.setCreation('g', true);
  r.setRequired('g', '100000000000000009');
  r.map('g', 'blue', role);
  for (const [g, u, state] of [
    ['g', id, 'created'],
    ['g', '100000000000000003', 'creating'],
    ['g', '100000000000000004', 'uncertain'],
    ['other', id, 'created'],
  ])
    db.prepare('INSERT INTO custom_created_roles VALUES(?,?,?,?,?,?,?,?)').run(
      g,
      u,
      null,
      'Owned',
      100,
      state,
      g + u,
      10,
    );
  return { db, r };
}
test('custom audit creation aggregates allstates exactguild no native inference/no mutation', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.creationSummary('g'), [
      { status: 'created', count: 1 },
      { status: 'creating', count: 1 },
      { status: 'uncertain', count: 1 },
    ]);
    assert.deepEqual(s.r.creationSummary('empty'), []);
    assert.equal(s.r.creationSummary('other')[0].count, 1);
  } finally {
    s.db.close();
  }
});
test('custom policy andonlyowncreation minimalrecords nullabsent no owner/sourceIDs guardskept', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.exportPolicy('g'), {
      creationEnabled: true,
      requiredRoleId: '100000000000000009',
      mappings: [{ name: 'blue', roleId: role }],
    });
    assert.deepEqual(s.r.exportCreation('g', id), {
      roleId: null,
      name: 'Owned',
      color: 100,
      status: 'created',
      createdAt: 10,
    });
    assert.equal(s.r.exportCreation('g', '100000000000000999'), null);
    assert.deepEqual(s.r.exportPolicy('empty'), {
      creationEnabled: false,
      requiredRoleId: null,
      mappings: [],
    });
    assert(!JSON.stringify(s.r.exportCreation('g', id)).includes(id));
    assert.equal(s.db.prepare('SELECT count(*)n FROM custom_created_roles').get().n, 4);
  } finally {
    s.db.close();
  }
});
test('customaudit3paths freshmanager/ownidentity private3locale exactbytes noeffects', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'exportpolicy', 'exportmine']) {
      const s = setup();
      try {
        let reply,
          valid = true,
          manager = true;
        const i = {
          guildId: 'g',
          user: { id },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: id, force: true });
                return {
                  id: valid ? id : 'wrong',
                  guild: { id: 'g' },
                  permissions: { has: () => manager },
                };
              },
            },
          },
          options: { getSubcommand: () => sub },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = {
          customRoles: s.r,
          localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) },
        };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'summary')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'exportpolicy' ? s.r.exportPolicy('g') : s.r.exportCreation('g', id),
          );
        manager = false;
        if (sub === 'exportmine') await command.execute(i, c);
        else await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
        valid = false;
        c.customRoles = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
      } finally {
        s.db.close();
      }
    }
});
