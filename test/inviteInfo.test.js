import { test } from 'node:test';
import assert from 'node:assert/strict';
import command from '../src/commands/leaderboard/inviteinfo.js';
function setup() {
  const records = new Map(),
    actor = { id: 'u', guild: { id: 'g' }, user: { bot: false } },
    bot = { id: 'b', guild: { id: 'g' }, permissions: { has: () => true } };
  let reply;
  const guild = {
    id: 'g',
    fetch: async () => guild,
    members: { fetch: async () => actor, fetchMe: async () => bot },
    invites: { fetch: async () => records },
  };
  const i = {
    guild,
    guildId: 'g',
    user: { id: 'u' },
    client: { user: { id: 'b' } },
    appPermissions: { has: () => true },
    reply: async (p) => (reply = p),
  };
  const invite = (code, inviter = 'u') => ({
    code,
    guild: { id: 'g' },
    inviter: { id: inviter },
    uses: 2,
    maxUses: 0,
    maxAge: 0,
    temporary: false,
    expiresTimestamp: null,
  });
  return {
    i,
    actor,
    bot,
    records,
    invite,
    c: { guildConfig: { get: () => ({ language: 'en' }) } },
    reply: () => reply,
  };
}
test('inviteinfo ownonly currentnative counters private3locale no history or mutation', async () => {
  for (const language of ['en', 'hi', 'hinglish']) {
    const s = setup();
    s.c.guildConfig.get = () => ({ language });
    s.records.set('a', s.invite('own'));
    s.records.set('b', s.invite('foreign', 'other'));
    const expired = s.invite('expired');
    expired.expiresTimestamp = Date.now() - 1000;
    s.records.set('c', expired);
    await command.execute(s.i, s.c);
    const p = s.reply(),
      data = JSON.parse(p.files[0].attachment.toString());
    assert.equal(p.flags, 64);
    assert.deepEqual(p.allowedMentions.parse, []);
    assert.equal(data.total, 1);
    assert.equal(data.records[0].code, 'own');
    assert.equal(data.records[0].uses, 2);
    assert(!JSON.stringify(data).includes('foreign'));
  }
});
test('inviteinfo native identity/guild/permission/unverifiedmetadata guards reject without disclosure', async () => {
  for (const change of [
    (s) => (s.bot.permissions.has = () => false),
    (s) => (s.bot.guild.id = 'foreign'),
    (s) => (s.actor.guild.id = 'foreign'),
    (s) => (s.actor.user.bot = true),
    (s) => (s.i.appPermissions.has = () => false),
    (s) => (s.i.guild.invites.fetch = async () => null),
    (s) => (s.i.guild.id = 'foreign'),
  ]) {
    const s = setup();
    change(s);
    await assert.rejects(() => command.execute(s.i, s.c), /inviteInfoUnavailable/);
    assert.equal(s.reply(), undefined);
  }
  const s = setup(),
    bad = s.invite('bad');
  bad.uses = null;
  s.records.set('bad', bad);
  await assert.rejects(() => command.execute(s.i, s.c), /inviteInfoUnavailable/);
});
test('inviteinfo cap25 ownrecords plus total no silent truncation crossguild skip', async () => {
  const s = setup();
  for (let n = 0; n < 30; n++) s.records.set(n, s.invite('code' + n));
  const foreign = s.invite('hidden');
  foreign.guild.id = 'other';
  s.records.set('foreign', foreign);
  await command.execute(s.i, s.c);
  const d = JSON.parse(s.reply().files[0].attachment.toString());
  assert.equal(d.total, 30);
  assert.equal(d.truncated, true);
  assert.equal(d.records.length, 25);
});
test('inviteinfo empty ownset honest emptydata and lastmemberdeparture blocks reply', async () => {
  const s = setup();
  await command.execute(s.i, s.c);
  assert.equal(JSON.parse(s.reply().files[0].attachment.toString()).total, 0);
  let n = 0;
  s.i.guild.members.fetch = async () => (++n === 1 ? s.actor : null);
  await assert.rejects(() => command.execute(s.i, s.c), /inviteInfoUnavailable/);
});
