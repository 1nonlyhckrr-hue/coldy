import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createLogger } from '../src/utils/logger.js';
test('logger redacts structured secrets from actual emitted output', () => {
  let output = '';
  const destination = new Writable({
    write(chunk, encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger('info', destination);
  logger.info(
    {
      token: 'TOP_SECRET',
      config: { token: 'NESTED_SECRET' },
      authorization: 'BEARER_SECRET',
      safe: 'ok',
    },
    'check',
  );
  assert(!output.includes('TOP_SECRET'));
  assert(!output.includes('NESTED_SECRET'));
  assert(!output.includes('BEARER_SECRET'));
  assert(output.includes('ok'));
});
