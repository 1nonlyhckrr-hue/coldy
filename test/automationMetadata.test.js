import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { MessageSchedules } from '../src/services/automations.js';
import command from '../src/commands/automations/automation.js';
const channel = '100000000000000001',
  other = '100000000000000002';
function setup() {
  const db = openDatabase(':memory:'),
    r = new MessageSchedules(db, () => 0);
  for (let n = 0; n < 102; n++)
    db.prepare(
      'INSERT INTO message_schedules(guild_id,channel_id,body,due_at,repeat_ms,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'g',
      channel,
      'private text',
      1000 + n,
      null,
      ['pending', 'sending', 'uncertain', 'done', 'cancelled'][n % 5],
      'private-source-' + n,
      0,
    );
  db.prepare(
    'INSERT INTO message_schedules(guild_id,channel_id,body,due_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
  ).run('g', other, 'other', 1000, 'pending', 'other', 0);
  db.prepare(
    'INSERT INTO message_schedules(guild_id,channel_id,body,due_at,status,interaction_id,created_at) VALUES(?,?,?,?,?,?,?)',
  ).run('other', channel, 'otherguild', 1000, 'pending', 'otherguild', 0);
  return { db, r };
}
test('scheduleminimalmetadata latest100 total/truncated exactchannel/guild isolate states no text/sourceIDs', () => {
  const s = setup();
  try {
    const a = s.r.channelRecords('g', channel);
    assert.equal(a.total, 102);
    assert.equal(a.truncated, true);
    assert.equal(a.records.length, 100);
    assert.equal(a.records[0].id, 102);
    assert.equal(a.records.at(-1).id, 3);
    assert.deepEqual(Object.keys(a.records[0]), ['id', 'channelId', 'dueAt', 'repeatMs', 'status']);
    assert(!JSON.stringify(a).includes('private'));
    assert.equal(s.r.exportMetadata('g').total, 103);
    assert.equal(s.r.channelRecords('other', channel).total, 1);
    assert.deepEqual(s.r.exportMetadata('empty'), { total: 0, truncated: false, records: [] });
    assert.throws(() => s.r.channelRecords('g', 'bad'));
  } finally {
    s.db.close();
  }
});
test('channelpendingcancel keeps sending/uncertain/history/body/replay otherchannels/guilds and invalidinputatomic', () => {
  const s = setup();
  try {
    const before = s.db.prepare('SELECT * FROM message_schedules').all();
    assert.throws(() => s.r.cancelChannelPending('g', 'bad'));
    assert.deepEqual(s.db.prepare('SELECT * FROM message_schedules').all(), before);
    assert.equal(s.r.cancelChannelPending('g', channel), 21);
    assert.equal(s.r.cancelChannelPending('g', channel), 0);
    const after = s.db.prepare('SELECT * FROM message_schedules').all();
    for (let n = 0; n < before.length; n++)
      assert.deepEqual(after[n], {
        ...before[n],
        status:
          before[n].guild_id === 'g' &&
          before[n].channel_id === channel &&
          before[n].status === 'pending'
            ? 'cancelled'
            : before[n].status,
      });
  } finally {
    s.db.close();
  }
});
test('schedule3paths private3locale exactJSON confirmandfreshpermission beforemutation/read', async () => {
  for (const locale of ['en', 'hi', 'hinglish'])
    for (const sub of ['exportmetadata', 'channelrecords', 'cancelchannel']) {
      const s = setup();
      try {
        let reply,
          manager = true,
          confirm = true;
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
          options: {
            getSubcommand: () => sub,
            getString: () => channel,
            getBoolean: () => confirm,
          },
          deferReply: async (p) => assert.equal(p.flags, 64),
          editReply: async (p) => (reply = p),
        };
        const c = { guildConfig: { get: () => ({ language: locale }) }, messageSchedules: s.r };
        if (sub === 'cancelchannel') {
          confirm = false;
          await assert.rejects(() => command.execute(i, c), /automationBulkConfirm/);
          assert.equal(s.r.get(1, 'g').status, 'pending');
          confirm = true;
        }
        await command.execute(i, c);
        assert.deepEqual(reply.allowedMentions.parse, []);
        assert.equal(reply.embeds.length, 1);
        if (sub !== 'cancelchannel')
          assert.deepEqual(
            JSON.parse(reply.files[0].attachment.toString()),
            sub === 'channelrecords' ? s.r.channelRecords('g', channel) : s.r.exportMetadata('g'),
          );
        manager = false;
        c.messageSchedules = new Proxy(
          {},
          {
            get: () => {
              throw Error('must not read');
            },
          },
        );
        await assert.rejects(() => command.execute(i, c), /userPermission/);
      } finally {
        s.db.close();
      }
    }
});
