import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { STRUCTURE } from '../src/services/serverStructure.js';
import { runAutoSetup, LOG_EVENTS } from '../src/services/autoSetup.js';

function fakeGuild({ withStructure = true, existingRoles = [] } = {}) {
  const channels = new Map();
  let n = 1;
  if (withStructure)
    for (const g of STRUCTURE) {
      const cat = { id: `cat${n++}`, type: ChannelType.GuildCategory, name: g.name, edits: [] };
      cat.permissionOverwrites = { edit: async (r, p) => cat.edits.push([r.id, p]) };
      channels.set(cat.id, cat);
      for (const ch of g.channels)
        channels.set(`ch${n}`, {
          id: `ch${n++}`,
          name: ch.name,
          parentId: cat.id,
          type: ch.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
          createInvite: async () => ({ url: 'https://discord.gg/abc' }),
        });
    }
  const roles = new Map(existingRoles.map((r) => [r.id, r]));
  channels.find = (fn) => [...channels.values()].find(fn);
  channels.get = Map.prototype.get.bind(channels);
  roles.find = (fn) => [...roles.values()].find(fn);
  const createdRoles = [];
  return {
    id: 'g1',
    createdRoles,
    channels: { cache: channels, fetch: async () => {} },
    roles: {
      cache: roles,
      fetch: async () => {},
      create: async (o) => {
        const r = {
          id: `r${createdRoles.length + 1}`,
          name: o.name,
          guild: { id: 'g1' },
          perms: o.permissions,
          setPosition: async () => {},
        };
        createdRoles.push(o.name);
        roles.set(r.id, r);
        return r;
      },
    },
    members: { fetch: async () => ({ id: 'u1' }) },
  };
}
function fakeContext(flags = {}) {
  const calls = [];
  const rec =
    (name) =>
    (...a) =>
      calls.push([name, ...a]);
  return {
    calls,
    config: {
      memberEventsEnabled: false,
      messageEventsEnabled: false,
      auditEventsEnabled: false,
      voiceEventsEnabled: true,
      ...flags,
    },
    guildConfig: { setLanguage: rec('language'), patch: rec('patch') },
    antinuke: {
      patch: rec('antinuke'),
      get: () => ({ quarantine: {} }),
    },
    automod: { patch: rec('automod') },
    autoroles: { add: rec('autorole') },
    tickets: { configure: rec('tickets') },
    voiceMaster: { setup: rec('voice'), config: () => ({ category_id: 'x' }) },
    voiceJoin: { set: rec('vmjoin') },
    mediaPolicy: { setup: rec('media') },
    voiceRoles: { set: rec('vcrole') },
    guildTags: { setup: rec('guildtag') },
    autoresponders: {
      find: () => null,
      create: rec('responder'),
      edit: rec('responderEdit'),
    },
    rolePanels: { channelRecords: () => ({ panels: [] }) },
  };
}
const bot = { id: 'bot', roles: { highest: { position: 5 } } };

test('writes the full default config, creating roles, and marks off-flag parts dormant', async () => {
  const guild = fakeGuild();
  const c = fakeContext();
  // Roles are created without managed/permission data, so skip the real role safety check.
  const results = await runAutoSetup({ guild, context: c, actorId: 'u1', bot });
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.deepEqual(guild.createdRoles.slice(0, 3), ['Owner', 'Mod', 'Member']);
  assert.equal(by.language.status, 'saved');
  assert.equal(by.roles.status, 'saved');
  assert.equal(by.logging.status, 'dormant');
  assert.equal(by.logging.flag, 'ENABLE_MEMBER_EVENTS');
  assert.equal(by.antinuke.flag, 'ENABLE_AUDIT_EVENTS');
  assert.equal(by.automod.flag, 'ENABLE_MESSAGE_EVENTS');
  assert.equal(by.vmjoin.status, 'saved');
  assert.deepEqual(
    c.calls.find((x) => x[0] === 'language'),
    ['language', 'g1', 'hinglish'],
  );
  const logging = c.calls.find((x) => x[0] === 'patch' && x[2] === 'logging');
  assert.deepEqual(logging[3].events, LOG_EVENTS);
  assert.equal(logging[3].enabled, true);
  assert.equal(c.calls.find((x) => x[0] === 'automod')[2].action, 'delete');
  const welcome = c.calls.find((x) => x[0] === 'patch' && x[2] === 'welcome')[3];
  assert.equal(welcome.message, "Welcome {user} to {server} 🔥 You're member #{count} - have fun!");
  assert.equal(welcome.messageCustom, true);
  assert.equal(welcome.goodbyeEnabled, true);
  const staffCat = [...guild.channels.cache.values()].find((x) => x.name === STRUCTURE[5].name);
  assert.equal(staffCat.edits.length, 2);
});

