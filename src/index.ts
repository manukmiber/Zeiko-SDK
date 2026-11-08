import { randomUUID } from 'node:crypto';
import { type CallOptions, Operations } from './operations.js';

export type { CallOptions } from './operations.js';

/** What the API refused, in its own words. */
export class ZeikoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Quote this when asking us about a call. */
    readonly requestId: string,
  ) {
    super(message);
    this.name = 'ZeikoError';
  }
}

export interface ZeikoOptions {
  /** A key starting `zkc_`. Keep it on your servers. */
  apiKey: string;
  baseUrl?: string;
  /** Tries after the first, for 429, 5xx and a broken connection. Default 3. */
  retries?: number;
  fetch?: typeof fetch;
  /** How to wait. Tests replace it. */
  sleep?: (ms: number) => Promise<void>;
}

export interface WaitOptions {
  everyMs?: number;
  timeoutMs?: number;
}

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LONGEST_WAIT_MS = 60_000;

export class Zeiko extends Operations {
  readonly #key: string;
  readonly #base: string;
  readonly #retries: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: ZeikoOptions) {
    super();
    if (!options.apiKey) throw new TypeError('apiKey is required');
    this.#key = options.apiKey;
    this.#base = (options.baseUrl ?? 'https://api.zeiko.biz.id').replace(/\/+$/, '').replace(/\/v1$/, '');
    this.#retries = options.retries ?? 3;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  }

  async request(method: string, path: string, options: CallOptions = {}): Promise<any> {
    const url = new URL(this.#base + path);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { authorization: `Bearer ${this.#key}` };
    // The same key on every try, so a retry can never do it twice.
    if (WRITES.has(method)) headers['idempotency-key'] = options.idempotencyKey ?? randomUUID();
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await this.#fetch(url, { method, headers, body });
      } catch (err) {
        if (attempt >= this.#retries) throw err;
        await this.#sleep(backoff(attempt));
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.#retries) {
        await this.#sleep(waitOf(res, attempt));
        continue;
      }
      return read(res);
    }
  }

  /** Waits until a VPS request is answered, and gives it back. */
  async waitForRequest(vpsId: string, requestId: string, options: WaitOptions = {}): Promise<any> {
    return this.#until(options, 15_000, async () => {
      const { services = [] } = await this.request('GET', '/v1/vps');
      const vps = services.find((s: any) => s.id === vpsId);
      const asked = vps?.requests?.find((r: any) => r.id === requestId);
      if (!asked) throw new ZeikoError('That request was not found.', 404, 'no_request', '');
      return asked.status === 'open' ? null : asked;
    });
  }

  /** Waits until a QRIS payment is no longer waiting, and gives it back. */
  async waitForPayment(paymentId: string, options: WaitOptions = {}): Promise<any> {
    return this.#until(options, 10_000, async () => {
      const p = await this.request('GET', `/v1/payments/${encodeURIComponent(paymentId)}/qris`);
      return p.status === 'waiting' || p.status === 'confirming' ? null : p;
    });
  }

  async #until(options: WaitOptions, every: number, look: () => Promise<any>): Promise<any> {
    const end = Date.now() + (options.timeoutMs ?? 3_600_000);
    for (;;) {
      const found = await look();
      if (found) return found;
      if (Date.now() >= end) throw new Error('Still waiting when the time ran out.');
      await this.#sleep(options.everyMs ?? every);
    }
  }
}

const backoff = (attempt: number) => Math.min(500 * 2 ** attempt, LONGEST_WAIT_MS);

function waitOf(res: Response, attempt: number): number {
  const seconds = Number(res.headers.get('retry-after'));
  return seconds > 0 ? Math.min(seconds * 1000, LONGEST_WAIT_MS) : backoff(attempt);
}

async function read(res: Response): Promise<any> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.ok) return data;
  const e = data?.error ?? {};
  throw new ZeikoError(e.message || `The API answered ${res.status}.`, res.status, e.code || 'unknown', res.headers.get('x-request-id') || '');
}
