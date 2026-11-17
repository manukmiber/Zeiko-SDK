import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, migrationFiles, splitStatements } from '../dist/index.js';

/** A fake client: `query` answers with the names already recorded, `batch` records what it was asked. */
function recorder(recorded) {
  const calls = [];
  return {
    calls,
    query: async (sql) => {
      calls.push({ kind: 'query', sql });
      return { columns: ['name'], rows: recorded.map((name) => [name]), rowsAffected: 0 };
    },
    batch: async (statements) => {
      calls.push({ kind: 'batch', statements });
      return statements.map(() => ({ columns: [], rows: [], rowsAffected: 1 }));
    },
  };
}

test('migrations are the .sql files, in name order', () => {
  assert.deepEqual(migrationFiles(['10_b.sql', '02_a.sql', 'README.md', '01_init.sql', '.DS_Store']), [
    '01_init.sql',
    '02_a.sql',
    '10_b.sql',
  ]);
});

test('statements split at semicolons outside quotes and comments', () => {
  assert.deepEqual(splitStatements("select 'a;b'; -- note; here\nselect \"x;y\"; /* c; */ select 3;;\n"), [
    "select 'a;b'",
    'select "x;y"',
    'select 3',
  ]);
  assert.deepEqual(splitStatements("select 'it''s;' ; select 2"), ["select 'it''s;'", 'select 2']);
  assert.deepEqual(splitStatements('  ;  '), []);
});

test('a dollar-quoted body keeps its semicolons', () => {
  assert.deepEqual(splitStatements('create function f() returns int as $$ select 1; select 2; $$ language sql; select 4'), [
    'create function f() returns int as $$ select 1; select 2; $$ language sql',
    'select 4',
  ]);
});

test('each migration runs once, in name order, and is recorded in its own transaction', async () => {
  const d = recorder(['01_init.sql']);
  const out = await applyMigrations(
    d,
    [
      { name: '02_more.sql', sql: 'alter table t add b int;' },
      { name: '01_init.sql', sql: 'create table t (a int);' },
    ],
    'postgres',
  );
  assert.deepEqual(out, { applied: ['02_more.sql'], skipped: ['01_init.sql'] });
  const batches = d.calls.filter((c) => c.kind === 'batch');
  assert.equal(batches.length, 1);
  const [statement, record] = batches[0].statements;
  assert.deepEqual(statement, { sql: 'alter table t add b int' });
  assert.equal(record.sql, 'INSERT INTO _zeiko_migrations (name, applied_at) VALUES ($1, $2)');
  assert.equal(record.params[0], '02_more.sql');
  assert.equal(typeof record.params[1], 'string');
});

test('mysql and sqlite record with ? placeholders, and other languages are refused', async () => {
  const d = recorder([]);
  await applyMigrations(d, [{ name: '01.sql', sql: 'select 1' }], 'mysql');
  const record = d.calls.find((c) => c.kind === 'batch').statements[1];
  assert.match(record.sql, /VALUES \(\?, \?\)$/);
  await assert.rejects(applyMigrations(recorder([]), [], 'kv'), /postgres, mysql or sqlite/);
  await assert.rejects(applyMigrations(recorder([]), [], 'mongo'), /postgres, mysql or sqlite/);
});
