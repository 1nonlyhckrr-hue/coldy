import { UserError } from '../utils/errors.js';
// /modcase: private mod notes, member history and ban appeals. Notes and appeals live in FeatureStore.
const NOTE_MAX = 40,
  APPEAL_MAX = 100;
export const clip = (s, n = 500) => {
  const t = String(s ?? '').replace(/@(everyone|here)/g, '@\u200b$1');
  return t.length > n ? t.slice(0, n) + '...' : t;
};
export class ModCase {
  constructor(c) {
    this.c = c;
  }
  addNote(g, userId, by, text) {
    if (this.notes(g, userId).length >= NOTE_MAX) throw new UserError('mcNoteLimit');
    const f = this.c.features;
    f.set(
      g,
      'note',
      `${userId}:${String(Date.now()).padStart(15, '0')}${Math.random().toString(36).slice(2, 6)}`,
      {
        by,
        text: clip(text, 500),
        at: Date.now(),
      },
    );
  }
  notes(g, userId) {
    return this.c.features.list(g, 'note', userId + ':', NOTE_MAX).map((r) => r.value);
  }
  history(g, userId) {
    const cases = this.c.cases.caseSubject(g, 'target', userId, 1);
    return {
      cases: cases.rows,
      caseTotal: cases.total,
      warnings: this.c.cases.warnings(g, userId).length,
      notes: this.notes(g, userId).length,
      appeal: this.appeal(g, userId),
    };
  }
  logAppeal(g, userId, by, text) {
    const f = this.c.features;
    const cur = this.appeal(g, userId);
    if (cur?.status === 'open') throw new UserError('mcAppealOpen');
    if (f.count(g, 'appeal', '') >= APPEAL_MAX && !cur) throw new UserError('mcAppealLimit');
    f.set(g, 'appeal', userId, { text: clip(text, 1000), by, at: Date.now(), status: 'open' });
  }
  appeal(g, userId) {
    return this.c.features.get(g, 'appeal', userId);
  }
  openAppeals(g) {
    return this.c.features
      .list(g, 'appeal', '', APPEAL_MAX)
      .filter((r) => r.value.status === 'open')
      .map((r) => ({ userId: r.key, ...r.value }));
  }
  decide(g, userId, status, by) {
    const a = this.appeal(g, userId);
    if (!a || a.status !== 'open') throw new UserError('mcNoAppeal');
    this.c.features.set(g, 'appeal', userId, {
      ...a,
      status,
      decidedBy: by,
      decidedAt: Date.now(),
    });
    return a;
  }
}

// ---------- ban appeals by DM ----------
export const APPEALS = { enabled: true };
export const appealsEnabled = (c, g) => c.features.config(g, 'appealcfg', APPEALS).enabled === true;
const COOLDOWN = 15000;
export function createAppealDmHandler(c) {
  const seen = new Map();
  const reply = async (m, g, key, p = {}) => {
    try {
      await m.reply({
        content: c.localization.t(g?.id ?? null, key, p),
        allowedMentions: { parse: [] },
      });
    } catch {
      // DMs closed
    }
  };
  return async (m) => {
    try {
      if (m.guild || !m.author || m.author.bot) return;
      const now = Date.now();
      if (now - (seen.get(m.author.id) ?? 0) < COOLDOWN) return;
      seen.set(m.author.id, now);
      if (seen.size > 5000) seen.clear();
      const found = [];
      for (const g of m.client.guilds.cache.values()) {
        if (!appealsEnabled(c, g.id) || !c.logHub.channelId(g.id, 'mod')) continue;
        const ban = await g.bans.fetch({ user: m.author.id, force: true }).catch(() => null);
        if (ban) found.push(g);
      }
      if (!found.length) return;
      let text = String(m.content ?? '').trim(),
        guild = found[0];
      if (found.length > 1) {
        const id = (text.match(/\d{17,20}/) ?? [])[0];
        guild = found.find((g) => g.id === id);
        if (!guild)
          return reply(m, found[0], 'mcDmPick', {
            list: found.map((g) => `${g.name}: ${g.id}`).join('\n'),
          });
        text = text.replace(id, '').trim();
      }
      if (text.length < 10) return reply(m, guild, 'mcDmShort', { server: guild.name });
      const cm = c.modCase;
      cm.logAppeal(guild.id, m.author.id, m.author.id, text);
      await c.logHub.send(guild, 'mod', 'mcAppealIn', {
        user: `<@${m.author.id}>`,
        id: m.author.id,
        text: clip(text, 1000),
      });
      await reply(m, guild, 'mcDmReceived', { server: guild.name });
    } catch (e) {
      if (e?.key === 'mcAppealOpen') {
        const g = [...m.client.guilds.cache.values()].find(
          (x) => c.modCase.appeal(x.id, m.author.id)?.status === 'open',
        );
        if (g) await reply(m, g, 'mcDmOpen', { server: g.name });
      } else c.logger?.warn?.({ kind: 'appeal_dm' }, 'Appeal DM unavailable');
    }
  };
}