test('skips channel-based steps when the layout does not exist', async () => {
  const guild = fakeGuild({ withStructure: false });
  const results = await runAutoSetup({ guild, context: fakeContext(), actorId: 'u1', bot });
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.equal(by.logging.reason, 'structureMissing');
  assert.equal(by.voice.reason, 'structureMissing');
});

test('one failing step does not stop the others', async () => {
  const guild = fakeGuild();
  const c = fakeContext({ memberEventsEnabled: true });
  c.automod.patch = () => {
    throw new Error('boom');
  };
  const results = await runAutoSetup({ guild, context: c, actorId: 'u1', bot });
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.equal(by.automod.status, 'failed');
  assert.equal(by.logging.status, 'saved');
  assert.equal(by.voice.status, 'saved');
});

test('owner role falls back without Administrator when Discord refuses it', async () => {
  const guild = fakeGuild();
  const create = guild.roles.create;
  guild.roles.create = async (o) => {
    if (o.permissions.length && o.name === 'Owner') throw new Error('missing access');
    return create(o);
  };
  const results = await runAutoSetup({ guild, context: fakeContext(), actorId: 'u1', bot });
  const roles = results.find((r) => r.key === 'roles');
  assert.deepEqual(roles.notes, ['autoOwnerNoAdmin']);
  assert.deepEqual(guild.createdRoles.slice(0, 3), ['Owner', 'Mod', 'Member']);
});

test('extended defaults: media-only, voice role, guild tag, responders, banned words, input list', async () => {
  const guild = fakeGuild();
  const c = fakeContext();
  const results = await runAutoSetup({ guild, context: c, actorId: 'u1', bot });
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.deepEqual(guild.createdRoles.slice(3), [
    'Quarantine',
    'In Voice',
    'FF Player',
    'Minecraft',
    'Announcements',
  ]);
  assert.equal(by.media.flag, 'ENABLE_MESSAGE_EVENTS');
  assert.equal(by.vcrole.status, 'saved');
  assert.equal(by.guildtag.status, 'saved');
  assert.equal(by.autoresponders.flag, 'ENABLE_MESSAGE_EVENTS');
  assert.equal(by.reactionroles.reason, 'noInteraction');
  assert.equal(by.needsInput.status, 'info');
  const triggers = c.calls.filter((x) => x[0] === 'responder').map((x) => x[2].trigger);
  assert.deepEqual(triggers, ['rules', 'invite']);
  const automod = c.calls.find((x) => x[0] === 'automod')[2];
  assert.equal(automod.rules.words, true);
  assert.ok(automod.words.includes('madarchod') && automod.words.includes('fuck'));
  assert.equal(automod.exemptRoles.length, 2);
});

test('rerun edits existing responders instead of failing', async () => {
  const guild = fakeGuild();
  const c = fakeContext();
  c.autoresponders.find = () => ({ id: 1 });
  const results = await runAutoSetup({ guild, context: c, actorId: 'u1', bot });
  assert.equal(results.find((r) => r.key === 'autoresponders').status, 'dormant');
  assert.equal(c.calls.filter((x) => x[0] === 'responderEdit').length, 2);
});

test('renamed or plain-named channels still match through normalized names', async () => {
  const guild = fakeGuild();
  for (const ch of guild.channels.cache.values())
    if (ch.name === STRUCTURE[3].channels[0].name) ch.name = 'join to create';
    else if (ch.name === STRUCTURE[5].channels[1].name) ch.name = 'Mod Logs';
  const c = fakeContext();
  const results = await runAutoSetup({ guild, context: c, actorId: 'u1', bot });
  const by = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.equal(by.vmjoin.status, 'saved');
  assert.equal(by.logging.status, 'dormant');
});
