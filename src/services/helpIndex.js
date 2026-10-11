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

export function commandDetails(commands, path, page = 1) {
  if (
    typeof path !== 'string' ||
    !path.trim() ||
    path.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(path)
  )
    throw new UserError('helpDetailInvalid');
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new UserError('helpPageInvalid');
  const parts = path.trim().replace(/^\//, '').toLowerCase().split(/\s+/);
  if (parts.length > 2) throw new UserError('helpDetailInvalid');
  const command = commands.get(parts[0]);
  if (!command) throw new UserError('helpDetailMissing');
  const data = command.data.toJSON(),
    subs = (data.options ?? []).filter((o) => o.type === 1),
    selected = parts[1] ? subs.find((o) => o.name === parts[1]) : data;
  if (!selected || (subs.length && !parts[1])) throw new UserError('helpDetailMissing');
  const options = (selected.options ?? []).filter((o) => ![1, 2].includes(o.type)),
    lines = [];
  for (const o of options) {
    lines.push({
      kind: 'parameter',
      name: o.name,
      type: o.type,
      required: !!o.required,
      description: o.description,
    });
    const bounds = Object.fromEntries(
      ['min_value', 'max_value', 'min_length', 'max_length', 'channel_types']
        .filter((k) => o[k] !== undefined)
        .map((k) => [k, o[k]]),
    );
    if (Object.keys(bounds).length) lines.push({ kind: 'bounds', name: o.name, bounds });
    for (const choice of o.choices ?? [])
      lines.push({ kind: 'choice', name: o.name, label: choice.name, value: choice.value });
  }
  const pages = Math.max(1, Math.ceil(lines.length / 6));
  if (page > pages) throw new UserError('helpPageInvalid');
  return {
    path: '/' + parts.join(' '),
    description: selected.description,
    category: command.category,
    cooldownMs: command.cooldownMs ?? 0,
    parameters: options.length,
    lines: lines.slice((page - 1) * 6, page * 6),
    page,
    pages,
  };
}
