// The Zeiko DB client, and the helpers that let Drizzle use it. Talks to https://db.zeiko.biz.id with a key that
// starts zkc_ (the same key as the rest of the API). Nothing is retried here: a request that failed in transit may
// still have run, and the database API has no idempotency key to make a second try safe.

/** A binary value as fetch and TextDecoder take it under TypeScript 5.9. */
type Bytes = Uint8Array<ArrayBuffer>;

/** The languages a database speaks. Chosen when it is made. */
export type Lang = 'postgres' | 'mysql' | 'sqlite' | 'kv' | 'mongo';

/** One SQL statement. `params` bind `$1, $2...` (postgres) or `?` (mysql, sqlite). */
export interface Statement {
  sql: string;
  params?: unknown[];
}

/** The answer to one statement. `rows` are arrays of values, in the order of `columns`. */
export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** Rows the statement changed (insert, update, delete). */
  rowsAffected: number;
  lastInsertId?: number;
}

/** An interactive transaction, as opened. It is rolled back after `idleTimeoutMs` without a statement. */
export interface TxOpened {
  tx: string;
  idleTimeoutMs: number;
}

export interface KvListKey {
  name: string;
  /** Unix seconds when it expires, if it does. */
  expiration?: number;
}

export interface KvList {
  keys: KvListKey[];
  /** Pass back to read on. Absent when `complete`. */
  cursor?: string;
  complete: boolean;
}

/** One Redis argument. */
export type RedisArg = string | number;

export interface DatabaseOptions {
  /** A key starting `zkc_`. Keep it on your servers. */
  key: string;
  /** Defaults to https://db.zeiko.biz.id. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** A refusal from Zeiko DB. `code` is the one it gave, or `http_<status>` when it gave none. */
export class ZeikoDbError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** For a Mongo write error (`code` `mongo_write`): Mongo's own code, 11000 for a duplicate key. */
    readonly mongoCode?: number,
  ) {
    super(message);
    this.name = 'ZeikoDbError';
  }
}

/** A transaction, while `transaction` runs its work. */
export interface Transaction {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
}

