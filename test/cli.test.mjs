import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const cli = (args, env) => run(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, ...env } });

test('login keeps the key readable by its owner only', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zeiko-'));
  await cli(['login', 'zkc_abc'], { XDG_CONFIG_HOME: home });
  const file = join(home, 'zeiko', 'key');
  assert.equal((await readFile(file, 'utf8')).trim(), 'zkc_abc');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('without a key it says what to do', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zeiko-'));
  await assert.rejects(cli(['vps', 'ls'], { XDG_CONFIG_HOME: home, ZEIKO_API_KEY: '' }), (e) => /zeiko login/.test(e.stderr) && e.code === 1);
});

test('an unknown command prints help and fails', async () => {
  await assert.rejects(cli(['nope']), (e) => /zeiko vps ls/.test(e.stdout) && e.code === 2);
});

test('db commands need a key too', async () => {
  const home = await mkdtemp(join(tmpdir(), 'zeiko-'));
  await assert.rejects(cli(['db', 'list'], { XDG_CONFIG_HOME: home, ZEIKO_API_KEY: '' }), (e) => /zeiko login/.test(e.stderr) && e.code === 1);
});

test('db execute without SQL says how to call it', async () => {
  await assert.rejects(cli(['db', 'execute', 'db_x'], { ZEIKO_API_KEY: 'zkc_x' }), (e) => /Usage: zeiko db execute/.test(e.stderr) && e.code === 1);
});

test('an unknown db command prints the db help and fails', async () => {
  await assert.rejects(cli(['db', 'nope']), (e) => /zeiko db migrations apply/.test(e.stdout) && e.code === 2);
});

/** A stand-in for the API: answers each call with `answer(method, url, body)` and keeps what was asked. */
async function fakeApi(answer) {
  const asked = [];
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => {
      const body = text ? JSON.parse(text) : undefined;
      asked.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer(req.method, req.url, body)));
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { asked, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('db snapshots, snapshot, restore and schedule call the database routes', async () => {
  const api = await fakeApi((method, url) => {
    if (url.endsWith('/snapshots') && method === 'GET') {
      return { schedule: 'weekly', snapshots: [{ id: 'dbs_1', kind: 'snapshot', state: 'ready', bytes: 4096, createdAt: Date.UTC(2026, 10, 18, 12, 0) }] };
    }
    if (url.endsWith('/restore')) return { database: { id: 'db_new', state: 'creating', name: 'copy' }, restore: { id: 'dbs_2', state: 'queued' } };
    if (url.includes('/projects/')) return { schedule: 'daily', chargedMicro: 1_400_000, chargedText: '$1.40' };
    return { id: 'dbs_3', state: 'queued' };
  });
  const env = { ZEIKO_API_KEY: 'zkc_test', ZEIKO_API_URL: api.url };
  try {
    const list = await cli(['db', 'snapshots', 'db_a'], env);
    assert.match(list.stdout, /schedule: weekly/);
    assert.match(list.stdout, /dbs_1\tsnapshot\tready\t2026-11-18 12:00\t4096 B/);
    await cli(['db', 'snapshot', 'db_a'], env);
    await cli(['db', 'export', 'db_a'], env);
    const back = await cli(['db', 'restore', 'db_a', 'dbs_1', '--name', 'copy'], env);
    assert.match(back.stdout, /db_new\tcreating\tcopy/);
    await cli(['db', 'extension', 'db_a', 'vector'], env);
    const paid = await cli(['db', 'schedule', 'dbp_a', 'daily'], env);
    assert.match(paid.stdout, /daily\. \$1\.40 was taken from your balance\./);
    assert.deepEqual(
      api.asked.map((a) => `${a.method} ${a.url}`),
      [
        'GET /v1/databases/dbs/db_a/snapshots',
        'POST /v1/databases/dbs/db_a/snapshots',
        'POST /v1/databases/dbs/db_a/export',
        'POST /v1/databases/dbs/db_a/restore',
        'POST /v1/databases/dbs/db_a/extensions',
        'POST /v1/databases/projects/dbp_a/snapshots',
      ],
    );
    assert.deepEqual(api.asked[3].body, { snapshot: 'dbs_1', name: 'copy' });
    assert.deepEqual(api.asked[4].body, { name: 'vector' });
    assert.deepEqual(api.asked[5].body, { schedule: 'daily' });
    assert.ok(api.asked.every((a) => a.auth === 'Bearer zkc_test'));
  } finally {
    api.close();
  }
});

test('db schedule takes only the three schedules', async () => {
  await assert.rejects(cli(['db', 'schedule', 'dbp_a', 'monthly'], { ZEIKO_API_KEY: 'zkc_x' }), (e) => /weekly\|daily\|hourly/.test(e.stderr) && e.code === 1);
});

test('db download refuses a link that is not https', async () => {
  const api = await fakeApi(() => ({ url: 'http://plain.test/x', bytes: 1 }));
  try {
    await assert.rejects(cli(['db', 'download', 'db_a', 'dbs_1'], { ZEIKO_API_KEY: 'zkc_x', ZEIKO_API_URL: api.url }), (e) => /no download link/.test(e.stderr));
  } finally {
    api.close();
  }
});
