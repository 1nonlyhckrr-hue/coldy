import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { domainToASCII } from 'node:url';
// Free, public blocklists. Opt-in: only used when an admin enables the phishing or nsfwlinks
// AutoMod rule. Nothing here needs an API key or a paid service.
export const SOURCES = {
  phishing: [
    {
      name: 'discord-antiscam',
      url: 'https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.txt',
    },
    { name: 'phishing-army', url: 'https://phishing.army/download/phishing_army_blocklist.txt' },
  ],
  nsfw: [
    {
      name: 'stevenblack-porn',
      url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
    },
  ],
};
export const MAX_BYTES = 8 * 1024 * 1024;
const OFFICIAL = new Set([
  'discord.com',
  'discord.gg',
  'discordapp.com',
  'discordapp.net',
  'discord.media',
  'discordstatus.com',
  'discord.new',
  'discord.gift',
  'discordcdn.com',
  'discord.co',
  'discord.design',
  'discord.dev',
  'discord.store',
  'discordmerch.com',
  'steamcommunity.com',
  'steampowered.com',
  'steamstatic.com',
]);
const LOOKALIKE = ['discord', 'discordapp', 'steamcommunity', 'steampowered'];
const HOST_RE = /(?:https?:\/\/)?((?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]{2,})/giu;
export function extractHosts(text) {
  const out = new Set();
  for (const m of String(text).matchAll(HOST_RE)) {
    const raw = m[1].toLowerCase().replace(/\.$/, ''),
      h = domainToASCII(raw) || raw;
    if (h) out.add(h);
  }
  return [...out];
}
/** Parses plain domain lists and hosts files; ignores comments and URLs' paths. */
export function parseList(body) {
  const set = new Set();
  for (const raw of String(body).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim().toLowerCase();
    if (!line) continue;
    const parts = line.split(/\s+/);
    let host =
      parts.length > 1 && /^(0\.0\.0\.0|127\.0\.0\.1)$/.test(parts[0]) ? parts[1] : parts[0];
    host = host.replace(/^https?:\/\//, '').split(/[/?#:]/)[0];
    if (/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(host) && host !== 'localhost') set.add(host);
  }
  return set;
}
export function inSet(host, set) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) if (set.has(labels.slice(i).join('.'))) return true;
  return false;
}
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}
/** Offline heuristic: a lookalike of Discord or Steam that is not an official domain. */
export function isLookalike(host) {
  const labels = host.split('.');
  const registrable = labels.slice(-2).join('.');
  if (OFFICIAL.has(registrable) || inSet(host, OFFICIAL)) return false;
  return labels.slice(0, -1).some((l) => LOOKALIKE.some((t) => distance(l, t) <= 1));
}
export class LinkSafety {
  constructor({ fetcher = globalThis.fetch, dir = null, logger = null } = {}) {
    this.fetcher = fetcher;
    this.dir = dir;
    this.logger = logger;
    this.sets = { phishing: new Set(), nsfw: new Set() };
    this.loaded = { phishing: 0, nsfw: 0 };
    this.timer = null;
  }
  loadCache() {
    if (!this.dir) return;
    for (const kind of Object.keys(SOURCES))
      try {
        this.sets[kind] = parseList(readFileSync(join(this.dir, kind + '.txt'), 'utf8'));
        this.loaded[kind] = this.sets[kind].size;
      } catch {
        /* no cache yet */
      }
  }
  async download(url) {
    const res = await this.fetcher(url, { signal: globalThis.AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('list too large');
    return text;
  }
  /** Downloads every list of one kind. A failed source keeps the previous data. */
  async refresh(kind) {
    const merged = new Set(),
      bodies = [];
    let ok = 0;
    for (const src of SOURCES[kind]) {
      try {
        const body = await this.download(src.url);
        bodies.push(body);
        for (const h of parseList(body)) merged.add(h);
        ok++;
      } catch (error) {
        this.logger?.warn?.(
          { kind, source: src.name, error: error.message },
          'Blocklist refresh failed',
        );
      }
    }
    if (ok && merged.size) {
      this.sets[kind] = merged;
      this.loaded[kind] = merged.size;
      if (this.dir)
        try {
          mkdirSync(this.dir, { recursive: true });
          writeFileSync(join(this.dir, kind + '.txt'), [...merged].join('\n') + '\n');
        } catch {
          /* cache is optional */
        }
    }
    return { ok, size: this.sets[kind].size };
  }
  start(intervalMs = 12 * 3600 * 1000) {
    this.loadCache();
    const run = () => Promise.all(Object.keys(SOURCES).map((k) => this.refresh(k))).catch(() => {});
    run();
    this.timer = setInterval(run, intervalMs);
    this.timer.unref?.();
  }
  stop() {
    clearInterval(this.timer);
  }
  /** kind 'phishing' | 'nsfw'. Returns true when any link in the text is listed. */
  check(text, kind) {
    for (const host of extractHosts(text)) {
      if (inSet(host, this.sets[kind])) return true;
      if (kind === 'phishing' && (isLookalike(host) || /(^|\.)xn--/.test(host))) return true;
    }
    return false;
  }
}
