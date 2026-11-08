import test from 'node:test';
import assert from 'node:assert/strict';
import { Zeiko, ZeikoError } from '../dist/index.js';

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

function client(answers) {
  const calls = [];
  const slept = [];
  const z = new Zeiko({
    apiKey: 'zkc_test',
    baseUrl: 'https://api.example.test/v1/',
    sleep: async (ms) => { slept.push(ms); },
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...init });
      const a = answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  });
  return { z, calls, slept };
}

test('a call carries the key and the address', async () => {
  const { z, calls } = client([json(200, { services: [] })]);
  assert.deepEqual(await z.request('GET', '/v1/vps', { query: { limit: 5 } }), { services: [] });
  assert.equal(calls[0].url, 'https://api.example.test/v1/vps?limit=5');
  assert.equal(calls[0].headers.authorization, 'Bearer zkc_test');
  assert.equal(calls[0].headers['idempotency-key'], undefined);
});

test('a retried write keeps one idempotency key', async () => {
  const { z, calls } = client([json(503, {}), new Error('broken'), json(200, { ok: true })]);
  await z.request('POST', '/v1/vps/order', { body: { plan: 'a' } });
  assert.equal(calls.length, 3);
  assert.ok(calls[0].headers['idempotency-key']);
  assert.equal(calls[2].headers['idempotency-key'], calls[0].headers['idempotency-key']);
});

test('Retry-After is obeyed', async () => {
  const { z, slept } = client([json(429, {}, { 'retry-after': '7' }), json(200, {})]);
  await z.request('GET', '/v1/account');
  assert.deepEqual(slept, [7000]);
});

test('a refusal is thrown with its code and request id', async () => {
  const { z } = client([json(404, { error: { code: 'no_request', message: 'Not found.' } }, { 'x-request-id': 'r1' })]);
  await assert.rejects(z.request('GET', '/v1/vps/x'), (e) => e instanceof ZeikoError && e.code === 'no_request' && e.status === 404 && e.requestId === 'r1');
});

test('waiting ends when the request is answered', async () => {
  const vps = (status) => json(200, { services: [{ id: 'v', requests: [{ id: 'q', status }] }] });
  const { z } = client([vps('open'), vps('done')]);
  assert.equal((await z.waitForRequest('v', 'q')).status, 'done');
});

test('waiting ends when the payment is no longer waiting', async () => {
  const { z } = client([json(200, { status: 'waiting' }), json(200, { status: 'paid' })]);
  assert.equal((await z.waitForPayment('p')).status, 'paid');
});

test('generated calls fill in the address', async () => {
  const { z, calls } = client([json(200, {})]);
  await z.getPaymentsPayQris('a/b');
  assert.equal(calls[0].url, 'https://api.example.test/v1/payments/a%2Fb/qris');
});
