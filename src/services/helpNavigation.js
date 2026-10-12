import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  escapeMarkdown,
} from 'discord.js';
import { helpPage, commandDetails } from './helpIndex.js';
import { translate } from './localization.js';
import { lunaEmbed } from '../utils/embeds.js';
import { UserError, handleInteractionError } from '../utils/errors.js';

export class HelpNavigation {
  constructor({ now = Date.now, ttlMs = 30 * 60 * 1000, maxSessions = 500 } = {}) {
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
  }
  create(guildId, state) {
    this.prune();
    if (this.sessions.size >= this.maxSessions)
      this.sessions.delete(this.sessions.keys().next().value);
    const id = randomUUID().replaceAll('-', '');
    this.sessions.set(id, { ...state, guildId, expires: this.now() + this.ttlMs });
    return id;
  }
  prune() {
    for (const [id, s] of this.sessions) if (s.expires <= this.now()) this.sessions.delete(id);
  }
  get(id, guildId) {
    this.prune();
    const s = this.sessions.get(id);
    if (!s || s.guildId !== guildId) throw new UserError('helpExpired');
    return s;
  }
}
export function helpView(context, state, id) {
  const locale = context.localization?.locale(state.guildId) ?? 'en';
  const t = (k, p) => translate(locale, k, p);
  const categories = [...new Set([...context.commands.values()].map((c) => c.category))].sort();
  let result, rows;
  if (state.command) {
    result = commandDetails(context.commands, state.command, state.page);
    rows = result.lines.map((row) =>
      row.kind === 'parameter'
        ? t('helpParameter', {
            name: row.name,
            type: row.type,
            required: t(row.required ? 'helpRequired' : 'helpOptional'),
            description: row.description,
          })
        : row.kind === 'bounds'
          ? t('helpParameterBounds', { name: row.name, bounds: JSON.stringify(row.bounds) })
          : t('helpChoice', {
              name: row.name,
              label: escapeMarkdown(row.label),
              value: escapeMarkdown(String(row.value)),
            }),
    );
  } else {
    result = helpPage(context.commands, state);
    rows = result.lines.map((line) => {
      const split = line.indexOf(':');
      return `**${line.slice(0, split)}**\n${line.slice(split + 1).trim()}`;
    });
  }
  const embed = lunaEmbed({
    locale,
    title: t('helpNavTitle'),
    description:
      t('helpNavIntro') +
      '\n\n' +
      (state.command ? result.description + '\n\n' : '') +
      (rows.join('\n\n') || t('helpNoResults')),
    fields: [
      {
        name: t('helpNavScope'),
        value: state.command
          ? result.path
          : (state.category ? state.category : t('helpNavAll')) +
            (state.search ? ` • ${escapeMarkdown(state.search)}` : ''),
        inline: true,
      },
      { name: t('helpNavPage'), value: `${result.page} / ${result.pages}`, inline: true },
      {
        name: t('helpNavCount'),
        value: String(state.command ? result.parameters : result.total),
        inline: true,
      },
    ],
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`emika:help:${id}:category`)
    .setPlaceholder(t('helpNavCategory'))
    .addOptions([
      { label: t('helpNavAll'), value: 'all', default: !state.category && !state.command },
      ...categories.map((cat) => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        value: cat,
        default: cat === state.category && !state.command,
      })),
    ]);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`emika:help:${id}:home`)
      .setLabel(t('helpNavHome'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`emika:help:${id}:prev`)
      .setLabel(t('helpNavPrev'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page === 1),
    new ButtonBuilder()
      .setCustomId(`emika:help:${id}:next`)
      .setLabel(t('helpNavNext'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(result.page === result.pages),
  );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu), buttons],
    allowedMentions: { parse: [] },
  };
}
export function createHelpNavigationHandler(context) {
  return async (i) => {
    if (!(i.isButton?.() || i.isStringSelectMenu?.()) || !i.customId?.startsWith('emika:help:'))
      return;
    try {
      const match = /^emika:help:([a-f0-9]{32}):(home|prev|next|category)$/.exec(i.customId);
      if (!match) throw new UserError('helpExpired');
      const [, id, action] = match;
      const state = context.helpNavigation?.get(id, i.guildId);
      if (!state) throw new UserError('helpExpired');
      // Clone before rendering so rejected input never changes a live session.
      const next = { ...state };
      if (action === 'home')
        Object.assign(next, { page: 1, category: null, search: null, command: null });
      else if (action === 'category') {
        if (!i.isStringSelectMenu?.() || i.values?.length !== 1)
          throw new UserError('helpCategoryInvalid');
        Object.assign(next, {
          page: 1,
          category: i.values[0] === 'all' ? null : i.values[0],
          search: null,
          command: null,
        });
      } else {
        if (!i.isButton?.()) throw new UserError('helpExpired');
        next.page += action === 'next' ? 1 : -1;
      }
      const payload = helpView(context, next, id);
      await i.update(payload);
      context.helpNavigation.sessions.set(id, next);
    } catch (error) {
      await handleInteractionError(error, i, context.logger, context.localization);
    }
  };
}
