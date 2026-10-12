import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Constants } from 'shoukaku';
import {
  YouTubeLavalinkAdapter,
  musicRequest,
  musicResolveDiagnostic,
} from '../src/services/musicRuntime.js';
function setup(result) {
  const logs = [],
    node = {
      state: Constants.State.CONNECTED,
      info: { version: { major: 4, minor: 2 }, sourceManagers: ['youtube'] },
      rest: { resolve: async () => result },
    },
    a = new YouTubeLavalinkAdapter({ nodes: new Map([['n', node]]) });
  a.logger = { warn: (fields, message) => logs.push({ fields, message }) };
  return { a, node, logs };
}
test('musicdiagnostic loaderror empty invalid track keeps originalfail/query/loadtype/nodecause visiblewarn', async () => {
  for (const loadType of ['error', 'empty', 'playlist', 'track']) {
    const s = setup({
      loadType,
      data: {
        message: 'YouTube returned403',
        cause: 'provider rejected',
        severity: 'common',
        status: 403,
      },
    });
    await assert.rejects(() => s.a.resolve(musicRequest('test song')), /musicLoadFailed/);
    assert.equal(s.logs.length, 1);
    assert.equal(s.logs[0].fields.query, 'test song');
    assert.equal(s.logs[0].fields.loadType, loadType);
    if (loadType === 'error') {
      assert.equal(s.logs[0].fields.statusCode, 403);
      assert.equal(s.logs[0].fields.errorMessage, 'YouTube returned403');
      assert.equal(s.logs[0].fields.exception, 'provider rejected');
    }
  }
});
test('musicdiagnostic nativeexception status/errorname message logs then sameerror guards unchanged', async () => {
  const s = setup(null),
    error = Object.assign(new Error('HTTP request failed'), { statusCode: 429 });
  s.node.rest.resolve = async () => {
    throw error;
  };
  await assert.rejects(
    () => s.a.resolve(musicRequest('song')),
    (e) => e === error,
  );
  assert.equal(s.logs[0].fields.statusCode, 429);
  assert.equal(s.logs[0].fields.errorName, 'Error');
  s.node.info.version = { major: 0, minor: 0 };
  await assert.rejects(() => s.a.resolve(musicRequest('song')), /musicNodeIncompatible/);
  assert.equal(s.logs[1].fields.stage, 'request');
});
test('musicdiagnostic boundedselective logs strip credentials urls controls no rawstack/encodedheaders', async () => {
  let fields;
  musicResolveDiagnostic({ warn: (f) => (fields = f) }, musicRequest('song'), {
    stage: 'request',
    error: {
      name: 'Error',
      message:
        'token=secret authorization=hidden Bearer hidden https://x.test/auth?secret=hidden\n' +
        'x'.repeat(900),
      status: 401,
      stack: 'private',
      headers: { authorization: 'private' },
    },
  });
  const json = JSON.stringify(fields);
  for (const secret of ['secret', 'hidden', 'private', 'x.test']) assert(!json.includes(secret));
  assert(fields.errorMessage.length <= 500);
  assert.equal(fields.statusCode, 401);
  assert(!('stack' in fields));
});
test('musicdiagnostic success silent and loggerfailure cannot alter resolverbehavior', async () => {
  const track = {
      encoded: 'encoded',
      info: {
        identifier: 'abcdefghijk',
        title: 'Song',
        author: 'Maker',
        sourceName: 'youtube',
        isStream: false,
        length: 1000,
      },
    },
    s = setup({ loadType: 'track', data: track });
  assert.equal((await s.a.resolve(musicRequest('song'))).encoded, 'encoded');
  assert.equal(s.logs.length, 0);
  s.a.logger.warn = () => {
    throw Error('logger');
  };
  s.node.rest.resolve = async () => ({ loadType: 'empty' });
  await assert.rejects(() => s.a.resolve(musicRequest('song')), /musicLoadFailed/);
});
