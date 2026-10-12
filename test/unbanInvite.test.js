import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { sendUnbanInvite, pickInviteChannel } from '../src/services/unbanInvite.js';
const t = (k, p = {}) => (k === 'unbanDm' ? `DM ${p.server} ${p.link} | ${p.note}` : k);
function setup({ dmFails = false, canInvite = true, inviteFails = false } = {}) {
  const sent = [],
    invites = [];
  const channel = {
    type: ChannelType.GuildText,
    permissionsFor: () => ({ has: (f) => canInvite && f === P.CreateInstantInvite }),
    createInvite: async (o) => {
      if (inviteFails) throw new Error('x');
      invites.push(o);
      return { url: 'https://discord.gg/abc' };
    },
  };
  const guild = {
    name: 'Srv',
    rulesChannel: null,
    systemChannel: channel,
    channels: { cache: new Map([['1', channel]]) },
    members: { me: { id: 'bot' } },
  };
  const client = {
    users: {
      fetch: async () => ({
        send: async (m) => {
          if (dmFails) throw new Error('closed');
          sent.push(m);
        },
      }),
    },
  };
  return { guild, client, sent, invites };
}
test('sends a one-use 7 day invite with the custom message, no pings', async () => {
  const { guild, client, sent, invites } = setup();
  const r = await sendUnbanInvite(guild, client, '1', { message: '  Welcome back, sorry!  ', t });
  assert.deepEqual(r, { status: 'sent' });
  assert.equal(invites[0].maxUses, 1);
  assert.equal(invites[0].maxAge, 604800);
  assert.equal(sent[0].content, 'DM Srv https://discord.gg/abc | Welcome back, sorry!');
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});
test('falls back to the default apology when no message is given', async () => {
  const { guild, client, sent } = setup();
  await sendUnbanInvite(guild, client, '1', { message: null, t });
  assert.match(sent[0].content, /unbanApologyDefault$/);
});
test('closed DMs return the link for the moderator; missing invite permission reports noInvite', async () => {
  const a = setup({ dmFails: true });
  assert.deepEqual(await sendUnbanInvite(a.guild, a.client, '1', { t }), {
    status: 'dmFailed',
    url: 'https://discord.gg/abc',
  });
  const b = setup({ canInvite: false });
  assert.equal(pickInviteChannel(b.guild, {}), null);
  assert.deepEqual(await sendUnbanInvite(b.guild, b.client, '1', { t }), { status: 'noInvite' });
  const c = setup({ inviteFails: true });
  assert.deepEqual(await sendUnbanInvite(c.guild, c.client, '1', { t }), { status: 'noInvite' });
});
