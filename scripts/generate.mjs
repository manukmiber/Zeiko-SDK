// Writes src/operations.ts from the API's own document:
//   node scripts/generate.mjs [path or address of openapi.json]
import { readFile, writeFile } from 'node:fs/promises';

const from = process.argv[2] || 'https://api.zeiko.biz.id/v1/openapi.json';
const text = /^https?:/.test(from) ? await (await fetch(from)).text() : await readFile(from, 'utf8');
const doc = JSON.parse(text);

const camel = (s) => s.replace(/[_-]+([a-z0-9])/g, (_, c) => c.toUpperCase());
const argOf = (p) => camel(p);
const lines = [];
for (const [path, methods] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (!op || !op.operationId || path === '/v1/openapi.json') continue;
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => argOf(m[1]));
    const url = path.replace(/\{(\w+)\}/g, (_, p) => `\${encodeURIComponent(${argOf(p)})}`);
    const args = [...params.map((p) => `${p}: string`), 'options?: CallOptions'].join(', ');
    lines.push(`  /** ${String(op.summary || '').replace(/\*\//g, '')} */`);
    lines.push(`  ${camel(op.operationId)}(${args}): Promise<any> {`);
    lines.push(`    return this.request('${method.toUpperCase()}', \`${url}\`, options);`);
    lines.push('  }');
    lines.push('');
  }
}
await writeFile('src/operations.ts', `// Made by scripts/generate.mjs. Do not edit by hand.

export interface CallOptions {
  /** Added to the address. */
  query?: Record<string, string | number | boolean>;
  /** Sent as JSON. */
  body?: unknown;
  /** Same key and body within a day: done once. Made for you when left out. */
  idempotencyKey?: string;
}

export abstract class Operations {
  abstract request(method: string, path: string, options?: CallOptions): Promise<any>;

${lines.join('\n').trimEnd()}
}
`);

// The same calls for Python.
const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const pyLines = [];
for (const [path, methods] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (!op || !op.operationId || path === '/v1/openapi.json') continue;
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => snake(m[1]));
    const url = path.replace(/\{(\w+)\}/g, (_, p) => `{_q(${snake(p)})}`);
    pyLines.push(`    def ${snake(op.operationId)}(self${params.map((p) => `, ${p}: str`).join('')}, **options: Any) -> Any:`);
    pyLines.push(`        """${String(op.summary || '').replace(/"""/g, '')}"""`);
    pyLines.push(`        return self.request("${method.toUpperCase()}", f"${url}", **options)`);
    pyLines.push('');
  }
}
await writeFile('python/zeiko/_operations.py', `# Made by scripts/generate.mjs. Do not edit by hand.
from typing import Any
from urllib.parse import quote


def _q(value: str) -> str:
    return quote(str(value), safe="")


class Operations:
    def request(self, method: str, path: str, **options: Any) -> Any:
        raise NotImplementedError

${pyLines.join('\n').trimEnd()}
`);
console.log(`src/operations.ts: ${lines.filter((l) => l.includes('Promise<any> {')).length} calls`);
