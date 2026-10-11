import { UserError } from '../utils/errors.js';
export function helpPage(commands, { page = 1, category, search } = {}) {
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new UserError('helpPageInvalid');
  const categories = [...new Set([...commands.values()].map((c) => c.category))].sort();
  if (category !== undefined && category !== null && !categories.includes(category))
    throw new UserError('helpCategoryInvalid');
  if (
    search !== undefined &&
    search !== null &&
    (typeof search !== 'string' ||
      !search.trim() ||
      search.length > 80 ||
      /[\x00-\x1f\x7f]/.test(search))
  )
    throw new UserError('helpSearchInvalid');
  const query = search?.trim().toLowerCase();
  const lines = [...commands.values()]
    .filter((c) => !category || c.category === category)
    .flatMap((command) => {
      const d = command.data.toJSON(),
        subs = (d.options ?? []).filter((o) => o.type === 1);
      return subs.length
        ? subs.map((s) => `/${d.name} ${s.name}: ${s.description}`)
        : [`/${d.name}: ${d.description}`];
    })
    .filter((line) => !query || line.toLowerCase().includes(query))
    .sort();
  // Never cut a command in half. Metadata is capped by native schema;8 rows fit safely.
  const pages = Math.max(1, Math.ceil(lines.length / 8));
  if (page > pages) throw new UserError('helpPageInvalid');
  return { lines: lines.slice((page - 1) * 8, page * 8), page, pages, total: lines.length };
}
