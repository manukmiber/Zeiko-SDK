#!/usr/bin/env node
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyMigrations, database, migrationFiles, splitStatements, Zeiko, ZeikoError, type QueryResult } from './index.js';

const KEY_FILE = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'zeiko', 'key');

const HELP = `zeiko login <key>        save your API key
zeiko vps ls             your servers
zeiko vps start|stop|reboot <id>
zeiko payment <id>       a QRIS payment and where it stands
zeiko db list            your databases
zeiko db create <project-id> <name> --lang postgres|mysql|sqlite|kv|mongo
zeiko db delete <db-id>
zeiko db execute <db-id> "<sql>"   or --file <x.sql>
zeiko db migrations apply <db-id> <dir>
zeiko db snapshots <db-id>          its snapshots, archives and restores
zeiko db snapshot <db-id>           take a snapshot now
zeiko db restore <db-id> <snapshot-id> [--name <new name>]   into a new database
zeiko db export <db-id>             make a download archive
zeiko db download <db-id> <archive-id> [--out <file>]
zeiko db extension <db-id> <name>   vector, postgis, pg_trgm, uuid-ossp, citext, hstore, pgcrypto
zeiko db schedule <project-id> weekly|daily|hourly
zeiko api <METHOD> <path> [json body]
Add --json to print what the API answered.`;

type Say = (value: unknown, plain: () => string) => void;

const DB_LANGS = ['postgres', 'mysql', 'sqlite', 'kv', 'mongo'];
const SCHEDULES = ['weekly', 'daily', 'hourly'];

async function key(): Promise<string> {
  if (process.env.ZEIKO_API_KEY) return process.env.ZEIKO_API_KEY;
  try {
    return (await readFile(KEY_FILE, 'utf8')).trim();
  } catch {
    throw new Error('No API key: run zeiko login, or set ZEIKO_API_KEY.');
  }
}

/** Prints a row per server. Exported for the tests. */
export function vpsLines(services: any[]): string[] {
  return services.map((s) => [s.id, s.status, s.vpsName || s.label || '-', s.paidUntil ? new Date(s.paidUntil).toISOString().slice(0, 10) : '-'].join('\t'));
}

/** Prints a row per database. */
function dbLines(dbs: any[]): string[] {
  return dbs.map((d) => [d.id, d.lang ?? '-', d.state ?? '-', d.name ?? '-'].join('\t'));
}

/** Prints a row per snapshot, archive or restore. Exported for the tests. */
export function snapshotLines(snaps: any[]): string[] {
  return snaps.map((s) =>
    [s.id, s.kind ?? '-', s.state ?? '-', typeof s.createdAt === 'number' ? new Date(s.createdAt).toISOString().slice(0, 16).replace('T', ' ') : '-', s.bytes ? `${s.bytes} B` : '-', s.error ?? ''].join('\t').trimEnd(),
  );
}

/** The databases in `GET /v1/databases`: each project's `databases`, in `{ projects: [{ project, databases }] }`. */
function databasesOf(answer: any): any[] {
  const projects: any[] = Array.isArray(answer?.projects) ? answer.projects : [];
  return projects.flatMap((p) => (Array.isArray(p?.databases) ? p.databases : []));
}

