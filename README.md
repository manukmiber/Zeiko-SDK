# Zeiko SDK

A TypeScript client for the Zeiko Cloud API: VPS, Hosting, Sites, Proxy, QRIS payments and receipts, from your own code.

Not on npm yet. Node 20 or newer.

```ts
import { Zeiko } from 'zeiko-sdk';

const zeiko = new Zeiko({ apiKey: process.env.ZEIKO_API_KEY! });

const { services } = await zeiko.getVps();
const { request } = await zeiko.postVpsIdRequest(services[0].id, { body: { kind: 'reboot' } });
await zeiko.waitForRequest(services[0].id, request.id);
```

Make a key in the developer console. Keep it on your servers: it is not meant for a web page.

- **Writes are safe to retry.** Every POST and PUT carries an `Idempotency-Key`, the same one on each try. Pass `idempotencyKey` to choose it.
- **429 and 5xx are tried again**, up to three times, waiting as long as `Retry-After` says.
- **A refusal is thrown** as `ZeikoError`, with `status`, `code`, the message written for you, and a `requestId` to quote when you ask us about a call.
- **Some things are done by our team.** Starting or reinstalling a server is asked for and answered later: `waitForRequest` waits for the answer. `waitForPayment` waits for a QRIS payment.

## Working on it

`npm run generate -- <path or address of openapi.json>` writes `src/operations.ts` from the API's own document. `npm test` builds and runs the tests.
