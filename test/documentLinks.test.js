import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('checkpoint documentation preserves verified external run and reference identifiers', () => {
  for (const path of ['README.md', 'docs/MODULE_STATUS.md'])
    assert.match(
      readFileSync(path, 'utf8'),
      /https:\/\/github\.com\/1nonlyhckrr-hue\/coldy\/actions\/runs\/38139456100/,
    );
  assert.match(readFileSync('README.md', 'utf8'), /https:\/\/top\.gg\/bot\/1402377137087840378/);
});