/** A transaction opened with `begin()`: end it with `commit` or `rollback` (it is rolled back after 30 s unused). */
export interface OpenTransaction extends Transaction {
  readonly id: string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** A key-value database (`kv`). Keys may have `/` in them: each part is kept as its own address segment. */
export interface KvClient {
  /** The bytes under `key`, or null when there are none. */
  get(key: string): Promise<Uint8Array | null>;
  getText(key: string): Promise<string | null>;
  getJson<T = unknown>(key: string): Promise<T | null>;
  /** A string is stored as UTF-8, bytes as they are, anything else as JSON. `ttl` is in seconds. */
  put(key: string, value: string | Uint8Array | object, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KvList>;
}

/** Mongo's answer to a write: how many documents, and the per-document errors when some failed. */
export interface MongoWriteResult {
  ok: number;
  n?: number;
  nModified?: number;
  upserted?: { index: number; _id: unknown }[];
  writeErrors?: { index: number; code: number; errmsg: string }[];
  [field: string]: unknown;
}

/** A collection of a `mongo` database: the common calls, made from `db.mongo` commands. */
export interface MongoCollection {
  /** Every matching document (the whole cursor; page with `limit` and `skip`). */
  find<T = Record<string, unknown>>(filter?: object, options?: { sort?: object; projection?: object; limit?: number; skip?: number }): Promise<T[]>;
  findOne<T = Record<string, unknown>>(filter?: object, options?: { sort?: object; projection?: object }): Promise<T | null>;
  insertOne(doc: object): Promise<{ insertedCount: number }>;
  insertMany(docs: object[], options?: { ordered?: boolean }): Promise<{ insertedCount: number }>;
  updateOne(filter: object, update: object | object[], options?: { upsert?: boolean }): Promise<{ matchedCount: number; modifiedCount: number; upsertedId: unknown }>;
  updateMany(filter: object, update: object | object[], options?: { upsert?: boolean }): Promise<{ matchedCount: number; modifiedCount: number; upsertedId: unknown }>;
  deleteOne(filter: object): Promise<{ deletedCount: number }>;
  deleteMany(filter: object): Promise<{ deletedCount: number }>;
  aggregate<T = Record<string, unknown>>(pipeline: object[]): Promise<T[]>;
  countDocuments(filter?: object): Promise<number>;
}

/** A database, as `database()` gives it back. */
export interface Database {
  readonly id: string;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** Every statement in order. In one transaction unless `transaction` is false. */
  batch(statements: Statement[], options?: { transaction?: boolean }): Promise<QueryResult[]>;
  /** Commits when `work` returns, rolls back and rethrows when it throws. */
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Opens a transaction to run statements on one by one, for drivers that begin and end it themselves. */
  begin(): Promise<OpenTransaction>;
  readonly kv: KvClient;
  /** One Redis command, for example `redis('SET', 'a', '1')`. Gives back the reply. */
  redis(...command: RedisArg[]): Promise<unknown>;
  /** Several Redis commands in one request. A Redis error in one of them is `{ error: string }` in its place. */
  redisPipeline(commands: RedisArg[][]): Promise<unknown[]>;
  /**
   * One Mongo command on a `mongo` database, as `db.runCommand` takes it, in extended JSON, for example
   * `mongo({ find: 'users', filter: { age: { $gte: 18 } } })`. Gives back Mongo's reply in relaxed extended JSON;
   * a cursor is read to the end, so its id is always 0.
   */
  mongo<T = Record<string, unknown>>(command: Record<string, unknown>): Promise<T>;
  /** A collection of a `mongo` database. A write that Mongo answered with `writeErrors` throws (code `mongo_write`). */
  collection(name: string): MongoCollection;
}

type Payload = { json: unknown } | { bytes: Bytes };

interface Reply {
  ok: boolean;
  status: number;
  bytes: Bytes;
}

/** Makes a client for one database. Nothing is sent until a method is called. */
export function database(id: string, options: DatabaseOptions): Database {
  if (!id) throw new TypeError('id is required');
  if (!options?.key) throw new TypeError('key is required');
  const base = (options.baseUrl ?? 'https://db.zeiko.biz.id').replace(/\/+$/, '').replace(/\/v1$/, '');
  const root = `${base}/v1/${encodeURIComponent(id)}`;
  const fetcher = options.fetch ?? fetch;
  const authorization = `Bearer ${options.key}`;

  async function send(method: string, path: string, payload?: Payload, query?: URLSearchParams): Promise<Reply> {
    const headers: Record<string, string> = { authorization };
    let body: string | Bytes | undefined;
    if (payload !== undefined) {
      if ('json' in payload) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(payload.json);
      } else {
        headers['content-type'] = 'application/octet-stream';
        body = new Uint8Array(payload.bytes);
      }
    }
    const qs = query?.toString() ?? '';
    const res = await fetcher(`${root}${path}${qs ? `?${qs}` : ''}`, { method, headers, body });
    return { ok: res.ok, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
  }

  const accept = (reply: Reply): Bytes => {
    if (reply.ok) return reply.bytes;
    throw failure(reply);
  };

  async function json<T>(method: string, path: string, body?: unknown, query?: URLSearchParams): Promise<T> {
    const bytes = accept(await send(method, path, body === undefined ? undefined : { json: body }, query));
    return (bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : null) as T;
  }

  const run = (path: string, statement: Statement): Promise<QueryResult> =>
    json<QueryResult>('POST', path, { sql: statement.sql, params: statement.params ?? [] });

  const kvPath = (key: string): string => {
    const parts = key.split('/');
    // The URL parser would fold these into another address.
    if (parts.some((part) => part === '.' || part === '..')) throw new TypeError('A key cannot have "." or ".." parts.');
    return `/kv/${parts.map((part) => encodeURIComponent(part)).join('/')}`;
  };

  // A 404 is a key that is not there.
  const getBytes = async (key: string): Promise<Bytes | null> => {
    const reply = await send('GET', kvPath(key));
    if (reply.status === 404) return null;
    return accept(reply);
  };

  const getText = async (key: string): Promise<string | null> => {
    const bytes = await getBytes(key);
    return bytes === null ? null : new TextDecoder().decode(bytes);
  };

  const kv: KvClient = {
    get: getBytes,
    getText,
    async getJson<T = unknown>(key: string): Promise<T | null> {
      const text = await getText(key);
      return text === null ? null : (JSON.parse(text) as T);
    },
    async put(key, value, putOptions = {}) {
      const query = putOptions.ttl === undefined ? undefined : new URLSearchParams({ ttl: String(putOptions.ttl) });
      accept(await send('PUT', kvPath(key), { bytes: encodeValue(value) }, query));
    },
    async delete(key) {
      accept(await send('DELETE', kvPath(key)));
    },
    list(listOptions = {}) {
      const query = new URLSearchParams();
      if (listOptions.prefix !== undefined) query.set('prefix', listOptions.prefix);
      if (listOptions.cursor !== undefined) query.set('cursor', listOptions.cursor);
      if (listOptions.limit !== undefined) query.set('limit', String(listOptions.limit));
      return json<KvList>('GET', '/kv', undefined, query);
    },
  };

  return {
    id,
    query: (sql, params = []) => json<QueryResult>('POST', '/query', { sql, params }),
    async batch(statements, batchOptions = {}) {
      const body = {
        statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
        transaction: batchOptions.transaction ?? true,
      };
      return (await json<{ results: QueryResult[] }>('POST', '/batch', body)).results;
    },
    async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
      const tx = await begin();
      try {
        const result = await work(tx);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback().catch(() => undefined);
        throw err;
      }
    },
    begin,
    kv,
    redis: async (...command) => (await json<{ result: unknown }>('POST', '/redis', command)).result,
    redisPipeline: async (commands) => (await json<{ results: unknown[] }>('POST', '/redis', commands)).results,
    mongo,
    collection: (name) => collection(mongo, name),
  };

