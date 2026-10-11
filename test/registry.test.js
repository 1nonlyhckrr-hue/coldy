import { translate } from '../src/services/localization.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCommands } from '../src/services/registry.js';
test('installed command names and option limits validate', async () => {
  const commands = await loadCommands();
  assert.deepEqual([...commands.keys()].sort(), [
    'about',
    'afk',
    'antinuke',
    'automation',
    'automod',
    'autoresponder',
    'avatar',
    'banner',
    'boostcount',
    'casehistory',
    'channel',
    'config',
    'customrole',
    'emojiinfo',
    'fun',
    'giveaway',
    'giveawayleave',
    'guildtag',
    'help',
    'leaderboard',
    'list',
    'logging',
    'membercount',
    'moderation',
    'music',
    'nickname',
    'permit',
    'ping',
    'poll',
    'pollmanage',
    'reactionroles',
    'role',
    'roleinfo',
    'schedulecleanup',
    'serverbanner',
    'servericon',
    'serverinfo',
    'slowmode',
    'stats',
    'stickerinfo',
    'ticket',
    'tools',
    'uptime',
    'userinfo',
    'voice',
    'voicemaster',
    'welcome',
  ]);
  for (const c of commands.values()) {
    const data = c.data.toJSON();
    assert.equal(data.contexts[0], 0);
    assert((data.options ?? []).length <= 25);
    assert(data.description.length <= 100);
  }
});
test('foundation and utility commands execute mock replies', async () => {
  const commands = await loadCommands();
  for (const c of commands.values()) {
    if (
      [
        'emojiinfo',
        'avatar',
        'serverbanner',
        'servericon',
        'serverinfo',
        'userinfo',
        'stickerinfo',
        'music',
        'nickname',
        'slowmode',
        'list',
        'membercount',
        'afk',
        'poll',
        'pollmanage',
        'banner',
        'boostcount',
        'casehistory',
        'channel',
        'role',
        'roleinfo',
        'schedulecleanup',
        'antinuke',
        'automod',
        'automation',
        'ticket',
        'tools',
        'giveaway',
        'giveawayleave',
        'autoresponder',
        'logging',
        'welcome',
        'moderation',
        'reactionroles',
        'voicemaster',
        'guildtag',
        'leaderboard',
        'customrole',
        'voice',
        'permit',
        'fun',
        'config',
      ].includes(c.data.name)
    )
      continue;
    const calls = [];
    const user = {
      id: '100000000000000001',
      username: 'Test',
      bot: false,
      createdAt: new Date('2020-01-01'),
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    };
    const i = {
      user,
      options: {
        getSubcommand: () => 'color',
        getUser: () => null,
        getInteger: () => null,
      },
      client: { ws: { ping: 42 } },
      guild: { name: 'Test', id: '1', memberCount: 3 },
      reply: async (v) => calls.push(v),
    };
    await c.execute(i, {
      commands,
      version: 'test',
      localization: { locale: () => 'en', t: (_g, key, params) => translate('en', key, params) },
    });
    assert.equal(calls.length, 1);
    assert(calls[0].embeds[0].data.description.length <= 2000);
  }
});

test('registry rejects invalid cooldown metadata at load rather than breaking first live interaction', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'luna-cooldown-registry-'));
  try {
    for (const [n, value] of [
      '0',
      '-1',
      'NaN',
      'Infinity',
      '1.5',
      '86400001',
      "'1000'",
      'null',
    ].entries()) {
      const dir = join(root, String(n), 'test');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'sample.js'),
        `export default {category:'test',cooldownMs:${value},data:{name:'sample',toJSON:()=>({name:'sample'})},execute:async()=>{}};`,
      );
      await assert.rejects(() => loadCommands(join(root, String(n))), /Invalid command cooldown/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('registry accepts default and inclusive valid cooldown bounds without changing metadata', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'luna-valid-cooldown-'));
  try {
    for (const [n, value] of [undefined, 1, 86400000].entries()) {
      const dir = join(root, String(n), 'test');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'sample.js'),
        `export default {category:'test',${value === undefined ? '' : `cooldownMs:${value},`}data:{name:'sample',toJSON:()=>({name:'sample'})},execute:async()=>{}};`,
      );
      const registry = await loadCommands(join(root, String(n)));
      assert.equal(registry.get('sample').cooldownMs, value);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
