import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database/index.js';
test('all45 schema migrations apply once in order with foreign-key integrity and transactional new tables', () => {
  const db = openDatabase(':memory:');
  try {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    assert.deepEqual(
      rows.map((r) => r.version),
      Array.from({ length: 48 }, (_, n) => n + 1),
    );
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.throws(() =>
      db.prepare('INSERT INTO role_panel_buttons VALUES(?,?,?,?)').run(999, 0, 'r', 'x'),
    );
    assert.equal(db.prepare('SELECT count(*) n FROM role_panel_buttons').get().n, 0);
  } finally {
    db.close();
  }
});
