import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { RolePanels } from '../src/services/rolePanels.js';
import command from '../src/commands/reactionroles/reactionroles.js';
const ch = '100000000000000001',
  r1 = '100000000000000002',
  r2 = '100000000000000003';
function setup() {
  const db = openDatabase(':memory:'),
    p = new RolePanels(db);
  let n = 0;
  const add = (guildId = 'g', channelId = ch, status = 'active', roles = [r1, r2]) => {
    const id = p.reserve({
      guildId,
      channelId,
      roleId: roles[0],
      label: 'A',
      interactionId: 'i' + ++n,
      buttons: roles.map((roleId) => ({ roleId, label: 'A' })),
    });
    if (status === 'active') p.complete(id, 'm' + n);
    else if (status !== 'pending') p.status(id, status);
    return id;
  };
  return { db, p, add };
}
test('scoped panel disable affects active whole multi panels only,retains buttons/click guards/no role effects', () => {
  for (const kind of ['channel', 'role']) {
    const s = setup();
    try {
      const active = s.add(),
        pending = s.add('g', ch, 'pending'),
        uncertain = s.add('g', ch, 'uncertain'),
        other = s.add('other'),
        different = s.add('g', '100000000000000004', 'active', ['100000000000000005']);
      s.p.reserveClick('click', 'g', 'member', r1, 'add');
      assert.throws(() => s.p.disableFor('g', kind, 'bad'), /rolePanelScopeInvalid/);
      assert.equal(s.p.disableFor('g', kind, kind === 'role' ? r2 : ch), 1);
      assert.equal(s.p.disableFor('g', kind, kind === 'role' ? r2 : ch), 0);
      assert.equal(s.p.get(active, 'g').status, 'disabled');
      assert.equal(s.p.buttons(active).length, 2);
      assert.equal(s.p.get(pending, 'g').status, 'pending');
      assert.equal(s.p.get(uncertain, 'g').status, 'uncertain');
      assert.equal(s.p.get(other, 'other').status, 'active');
      assert.equal(s.p.get(different, 'g').status, 'active');
      assert.equal(s.p.click('click', 'g').status, 'pending');
    } finally {
      s.db.close();
    }
  }
});
test('private panel export latest100 exact buttons/guild scope/truncation,no actor click userIDs', () => {
  const s = setup();
  try {
    for (let n = 0; n < 103; n++) s.add('g', ch, 'disabled');
    s.add('other');
    s.p.reserveClick('private-click', 'g', 'private-member', r1, 'add');
    const report = s.p.exportMappings('g');
    assert.equal(report.total, 103);
    assert.equal(report.panels.length, 100);
    assert.equal(report.truncated, true);
    assert.equal(report.panels[0].id, 103);
    assert.equal(report.panels.at(-1).id, 4);
    assert.equal(report.panels[0].buttons.length, 2);
    for (const needle of [
      'private-member',
      'private-click',
      'interaction_id',
      'guild_id',
      'actor_id',
    ])
      assert(!JSON.stringify(report).includes(needle));
    assert.deepEqual(s.p.exportMappings('missing'), { total: 0, truncated: false, panels: [] });
  } finally {
    s.db.close();
  }
});
test('panel scopes/export current manager/confirmation/private3locale attachment bytes no native mutations', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const s = setup();
    try {
      let sub = 'export',
        confirm = false,
        reply;
      const id = s.add();
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
            getSubcommand: () => sub,
            getBoolean: () => confirm,
            getString: () => (sub === 'disablerole' ? r2 : ch),
          },
        },
        c = { rolePanels: s.p, localization: { locale: () => locale } };
      await command.execute(i, c);
      const json = JSON.parse(reply.files[0].attachment.toString());
      assert.equal(json.panels[0].id, id);
      assert.deepEqual(reply.allowedMentions.parse, []);
      for (const v of ['disablechannel', 'disablerole']) {
        sub = v;
        confirm = false;
        await assert.rejects(() => command.execute(i, c), /rolePanelDisableActiveConfirm/);
        confirm = true;
        await command.execute(i, c);
        assert(!reply.embeds[0].data.description.includes('rolePanelScopedDisabled'));
      }
      actor.permissions.has = () => false;
      await assert.rejects(() => command.execute(i, c), /roleActorPermission/);
    } finally {
      s.db.close();
    }
  }
});
