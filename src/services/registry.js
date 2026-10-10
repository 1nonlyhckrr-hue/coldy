import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function loadCommands(directory = new URL('../commands/', import.meta.url)) {
  const root = directory instanceof URL ? directory : resolve(directory);
  const registry = new Map();
  for (const category of await readdir(root, {withFileTypes:true})) {
    if (!category.isDirectory()) continue;
    const dir = root instanceof URL ? new URL(`${category.name}/`, root) : join(root,category.name);
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.js')) continue;
      const url = dir instanceof URL ? new URL(file, dir) : pathToFileURL(join(dir,file));
      const {default:command} = await import(url.href);
      if (!command?.data?.name || typeof command.execute !== 'function') throw new Error(`Invalid command module: ${category.name}/${file}`);
      if (command.category !== category.name) throw new Error(`Category mismatch: ${file}`);
      if (registry.has(command.data.name)) throw new Error(`Duplicate command: ${command.data.name}`);
      command.data.toJSON();
      registry.set(command.data.name,command);
    }
  }
  return registry;
}
