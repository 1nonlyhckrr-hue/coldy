import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${file.name}`;
    if (file.isDirectory()) await check(path);
    else if (file.name.endsWith('.js')) {
      const p = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (p.status) process.exit(p.status);
    }
  }
}
for (const dir of ['src', 'scripts', 'test']) await check(dir);
console.log('All JavaScript syntax checks passed.');
