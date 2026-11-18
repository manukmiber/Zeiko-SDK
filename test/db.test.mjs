import test from 'node:test';
import assert from 'node:assert/strict';
import { database, ZeikoDbError, pgProxy, mysqlProxy, sqliteProxy, kyselyDriver, rowObjects } from '../dist/index.js';

const BASE = 'https://db.example.test';
const ID = 'db_test';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const empty = (status) => new Response(null, { status });

function fake(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, fetch };
}

function db(answers) {
  const f = fake(answers);
  return { db: database(ID, { key: 'zkc_test', baseUrl: `${BASE}/`, fetch: f.fetch }), calls: f.calls };
}

test('a database needs an id and a key', () => {
  assert.throws(() => database('', { key: 'zkc_x' }), TypeError);
  assert.throws(() => database(ID, { key: '' }), TypeError);
});

test('the default address is db.zeiko.biz.id', async () => {
  const f = fake([json(200, { columns: [], rows: [], rowsAffected: 0 })]);
  await database(ID, { key: 'zkc_x', fetch: f.fetch }).query('select 1');
  assert.equal(f.calls[0].url, `https://db.zeiko.biz.id/v1/${ID}/query`);
});

test('a query posts its SQL and parameters with the key', async () => {
  const { db: d, calls } = db([json(200, { columns: ['n'], rows: [[1]], rowsAffected: 0 })]);
  const result = await d.query('select $1 as n', [1]);
  assert.deepEqual(result.rows, [[1]]);
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/query`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.authorization, 'Bearer zkc_test');
  assert.equal(calls[0].headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { sql: 'select $1 as n', params: [1] });
});

test('a batch is one transaction unless told otherwise', async () => {
  const one = { columns: [], rows: [], rowsAffected: 1 };
  const { db: d, calls } = db([json(200, { results: [one, one] }), json(200, { results: [one] })]);
  const results = await d.batch([{ sql: 'insert into t values ($1)', params: [1] }, { sql: 'delete from t' }]);
  assert.equal(results.length, 2);
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/batch`);
  assert.deepEqual(JSON.parse(calls[0].body), {
    statements: [{ sql: 'insert into t values ($1)', params: [1] }, { sql: 'delete from t', params: [] }],
    transaction: true,
  });
  await d.batch([{ sql: 'select 1' }], { transaction: false });
  assert.equal(JSON.parse(calls[1].body).transaction, false);
});

test('a transaction commits when its work returns', async () => {
  const { db: d, calls } = db([
    json(200, { tx: 'tx_1', idleTimeoutMs: 30000 }),
    json(200, { columns: [], rows: [], rowsAffected: 1 }),
    json(200, {}),
  ]);
  const out = await d.transaction(async (tx) => {
    await tx.query('insert into t values ($1)', [7]);
    return 'done';
  });
  assert.equal(out, 'done');
  assert.deepEqual(
    calls.map((c) => c.url),
    [`${BASE}/v1/${ID}/tx`, `${BASE}/v1/${ID}/tx/tx_1/query`, `${BASE}/v1/${ID}/tx/tx_1/commit`],
  );
  assert.deepEqual(JSON.parse(calls[1].body), { sql: 'insert into t values ($1)', params: [7] });
});

