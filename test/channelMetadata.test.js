import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import command from '../src/commands/utility/channel.js';
import { translate } from '../src/services/localization.js';
function setup(locale = 'en') {
  const id = '100000000000000001',
    actor = { id: 'u', guild: { id: 'g' } },
    channel = {
      id,
      guildId: 'g',
      name: '**visible** @everyone',
      type: ChannelType.GuildText,
      rawPosition: 0,
      permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.SendMessages]),
    };
  let sub = 'info',
    page = 1,
    search = null,
    reply;
  const guild = {
    id: 'g',
    members: {
      fetch: async (o) => {
        assert.equal(o.force, true);
        return actor;
      },
    },
    channels: { fetch: async () => channel },
  };
  const i = {
    guild,
    guildId: 'g',
    channelId: id,
    user: { id: 'u' },
    options: {
      getSubcommand: () => sub,
      getInteger: () => page,
      getString: () => search,
      getChannel: () => null,
    },
    deferReply: async (p) => assert.equal(p.flags, 64),
    editReply: async (p) => {
      reply = p;
    },
  };
  return {
    i,
    actor,
    channel,
    c: { localization: { locale: () => locale, t: (_g, k, p) => translate(locale, k, p) } },
    set: (s, p = 1, q = null) => {
      sub = s;
      page = p;
      search = q;
    },
    reply: () => reply,
  };
}
test('channel info/own permissions paths private localized fresh exact actor/no-ping metadata', async () => {
  for (const locale of ['en', 'hi', 'hinglish']) {
    const x = setup(locale);
    await command.execute(x.i, x.c);
    assert(x.reply().embeds[0].data.description.includes('\\*\\*visible\\*\\*'));
    assert.deepEqual(x.reply().allowedMentions.parse, []);
    x.set('permissions');
    await command.execute(x.i, x.c);
    assert(x.reply().embeds[0].data.description.includes('ViewChannel'));
    assert(x.reply().embeds[0].data.description.includes('SendMessages'));
    x.actor.id = 'foreign';
    await assert.rejects(() => command.execute(x.i, x.c), /channelMetadataInvalid/);
  }
});
test('channel list filters invisible channels before pagination/search and never includes hidden names', async () => {
  const x = setup();
  const rows = Array.from({ length: 15 }, (_, n) => ({
    ...x.channel,
    id: String(100000000000000100n + BigInt(n)),
    name: 'visible' + n,
    rawPosition: n,
  }));
  rows.push({
    ...x.channel,
    id: '100000000000000999',
    name: 'SECRET',
    permissionsFor: () => new PermissionsBitField(0n),
  });
  rows.push({
    ...x.channel,
    id: '100000000000000998',
    name: 'SECRET_THREAD',
    type: ChannelType.PrivateThread,
  });
  x.i.guild.channels.fetch = async () => new Map(rows.map((r) => [r.id, r]));
  x.set('list', 2);
  await command.execute(x.i, x.c);
  assert(x.reply().embeds[0].data.description.includes('15'));
  assert(!x.reply().embeds[0].data.description.includes('SECRET'));
  assert(x.reply().embeds[0].data.description.includes('visible10'));
  x.set('list', 1, 'VISIBLE14');
  await command.execute(x.i, x.c);
  assert(x.reply().embeds[0].data.description.includes('visible14'));
  assert(!x.reply().embeds[0].data.description.includes('visible13'));
  x.set('list', 2, 'VISIBLE14');
  await assert.rejects(() => command.execute(x.i, x.c), /listPageInvalid/);
});
test('channel metadata rejects foreign/hidden/invalid rows and malformed page/search without content reads', async () => {
  for (const change of [
    { guildId: 'other' },
    { id: 'bad' },
    { type: ChannelType.PrivateThread },
    { rawPosition: NaN },
    { name: 'line\nbreak' },
    { permissionsFor: () => null },
  ]) {
    const x = setup();
    Object.assign(x.channel, change);
    await assert.rejects(() => command.execute(x.i, x.c));
    assert.equal(x.reply(), undefined);
  }
  for (const p of [0, 1.5, 101, '1']) {
    const x = setup();
    x.set('list', p);
    await assert.rejects(() => command.execute(x.i, x.c), /listPageInvalid/);
  }
  for (const search of ['', 'a\nb', 'x'.repeat(81)]) {
    const x = setup();
    x.set('list', 1, search);
    await assert.rejects(() => command.execute(x.i, x.c), /listSearchInvalid/);
  }
});
test('channel permission pages list every current flag once and native options constrain supported channels', async () => {
  const x = setup();
  x.channel.permissionsFor = () => new PermissionsBitField(P.Administrator);
  const flags = x.channel.permissionsFor().toArray().sort(),
    seen = [];
  for (let p = 1; p <= Math.ceil(flags.length / 10); p++) {
    x.set('permissions', p);
    await command.execute(x.i, x.c);
    seen.push(...x.reply().embeds[0].data.description.split('\n').slice(1));
  }
  assert.deepEqual(seen, flags);
  const d = command.data.toJSON();
  assert.deepEqual(
    d.options.map((o) => o.name),
    [
      'info',
      'permissions',
      'list',
      'rename',
      'topic',
      'cleartopic',
      'voicelimit',
      'voicebitrate',
      'voiceregionauto',
      'threadarchive',
      'threadslowmode',
      'agerestrict',
    ],
  );
  assert(!d.options[0].options[0].channel_types.includes(ChannelType.PrivateThread));
});
