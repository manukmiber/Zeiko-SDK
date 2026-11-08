import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
