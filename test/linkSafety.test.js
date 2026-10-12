import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
import { AutoMod } from '../src/services/automod.js';
import {
  LinkSafety,
  SOURCES,
  extractHosts,
  parseList,
  inSet,
  isLookalike,
} from '../src/services/linkSafety.js';
test('hosts are extracted from links and bare domains, parents match, lists parse', () => {
  assert.deepEqual(extractHosts('see https://Evil.Example.com/path?x=1 and bad.org.'), [
    'evil.example.com',
    'bad.org',
  ]);
  const set = parseList(
    '# c\nexample.com\n0.0.0.0 hosts.example.net\nhttps://url.test/path\n127.0.0.1 localhost\n',
  );
  assert.deepEqual([...set].sort(), ['example.com', 'hosts.example.net', 'url.test']);
  assert.equal(inSet('a.b.example.com', set), true);
  assert.equal(inSet('notexample.com', set), false);
});
test('lookalike heuristic flags fake Discord and Steam hosts but not official ones', () => {
  for (const h of [
    'discorrd.com',
    'dlscord.gift',
    'discord.evil.com',
    'steamcommunlty.com',
    'xn--discord-9ya.com',
  ])
    assert.equal(new LinkSafety().check('https://' + h, 'phishing'), true, h);
  for (const h of [
    'discord.com',
    'cdn.discordapp.com',
    'discord.gg',
    'steamcommunity.com',
    'example.com',
  ])
    assert.equal(isLookalike(h), false, h);
});
test('refresh merges sources, keeps old data when every source fails, and bounds size', async () => {
  const bodies = {
    [SOURCES.phishing[0].url]: 'scam1.example\nscam2.example\n',
    [SOURCES.phishing[1].url]: '# x\nscam3.example\n',
    [SOURCES.nsfw[0].url]: '0.0.0.0 adult.example\n',
  };
  let fail = false;
  const ls = new LinkSafety({
    fetcher: async (u) => {
      if (fail) throw new Error('offline');
      return { ok: true, text: async () => bodies[u] };
    },
    logger: { warn() {} },
  });
  assert.deepEqual(await ls.refresh('phishing'), { ok: 2, size: 3 });
  await ls.refresh('nsfw');
  assert.equal(ls.check('go to x.scam3.example now', 'phishing'), true);
  assert.equal(ls.check('https://adult.example/a', 'nsfw'), true);
  assert.equal(ls.check('https://adult.example/a', 'phishing'), false);
  fail = true;
  assert.deepEqual(await ls.refresh('phishing'), { ok: 0, size: 3 });
  assert.equal(ls.check('scam1.example', 'phishing'), true);
  const big = new LinkSafety({
    fetcher: async () => ({ ok: true, text: async () => 'a'.repeat(9 * 1024 * 1024) }),
    logger: { warn() {} },
  });
  assert.deepEqual(await big.refresh('nsfw'), { ok: 0, size: 0 });
});
test('AutoMod phishing and nsfwlinks rules are off by default and only act when enabled', () => {
  const db = openDatabase(':memory:'),
    a = new AutoMod(db);
  try {
    a.linkSafety = new LinkSafety();
    a.linkSafety.sets.phishing = new Set(['scam.example']);
    a.linkSafety.sets.nsfw = new Set(['adult.example']);
    const msg = (content) => ({ content });
    const off = a.get('g');
    assert.ok(!off.rules.phishing);
    assert.ok(!off.rules.nsfwlinks);
    assert.equal(a.detect(msg('https://scam.example/x'), off), null);
    const on = { ...off, rules: { ...off.rules, phishing: true, nsfwlinks: true } };
    assert.equal(a.detect(msg('free https://scam.example/x'), on), 'phishing');
    assert.equal(a.detect(msg('https://adult.example'), on), 'nsfwlinks');
    assert.equal(a.detect(msg('https://example.org'), on), null);
  } finally {
    db.close();
  }
});