const cellText = (value: unknown): string => (value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** Results as text: a table for each statement that answers rows, and a count for each that changes them. */
function tableText(results: QueryResult[]): string {
  return results
    .map((r) =>
      r.columns.length === 0
        ? `${r.rowsAffected} row(s) changed.`
        : [r.columns.join('\t'), ...r.rows.map((row) => row.map(cellText).join('\t'))].join('\n'),
    )
    .join('\n\n');
}

/** Takes `--name value` out of `args` and gives the value back, or undefined when the flag is not there. */
function takeFlag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value.`);
  args.splice(at, 2);
  return value;
}

async function dbCommand(args: string[], say: Say): Promise<void> {
  const [sub, ...rest] = args;
  const api = async () => new Zeiko({ apiKey: await key(), baseUrl: process.env.ZEIKO_API_URL });
  const db = async (id: string) => database(id, { key: await key(), baseUrl: process.env.ZEIKO_DB_URL });

  if (sub === 'list') {
    const answer = await (await api()).request('GET', '/v1/databases');
    const dbs = databasesOf(answer);
    say(answer, () => dbLines(dbs).join('\n') || 'No databases yet.');
    return;
  }
  if (sub === 'create') {
    const lang = takeFlag(rest, '--lang');
    const [project, name] = rest;
    if (!project || !name || !lang || !DB_LANGS.includes(lang)) {
      throw new Error(`Usage: zeiko db create <project-id> <name> --lang ${DB_LANGS.join('|')}`);
    }
    const answer = await (await api()).request('POST', `/v1/databases/projects/${encodeURIComponent(project)}/dbs`, { body: { name, lang } });
    const made = answer?.database ?? answer?.db ?? answer;
    say(answer, () => `${made.id}\t${made.url ?? '-'}`);
    return;
  }
  if (sub === 'delete') {
    const [id] = rest;
    if (!id) throw new Error('Usage: zeiko db delete <db-id>');
    const answer = await (await api()).request('DELETE', `/v1/databases/dbs/${encodeURIComponent(id)}`);
    say(answer ?? { id }, () => `Asked to delete ${id}.`);
    return;
  }
  if (sub === 'execute') {
    const file = takeFlag(rest, '--file');
    const [id, sqlArg] = rest;
    const text = file === undefined ? (sqlArg ?? '') : await readFile(file, 'utf8');
    const statements = splitStatements(text);
    if (!id || statements.length === 0) throw new Error('Usage: zeiko db execute <db-id> "<sql>" | --file <x.sql>');
    const results = await (await db(id)).batch(statements.map((sql) => ({ sql })));
    say(results, () => tableText(results));
    return;
  }
  if (sub === 'migrations') {
    const [verb, id, dir] = rest;
    if (verb !== 'apply' || !id || !dir) throw new Error('Usage: zeiko db migrations apply <db-id> <dir>');
    const found = databasesOf(await (await api()).request('GET', '/v1/databases')).find((d) => d.id === id);
    if (!found) throw new Error(`No database ${id} on this account.`);
    const entries = await readdir(dir, { withFileTypes: true });
    const names = migrationFiles(entries.filter((e) => e.isFile()).map((e) => e.name));
    const migrations = await Promise.all(names.map(async (name) => ({ name, sql: await readFile(join(dir, name), 'utf8') })));
    const result = await applyMigrations(await db(id), migrations, found.lang);
    say(result, () => [...result.applied.map((name) => `applied ${name}`), `${result.skipped.length} already applied.`].join('\n'));
    return;
  }
  if (sub === 'snapshots') {
    const [id] = rest;
    if (!id) throw new Error('Usage: zeiko db snapshots <db-id>');
    const answer = await (await api()).getDatabasesDbsIdSnapshots(id);
    const snaps: any[] = Array.isArray(answer?.snapshots) ? answer.snapshots : [];
    say(answer, () => [`schedule: ${answer?.schedule ?? '-'}`, ...snapshotLines(snaps)].join('\n'));
    return;
  }
  if (sub === 'snapshot' || sub === 'export') {
    const [id] = rest;
    if (!id) throw new Error(`Usage: zeiko db ${sub} <db-id>`);
    const z = await api();
    const answer = sub === 'snapshot' ? await z.postDatabasesDbsIdSnapshots(id, { body: {} }) : await z.postDatabasesDbsIdExport(id, { body: {} });
    say(answer, () => `${answer?.id ?? '-'}\t${answer?.state ?? '-'}\t(see it with: zeiko db snapshots ${id})`);
    return;
  }
  if (sub === 'restore') {
    const name = takeFlag(rest, '--name');
    const [id, snapshot] = rest;
    if (!id || !snapshot) throw new Error('Usage: zeiko db restore <db-id> <snapshot-id> [--name <new name>]');
    const answer = await (await api()).postDatabasesDbsIdRestore(id, { body: { snapshot, name: name ?? '' } });
    const made = answer?.database ?? {};
    say(answer, () => `${made.id ?? '-'}\t${made.state ?? '-'}\t${made.name ?? '-'}`);
    return;
  }
  if (sub === 'download') {
    const out = takeFlag(rest, '--out');
    const [id, archive] = rest;
    if (!id || !archive) throw new Error('Usage: zeiko db download <db-id> <archive-id> [--out <file>]');
    const answer = await (await api()).getDatabasesDbsIdExportsSidDownload(id, archive);
    const url = typeof answer?.url === 'string' ? answer.url : '';
    if (!/^https:\/\//.test(url)) throw new Error('The API gave no download link.');
    if (out === undefined) {
      say(answer, () => url);
      return;
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    say({ ...answer, file: out }, () => `Saved ${out}.`);
    return;
  }
  if (sub === 'extension') {
    const [id, name] = rest;
    if (!id || !name) throw new Error('Usage: zeiko db extension <db-id> <name>');
    const answer = await (await api()).postDatabasesDbsIdExtensions(id, { body: { name } });
    say(answer, () => `Switching on ${name} in ${id}.`);
    return;
  }
  if (sub === 'schedule') {
    const [project, schedule] = rest;
    if (!project || !schedule || !SCHEDULES.includes(schedule)) throw new Error(`Usage: zeiko db schedule <project-id> ${SCHEDULES.join('|')}`);
    const answer = await (await api()).postDatabasesProjectsIdSnapshots(project, { body: { schedule } });
    const paid = Number(answer?.chargedMicro) > 0 && answer?.chargedText ? ` ${answer.chargedText} was taken from your balance.` : '';
    say(answer, () => `Snapshot schedule: ${answer?.schedule ?? schedule}.${paid}`);
    return;
  }
  console.log(HELP);
  if (sub && sub !== 'help') process.exitCode = 2;
}

async function main(argv: string[]): Promise<void> {
  const asJson = argv.includes('--json');
  const args = argv.filter((x) => x !== '--json');
  const [a, b, c, ...rest] = args;
  const say: Say = (v, plain) => console.log(asJson ? JSON.stringify(v, null, 2) : plain());
  if (a === 'login' && b) {
    await mkdir(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    await writeFile(KEY_FILE, `${b}\n`, { mode: 0o600 });
    await chmod(KEY_FILE, 0o600);
    console.log(`Saved in ${KEY_FILE}.`);
    return;
  }
  if (a === 'api' && b && c) {
    const z = new Zeiko({ apiKey: await key(), baseUrl: process.env.ZEIKO_API_URL });
    const out = await z.request(b.toUpperCase(), c, rest[0] ? { body: JSON.parse(rest[0]) } : {});
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (a === 'vps' && b === 'ls') {
    const z = new Zeiko({ apiKey: await key(), baseUrl: process.env.ZEIKO_API_URL });
    const out = await z.getVps();
    say(out, () => vpsLines(out.services || []).join('\n') || 'No servers yet.');
    return;
  }
  if (a === 'vps' && b && ['start', 'stop', 'reboot'].includes(b) && c) {
    const z = new Zeiko({ apiKey: await key(), baseUrl: process.env.ZEIKO_API_URL });
    const out = await z.postVpsIdRequest(c, { body: { kind: b } });
    say(out, () => `Asked: ${b}. Request ${out.request.id} is ${out.request.status}; our team answers it.`);
    return;
  }
  if (a === 'payment' && b) {
    const z = new Zeiko({ apiKey: await key(), baseUrl: process.env.ZEIKO_API_URL });
    const out = await z.getPaymentsPayQris(b);
    say(out, () => `${out.status}${out.rupiahText ? ` ${out.rupiahText}` : ''}`);
    return;
  }
  if (a === 'db') {
    await dbCommand(args.slice(1), say);
    return;
  }
  console.log(HELP);
  if (a && a !== 'help' && a !== '--help') process.exitCode = 2;
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof ZeikoError) console.error(`${err.message} (${err.code}${err.requestId ? `, ${err.requestId}` : ''})`);
  else console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
