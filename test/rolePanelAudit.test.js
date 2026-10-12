import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { RolePanels } from '../src/services/rolePanels.js';
import command from '../src/commands/reactionroles/reactionroles.js';
const channel = '100000000000000001',
  role = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new RolePanels(db);
  for (let n = 0; n < 102; n++) {
    const id = r.reserve({
      guildId: 'g',
      channelId: channel,
      roleId: role,
      label: 'first',
      interactionId: 'private-source-' + n,
      buttons: [
        { roleId: role, label: 'first' },
        { roleId: '100000000000000003', label: 'second' },
      ],
    });
    if (n % 2) r.complete(id, 'message-' + n);
    else r.status(id, 'disabled');
  }
  r.reserve({
    guildId: 'other',
    channelId: channel,
    roleId: role,
    label: 'other',
    interactionId: 'other',
  });
  r.reserveClick('private-click', 'g', 'private-user', role, 'add');
  r.finishClick('private-click', 'uncertain');
  r.reserveClick('another-click', 'g', 'other-user', role, 'remove');
  r.finishClick('another-click', 'completed');
  return { db, r };
}
test('panel andclick aggregates storedstates/actions isolate guilds no private IDs/no mutation', () => {
  const s = setup();
  try {
    assert.deepEqual(s.r.summary('g'), [
      { status: 'active', count: 51 },
      { status: 'disabled', count: 51 },
    ]);
    assert.deepEqual(s.r.summary('other'), [{ status: 'pending', count: 1 }]);
    assert.deepEqual(s.r.clickSummary('g'), [
      { status: 'completed', action: 'remove', count: 1 },
      { status: 'uncertain', action: 'add', count: 1 },
    ]);
    assert.deepEqual(s.r.clickSummary('empty'), []);
    assert(!JSON.stringify(s.r.clickSummary('g')).includes('private'));
    assert.equal(s.r.click('private-click', 'g').status, 'uncertain');
  } finally {
    s.db.close();
  }
});
test('panel exactchannel100wholebindings/multibuttons order total/truncation no receipts/source/memberIDs', () => {
  const s = setup();
  try {
    const report = s.r.channelRecords('g', channel);
    assert.equal(report.total, 102);
    assert.equal(report.truncated, true);
    assert.equal(report.panels.length, 100);
    assert.equal(report.panels[0].id, 102);
    assert.equal(report.panels.at(-1).id, 3);
    for (const p of report.panels) {
      assert.equal(p.buttons.length, 2);
      assert.deepEqual(Object.keys(p), ['id', 'channel_id', 'message_id', 'status', 'buttons']);
    }
    assert(!JSON.stringify(report).includes('private'));
    assert.equal(s.r.channelRecords('other', channel).total, 1);
    assert.deepEqual(s.r.channelRecords('g', '100000000000000009'), {
      total: 0,
      truncated: false,
      panels: [],
    });
    for (const id of ['bad', ' ' + channel, channel + ' '])
      assert.throws(() => s.r.channelRecords('g', id), /rolePanelScopeInvalid/);
  } finally {
    s.db.close();
  }
});
test('panel3auditpaths freshmanageRoles private3locale exactJSON noeffects permissionblockedbeforeread', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['summary', 'clicksummary', 'channelrecords']) {
      const s = setup();
      try {
        let reply,
          manager = true;
        const i = {
          guildId: 'g',
          user: { id: 'u' },
          guild: {
            id: 'g',
            members: {
              fetch: async (args) => {
                assert.deepEqual(args, { user: 'u', force: true });
                return { id: 'u', guild: { id: 'g' }, permissions: { has: () => manager } };
              },
            },
          },
          options: { getSubcommand: () => sub, getString: () => channel },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { rolePanels: s.r, localization: { locale: () => locale } };
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        assert.deepEqual(
          JSON.parse(reply.files[0].attachment.toString()),
          sub === 'summary'
            ? s.r.summary('g')
            : sub === 'clicksummary'
              ? s.r.clickSummary('g')
              : s.r.channelRecords('g', channel),
        );
        manager = false;
        c.rolePanels = new Proxy(
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