test('a transaction rolls back and rethrows when its work throws', async () => {
  const { db: d, calls } = db([json(200, { tx: 'tx_2', idleTimeoutMs: 30000 }), json(200, {})]);
  await assert.rejects(
    d.transaction(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.deepEqual(calls.map((c) => c.url), [`${BASE}/v1/${ID}/tx`, `${BASE}/v1/${ID}/tx/tx_2/rollback`]);
});

test('a refusal becomes a ZeikoDbError with its code', async () => {
  const { db: d } = db([json(422, { error: { code: 'unsupported', message: 'Use LIMIT instead.' } })]);
  await assert.rejects(
    d.query('select top 1 * from t'),
    (e) => e instanceof ZeikoDbError && e.status === 422 && e.code === 'unsupported' && e.message === 'Use LIMIT instead.',
  );
});

test('a refusal without a code gets one from its status', async () => {
  const { db: d } = db([new Response('<html>', { status: 502 })]);
  await assert.rejects(d.query('select 1'), (e) => e instanceof ZeikoDbError && e.code === 'http_502' && e.status === 502);
});

test('a missing key reads as null', async () => {
  const { db: d, calls } = db([empty(404), empty(404)]);
  assert.equal(await d.kv.get('nope'), null);
  assert.equal(await d.kv.getJson('nope'), null);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/kv/nope`);
});

test('kv reads bytes, text and JSON', async () => {
  const { db: d } = db([new Response(new Uint8Array([1, 2, 3])), new Response('hi'), new Response('{"a":1}')]);
  assert.deepEqual(await d.kv.get('b'), new Uint8Array([1, 2, 3]));
  assert.equal(await d.kv.getText('t'), 'hi');
  assert.deepEqual(await d.kv.getJson('j'), { a: 1 });
});

test('kv put sends the value as raw bytes, with its ttl', async () => {
  const { db: d, calls } = db([empty(204), empty(204)]);
  await d.kv.put('a/b c', 'héllo', { ttl: 60 });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/kv/a/b%20c?ttl=60`);
  assert.equal(calls[0].headers['content-type'], 'application/octet-stream');
  assert.equal(new TextDecoder().decode(calls[0].body), 'héllo');
  assert.equal(calls[0].body.byteLength, 6);
  await d.kv.put('o', { n: 1 });
  assert.equal(calls[1].url, `${BASE}/v1/${ID}/kv/o`);
  assert.equal(new TextDecoder().decode(calls[1].body), '{"n":1}');
});

test('kv keys keep their slashes and encode each part', async () => {
  const { db: d, calls } = db([empty(204)]);
  await d.kv.delete('user/a b/c%d?x#y');
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/kv/user/a%20b/c%25d%3Fx%23y`);
});

test('kv keys with dot parts are refused before anything is sent', async () => {
  const { db: d, calls } = db([]);
  await assert.rejects(d.kv.get('a/../b'), TypeError);
  assert.equal(calls.length, 0);
});

test('kv list sends prefix, cursor and limit', async () => {
  const { db: d, calls } = db([json(200, { keys: [{ name: 'user/1' }], complete: true })]);
  const list = await d.kv.list({ prefix: 'user/', cursor: 'c1', limit: 50 });
  assert.equal(list.keys[0].name, 'user/1');
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, `/v1/${ID}/kv`);
  assert.equal(url.searchParams.get('prefix'), 'user/');
  assert.equal(url.searchParams.get('cursor'), 'c1');
  assert.equal(url.searchParams.get('limit'), '50');
});

test('redis sends one command, and a pipeline sends each one', async () => {
  const { db: d, calls } = db([json(200, { result: 'OK' }), json(200, { results: ['OK', { error: 'WRONGTYPE' }] })]);
  assert.equal(await d.redis('SET', 'a', 1), 'OK');
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/redis`);
  assert.deepEqual(JSON.parse(calls[0].body), ['SET', 'a', 1]);
  assert.deepEqual(await d.redisPipeline([['SET', 'a', 'v'], ['LPUSH', 'a', 'x']]), ['OK', { error: 'WRONGTYPE' }]);
  assert.deepEqual(JSON.parse(calls[1].body), [['SET', 'a', 'v'], ['LPUSH', 'a', 'x']]);
});

test('the pg and mysql proxies give rows as arrays of values', async () => {
  const answer = { columns: ['id', 'name'], rows: [[1, 'a'], [2, 'b']], rowsAffected: 0 };
  const { db: d, calls } = db([json(200, answer), json(200, answer)]);
  assert.deepEqual(await pgProxy(d)('select id, name from t where id > $1', [0], 'all'), { rows: [[1, 'a'], [2, 'b']] });
  assert.deepEqual(await mysqlProxy(d)('select id, name from t where id > ?', [0], 'all'), { rows: [[1, 'a'], [2, 'b']] });
  assert.deepEqual(JSON.parse(calls[1].body), { sql: 'select id, name from t where id > ?', params: [0] });
});

test('the sqlite proxy gives one row for get, and all rows otherwise', async () => {
  const answer = { columns: ['id'], rows: [[1], [2]], rowsAffected: 0 };
  const { db: d } = db([json(200, answer), json(200, answer), json(200, { columns: ['id'], rows: [], rowsAffected: 0 })]);
  const proxy = sqliteProxy(d);
  assert.deepEqual(await proxy('select id from t', [], 'all'), { rows: [[1], [2]] });
  assert.deepEqual(await proxy('select id from t', [], 'get'), { rows: [1] });
  assert.equal((await proxy('select id from t where 0', [], 'get')).rows, undefined);
});

test('a mongo command posts the command document as it is', async () => {
  const { db: d, calls } = db([json(200, { cursor: { id: 0, ns: 'db_test.users', firstBatch: [{ _id: 1 }] }, ok: 1 })]);
  const reply = await d.mongo({ find: 'users', filter: { age: { $gte: 18 } }, sort: { b: 1, a: -1 } });
  assert.deepEqual(reply.cursor.firstBatch, [{ _id: 1 }]);
  assert.equal(calls[0].url, `${BASE}/v1/${ID}/mongo`);
  assert.equal(calls[0].method, 'POST');
  // The command name stays first and the sort keeps its order.
  assert.equal(calls[0].body, '{"find":"users","filter":{"age":{"$gte":18}},"sort":{"b":1,"a":-1}}');
});

