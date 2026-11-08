#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Zeiko, ZeikoError } from './index.js';

const KEY_FILE = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'zeiko', 'key');

const HELP = `zeiko login <key>        save your API key
zeiko vps ls             your servers
zeiko vps start|stop|reboot <id>
zeiko payment <id>       a QRIS payment and where it stands
zeiko api <METHOD> <path> [json body]
Add --json to print what the API answered.`;

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

async function main(argv: string[]): Promise<void> {
  const asJson = argv.includes('--json');
  const [a, b, c, ...rest] = argv.filter((x) => x !== '--json');
  const say = (v: unknown, plain: () => string) => console.log(asJson ? JSON.stringify(v, null, 2) : plain());
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
  console.log(HELP);
  if (a && a !== 'help' && a !== '--help') process.exitCode = 2;
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof ZeikoError) console.error(`${err.message} (${err.code}${err.requestId ? `, ${err.requestId}` : ''})`);
  else console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
