// Migrations: the .sql files of a folder, each applied once, in name order. The helpers above applyMigrations
// are pure, so they run without a database.

import type { Database, Lang } from './db.js';

export interface Migration {
  /** The file name, for example `0001_create_notes.sql`. Names sort in the order they run. */
  name: string;
  sql: string;
}

export interface MigrationResult {
  /** Applied by this run, in order. */
  applied: string[];
  /** Already recorded by an earlier run. */
  skipped: string[];
}

/** The table that records what has been applied. */
export const MIGRATIONS_TABLE = '_zeiko_migrations';

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The `.sql` names among `names`, in the order they run. Plain name order, so pad the numbers: `0002` before `0010`. */
export function migrationFiles(names: string[]): string[] {
  return names.filter((name) => name.endsWith('.sql')).sort(byName);
}

/** A dollar-quote tag such as `$$` or `$body$` starting at `at`, or null. */
function dollarTagAt(sql: string, at: number): string | null {
  if (at > 0 && /[A-Za-z0-9_]/.test(sql[at - 1])) return null;
  const pattern = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;
  pattern.lastIndex = at;
  const found = pattern.exec(sql);
  return found ? found[0] : null;
}

/**
 * Splits SQL text into statements at `;`, leaving alone a `;` inside quotes, dollar quotes (postgres `$$ ... $$`)
 * and comments. Comments are dropped, and empty statements are skipped. Quotes follow standard SQL: a doubled
 * quote is one quote, and a backslash is not an escape.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  const push = () => {
    const statement = current.trim();
    if (statement) out.push(statement);
    current = '';
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const tag = c === '$' ? dollarTagAt(sql, i) : null;
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] !== c) break;
          j += 2;
        } else {
          j += 1;
        }
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
    } else if (tag !== null) {
      const close = sql.indexOf(tag, i + tag.length);
      const end = close === -1 ? sql.length : close + tag.length;
      current += sql.slice(i, end);
      i = end;
    } else if (c === ';') {
      push();
      i += 1;
    } else {
      current += c;
      i += 1;
    }
  }
  push();
  return out;
}

/**
 * Applies the migrations that are not recorded yet, in name order. Each one runs as one transaction together with
 * its record, so a file that fails leaves nothing behind and stops the run. Works on postgres, mysql and sqlite
 * databases. Other languages are refused.
 */
export async function applyMigrations(
  db: Pick<Database, 'query' | 'batch'>,
  migrations: Migration[],
  lang: Lang,
): Promise<MigrationResult> {
  if (lang !== 'postgres' && lang !== 'mysql' && lang !== 'sqlite') {
    throw new Error(`Migrations are SQL: use a postgres, mysql or sqlite database (this one speaks ${lang}).`);
  }
  const [first, second] = lang === 'postgres' ? ['$1', '$2'] : ['?', '?'];
  await db.query(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name text primary key, applied_at text)`);
  const recorded = await db.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  const done = new Set(recorded.rows.map((row) => String(row[0])));
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const migration of [...migrations].sort((a, b) => byName(a.name, b.name))) {
    if (done.has(migration.name)) {
      result.skipped.push(migration.name);
      continue;
    }
    await db.batch([
      ...splitStatements(migration.sql).map((sql) => ({ sql })),
      {
        sql: `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (${first}, ${second})`,
        params: [migration.name, new Date().toISOString()],
      },
    ]);
    result.applied.push(migration.name);
  }
  return result;
}
