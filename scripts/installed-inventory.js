import { writeFile } from 'node:fs/promises';
import { loadCommands } from '../src/services/registry.js';
import { PermissionsBitField } from 'discord.js';
const commands = await loadCommands(),
  rows = [];
for (const command of commands.values()) {
  const d = command.data.toJSON(),
    sub = (d.options ?? []).filter((o) => o.type === 1);
  for (const path of sub.length ? sub : [d]) {
    const options = (path.options ?? []).filter((o) => ![1, 2].includes(o.type)),
      syntax =
        '/' +
        d.name +
        (path !== d ? ' ' + path.name : '') +
        options.map((o) => (o.required ? ' (' + o.name + ')' : ' [' + o.name + ']')).join('');
    rows.push({
      name: d.name + (path !== d ? ' ' + path.name : ''),
      category: command.category,
      syntax,
      description: path.description,
      parameters: options.map((o) => ({
        name: o.name,
        required: !!o.required,
        type: o.type,
        ...(o.choices ? { choices: o.choices } : {}),
        ...(o.min_value !== undefined ? { min: o.min_value } : {}),
        ...(o.max_value !== undefined ? { max: o.max_value } : {}),
        ...(o.min_length !== undefined ? { minLength: o.min_length } : {}),
        ...(o.max_length !== undefined ? { maxLength: o.max_length } : {}),
      })),
      userPermissions: (command.userPermissions ?? []).flatMap((p) =>
        new PermissionsBitField(p).toArray(),
      ),
      botPermissions: (command.botPermissions ?? []).flatMap((p) =>
        new PermissionsBitField(p).toArray(),
      ),
      defaultMemberPermissions: d.default_member_permissions
        ? new PermissionsBitField(BigInt(d.default_member_permissions)).toArray()
        : [],
      aliases: [],
      referenceVerified: false,
      implemented: true,
      tested: false,
      testStatus: 'Local unit/mock coverage only. Live gateway/API/visual test unverified.',
      cooldownMs: command.cooldownMs ?? 3000,
      notes:
        'Original installed Luna slash path,not claimed exact reference equivalence. Permission arrays include static dispatcher requirements only;action-specific native channel/hierarchy/config checks live in the implementation and linked module guide. Empty static array does not mean no permission checks. Tested flag requires live acceptance and stays false.',
      source: 'src/commands/' + command.category + '/' + d.name + '.js',
    });
  }
}
rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
await writeFile('data/luna-commands.json', JSON.stringify(rows, null, 2) + '\n');
const columns = Object.keys(rows[0]);
const quote = (value) => {
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
await writeFile(
  'data/luna-commands.csv',
  columns.join(',') +
    '\n' +
    rows.map((r) => columns.map((k) => quote(r[k])).join(',')).join('\n') +
    '\n',
);
console.log(
  `${commands.size} top-level,${rows.length} installed paths. Reference inventory is separate.`,
);