test('a collection makes the usual calls from commands', async () => {
  const { db: d, calls } = db([
    json(200, { n: 2, ok: 1 }),
    json(200, { cursor: { id: 0, ns: 'db_test.users', firstBatch: [{ _id: 1, name: 'Ana' }] }, ok: 1 }),
    json(200, { cursor: { id: 0, ns: 'db_test.users', firstBatch: [] }, ok: 1 }),
    json(200, { n: 1, nModified: 1, ok: 1 }),
    json(200, { n: 3, ok: 1 }),
    json(200, { n: 1, ok: 1 }),
    json(200, { cursor: { id: 0, ns: 'db_test.users', firstBatch: [{ _id: null, n: 2 }] }, ok: 1 }),
  ]);
  const users = d.collection('users');
  assert.deepEqual(await users.insertMany([{ name: 'Ana' }, { name: 'Budi' }]), { insertedCount: 2 });
  assert.deepEqual(await users.find({ name: 'Ana' }, { limit: 5 }), [{ _id: 1, name: 'Ana' }]);
  assert.equal(await users.findOne({ name: 'Nobody' }), null);
  assert.deepEqual(await users.updateOne({ _id: 1 }, { $set: { age: 30 } }), { matchedCount: 1, modifiedCount: 1, upsertedId: null });
  assert.equal(await users.countDocuments({}), 3);
  assert.deepEqual(await users.deleteOne({ _id: 1 }), { deletedCount: 1 });
  assert.deepEqual(await users.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]), [{ _id: null, n: 2 }]);
  const sent = calls.map((c) => JSON.parse(c.body));
  assert.deepEqual(sent[0], { insert: 'users', documents: [{ name: 'Ana' }, { name: 'Budi' }], ordered: true });
  assert.deepEqual(sent[2], { find: 'users', filter: { name: 'Nobody' }, limit: 1, singleBatch: true });
  assert.deepEqual(sent[3], { update: 'users', updates: [{ q: { _id: 1 }, u: { $set: { age: 30 } }, upsert: false, multi: false }] });
  assert.deepEqual(sent[5], { delete: 'users', deletes: [{ q: { _id: 1 }, limit: 1 }] });
});

test('a mongo write error throws with mongo\'s code', async () => {
  const { db: d } = db([json(200, { n: 0, ok: 1, writeErrors: [{ index: 0, code: 11000, errmsg: 'E11000 duplicate key error' }] })]);
  await assert.rejects(d.collection('users').insertOne({ name: 'Ana' }), (e) => {
    assert.ok(e instanceof ZeikoDbError);
    assert.equal(e.code, 'mongo_write');
    assert.equal(e.mongoCode, 11000);
    return true;
  });
});

test('rows become objects keyed by column', () => {
  assert.deepEqual(rowObjects({ columns: ['id', 'name'], rows: [[1, 'Ana'], [2, 'Budi']] }), [
    { id: 1, name: 'Ana' },
    { id: 2, name: 'Budi' },
  ]);
});

test('the Kysely driver runs plain queries and a transaction on its own tx', async () => {
  const { db: d, calls } = db([
    json(200, { columns: ['id', 'name'], rows: [[1, 'Ana']], rowsAffected: 0 }),
    json(200, { tx: 'tx_1', idleTimeoutMs: 30000 }),
    json(200, { columns: [], rows: [], rowsAffected: 1, lastInsertId: 7 }),
    json(200, {}),
  ]);
  const driver = kyselyDriver(d);
  await driver.init();
  const conn = await driver.acquireConnection();
  const picked = await conn.executeQuery({ sql: 'select id, name from users where id = $1', parameters: [1] });
  assert.deepEqual(picked.rows, [{ id: 1, name: 'Ana' }]);
  assert.equal(picked.numAffectedRows, 0n);
  await driver.beginTransaction(conn, {});
  const inserted = await conn.executeQuery({ sql: 'insert into users (name) values (?)', parameters: ['Budi'] });
  assert.equal(inserted.numAffectedRows, 1n);
  assert.equal(inserted.insertId, 7n);
  await driver.commitTransaction(conn);
  await driver.releaseConnection(conn);
  assert.deepEqual(calls.map((c) => c.url.slice(`${BASE}/v1/${ID}`.length)), ['/query', '/tx', '/tx/tx_1/query', '/tx/tx_1/commit']);
  assert.deepEqual(JSON.parse(calls[2].body), { sql: 'insert into users (name) values (?)', params: ['Budi'] });
});

test('the Kysely driver refuses an isolation level instead of ignoring it', async () => {
  const { db: d, calls } = db([]);
  const driver = kyselyDriver(d);
  const conn = await driver.acquireConnection();
  await assert.rejects(driver.beginTransaction(conn, { isolationLevel: 'serializable' }), (e) => e instanceof ZeikoDbError && e.code === 'unsupported');
  assert.equal(calls.length, 0);
});