  async function begin(): Promise<OpenTransaction> {
    const opened = await json<TxOpened>('POST', '/tx');
    const at = `/tx/${encodeURIComponent(opened.tx)}`;
    return {
      id: opened.tx,
      query: (sql, params = []) => run(`${at}/query`, { sql, params }),
      commit: async () => void (await json('POST', `${at}/commit`)),
      rollback: async () => void (await json('POST', `${at}/rollback`)),
    };
  }

  function mongo<T = Record<string, unknown>>(command: Record<string, unknown>): Promise<T> {
    return json<T>('POST', '/mongo', command);
  }
}

type MongoRun = <T = Record<string, unknown>>(command: Record<string, unknown>) => Promise<T>;

function written(reply: MongoWriteResult): MongoWriteResult {
  const first = reply.writeErrors?.[0];
  if (first) throw new ZeikoDbError(first.errmsg, 200, 'mongo_write', first.code);
  return reply;
}

function collection(mongo: MongoRun, name: string): MongoCollection {
  const docs = async <T>(command: Record<string, unknown>): Promise<T[]> =>
    (await mongo<{ cursor: { firstBatch: T[] } }>(command)).cursor.firstBatch;
  const update = async (filter: object, change: object | object[], upsert: boolean | undefined, multi: boolean) => {
    const reply = written(await mongo<MongoWriteResult>({ update: name, updates: [{ q: filter, u: change, upsert: upsert ?? false, multi }] }));
    return { matchedCount: reply.n ?? 0, modifiedCount: reply.nModified ?? 0, upsertedId: reply.upserted?.[0]?._id ?? null };
  };
  const remove = async (filter: object, limit: number) =>
    ({ deletedCount: written(await mongo<MongoWriteResult>({ delete: name, deletes: [{ q: filter, limit }] })).n ?? 0 });
  const insert = async (documents: object[], ordered = true) =>
    ({ insertedCount: written(await mongo<MongoWriteResult>({ insert: name, documents, ordered })).n ?? 0 });
  return {
    find: (filter = {}, options = {}) => docs({ find: name, filter, ...options }),
    async findOne(filter = {}, options = {}) {
      const [first] = await docs<any>({ find: name, filter, ...options, limit: 1, singleBatch: true });
      return first ?? null;
    },
    insertOne: (doc) => insert([doc]),
    insertMany: (list, options = {}) => insert(list, options.ordered ?? true),
    updateOne: (filter, change, options = {}) => update(filter, change, options.upsert, false),
    updateMany: (filter, change, options = {}) => update(filter, change, options.upsert, true),
    deleteOne: (filter) => remove(filter, 1),
    deleteMany: (filter) => remove(filter, 0),
    aggregate: (pipeline) => docs({ aggregate: name, pipeline, cursor: {} }),
    async countDocuments(filter = {}) {
      return (await mongo<{ n: number }>({ count: name, query: filter })).n;
    },
  };
}

function encodeValue(value: string | Uint8Array | object): Bytes {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
}

function failure(reply: Reply): ZeikoDbError {
  let error: { code?: unknown; message?: unknown } = {};
  try {
    const parsed = JSON.parse(new TextDecoder().decode(reply.bytes)) as { error?: { code?: unknown; message?: unknown } } | null;
    error = parsed?.error ?? {};
  } catch {
    error = {};
  }
  const code = typeof error.code === 'string' && error.code ? error.code : `http_${reply.status}`;
  const message = typeof error.message === 'string' && error.message ? error.message : `The database answered ${reply.status}.`;
  return new ZeikoDbError(message, reply.status, code);
}

/** What Drizzle's proxy drivers call back with. */
export type DrizzleProxyMethod = 'all' | 'execute' | 'get' | 'values' | 'run';

/** The callback for `pg-proxy` and `mysql-proxy`: rows as arrays of values. */
export type RowsProxy = (sql: string, params: unknown[], method: DrizzleProxyMethod) => Promise<{ rows: unknown[][] }>;

/**
 * The callback for `sqlite-proxy`: rows as arrays of values. For `get` it is one row, or undefined when there is
 * none, which is what Drizzle expects.
 */
export type SqliteProxy = (sql: string, params: unknown[], method: DrizzleProxyMethod) => Promise<{ rows: any }>;

/**
 * For Drizzle's `pg-proxy` driver, on a postgres database:
 *
 *   import { drizzle } from 'drizzle-orm/pg-proxy';
 *   const orm = drizzle(pgProxy(db));
 */
export function pgProxy(db: Pick<Database, 'query'>): RowsProxy {
  return async (sql, params) => ({ rows: (await db.query(sql, params)).rows });
}

/**
 * For Drizzle's `mysql-proxy` driver, on a mysql database:
 *
 *   import { drizzle } from 'drizzle-orm/mysql-proxy';
 *   const orm = drizzle(mysqlProxy(db));
 */
export function mysqlProxy(db: Pick<Database, 'query'>): RowsProxy {
  return async (sql, params) => ({ rows: (await db.query(sql, params)).rows });
}

/**
 * For Drizzle's `sqlite-proxy` driver, on a sqlite database:
 *
 *   import { drizzle } from 'drizzle-orm/sqlite-proxy';
 *   const orm = drizzle(sqliteProxy(db));
 */
export function sqliteProxy(db: Pick<Database, 'query'>): SqliteProxy {
  return async (sql, params, method) => {
    const { rows } = await db.query(sql, params);
    return { rows: method === 'get' ? rows[0] : rows };
  };
}

/** What Kysely hands a driver to run: the SQL its dialect compiled, and the parameters. */
export interface KyselyCompiledQuery {
  readonly sql: string;
  readonly parameters: ReadonlyArray<unknown>;
}

/** Kysely's result shape: rows as objects, counts as bigint. */
export interface KyselyQueryResult<R> {
  readonly rows: R[];
  readonly numAffectedRows?: bigint;
  readonly insertId?: bigint;
}

/** One Kysely connection: plain requests, or the statements of the transaction it has open. */
export interface KyselyConnection {
  executeQuery<R>(query: KyselyCompiledQuery): Promise<KyselyQueryResult<R>>;
  streamQuery<R>(query: KyselyCompiledQuery, chunkSize?: number): AsyncIterableIterator<KyselyQueryResult<R>>;
}

/** Kysely's `Driver`, for a dialect made of Kysely's own adapter, compiler and introspector. */
export interface KyselyDriver {
  init(): Promise<void>;
  acquireConnection(): Promise<KyselyConnection>;
  beginTransaction(connection: KyselyConnection, settings: { isolationLevel?: string }): Promise<void>;
  commitTransaction(connection: KyselyConnection): Promise<void>;
  rollbackTransaction(connection: KyselyConnection): Promise<void>;
  releaseConnection(connection: KyselyConnection): Promise<void>;
  destroy(): Promise<void>;
}

/** Rows as objects keyed by column name, the way Kysely (and most drivers) give them. */
export function rowObjects(result: Pick<QueryResult, 'columns' | 'rows'>): Record<string, unknown>[] {
  return result.rows.map((row) => {
    const out: Record<string, unknown> = {};
    result.columns.forEach((name, i) => {
      out[name] = row[i];
    });
    return out;
  });
}

/**
 * A Kysely driver for a `postgres`, `mysql` or `sqlite` database. Pair it with Kysely's classes for the language:
 *
 *   import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
 *   const orm = new Kysely<DB>({ dialect: {
 *     createAdapter: () => new PostgresAdapter(),
 *     createDriver: () => kyselyDriver(db),
 *     createIntrospector: (k) => new PostgresIntrospector(k),
 *     createQueryCompiler: () => new PostgresQueryCompiler(),
 *   } });
 *
 * (MysqlAdapter/MysqlIntrospector/MysqlQueryCompiler and the Sqlite ones the same way.) `orm.transaction()` runs on
 * one transaction of the database. An isolation level is refused: the database's own is used, never another one.
 */
export function kyselyDriver(db: Pick<Database, 'query' | 'begin'>): KyselyDriver {
  type Conn = KyselyConnection & { tx: OpenTransaction | null };
  const answer = <R>(result: QueryResult): KyselyQueryResult<R> => ({
    rows: rowObjects(result) as R[],
    numAffectedRows: BigInt(result.rowsAffected ?? 0),
    ...(result.lastInsertId === undefined || result.lastInsertId === null ? {} : { insertId: BigInt(result.lastInsertId) }),
  });
  const connection = (): Conn => {
    const conn: Conn = {
      tx: null,
      async executeQuery<R>(query: KyselyCompiledQuery) {
        const params = [...query.parameters];
        const result = conn.tx ? await conn.tx.query(query.sql, params) : await db.query(query.sql, params);
        return answer<R>(result);
      },
      async *streamQuery<R>(query: KyselyCompiledQuery) {
        // The whole answer comes in one response, so it is one chunk.
        yield await conn.executeQuery<R>(query);
      },
    };
    return conn;
  };
  const open = (c: KyselyConnection): Conn => c as Conn;
  return {
    async init() {},
    async acquireConnection() {
      return connection();
    },
    async beginTransaction(c, settings) {
      if (settings?.isolationLevel) {
        throw new ZeikoDbError(`Isolation level "${settings.isolationLevel}" cannot be chosen on Zeiko DB; leave it out to use the database's own.`, 400, 'unsupported');
      }
      open(c).tx = await db.begin();
    },
    async commitTransaction(c) {
      const tx = open(c).tx;
      open(c).tx = null;
      await tx?.commit();
    },
    async rollbackTransaction(c) {
      const tx = open(c).tx;
      open(c).tx = null;
      await tx?.rollback();
    },
    async releaseConnection() {},
    async destroy() {},
  };
}
