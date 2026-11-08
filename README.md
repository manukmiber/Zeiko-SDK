# Zeiko SDK

Clients for the Zeiko Cloud API, in TypeScript and Python, and a command line tool: VPS, Hosting, Sites, Proxy, QRIS payments and receipts, from your own code.

Not published to npm. Node 20 or newer.

## Keys

Make a key in the developer console. A key starts with `zkc_`. Keep it on your servers: it is not meant for a web page. Read it from an environment variable such as `ZEIKO_API_KEY` instead of writing it in your code.

## TypeScript

```ts
import { Zeiko, ZeikoError } from 'zeiko-sdk';

const zeiko = new Zeiko({ apiKey: process.env.ZEIKO_API_KEY! });

try {
  const { services } = await zeiko.getVps();
  const { request } = await zeiko.postVpsIdRequest(services[0].id, { body: { kind: 'reboot' } });
  console.log(request.id, request.status);
} catch (err) {
  if (err instanceof ZeikoError) {
    console.error(err.status, err.code, err.message, err.requestId);
  } else {
    throw err;
  }
}
```

`waitForRequest(vpsId, requestId)` gives back a request once it is no longer `open`. `waitForPayment(paymentId)` gives back a QRIS payment once it is no longer `waiting` or `confirming`. Both throw a plain `Error` after an hour; pass `timeoutMs` to change that.

## Python

```python
import os
import sys

from zeiko import Zeiko, ZeikoError

zeiko = Zeiko(api_key=os.environ["ZEIKO_API_KEY"])

try:
    services = zeiko.get_vps()["services"]
    asked = zeiko.post_vps_id_request(services[0]["id"], body={"kind": "reboot"})["request"]
    print(asked["id"], asked["status"])
except ZeikoError as err:
    print(err.status, err.code, err, err.request_id, file=sys.stderr)
```

`wait_for_request(vps_id, request_id)` and `wait_for_payment(payment_id)` wait the same way. They raise `TimeoutError` after an hour; `timeout` changes that. Pass `idempotency_key=` to any POST method to choose the key.

Python 3.9 or newer, nothing else to install. Not published to PyPI: copy `python/zeiko` or add `python` to your path.

## Command line

The command line is not published yet. Run `npm run build` first, which writes `dist/cli.js`. Run it as `node dist/cli.js` wherever the examples say `zeiko`.

```sh
zeiko login "$ZEIKO_API_KEY"   # saved in ~/.config/zeiko/key, readable by you only
zeiko vps ls
zeiko vps reboot <id>
```

`vps start`, `vps stop` and `vps reboot` ask for that action. `payment <id>` shows a QRIS payment and where it stands. `api <METHOD> <path> [json body]` calls an API path directly and prints the answer.

`ZEIKO_API_KEY` is used before the saved key. Add `--json` to print what the API answered. An error goes to stderr and the command exits with status 1; a refusal from the API also shows its code and request id.

## What the clients do for you

- Every write (`POST`, `PUT`, `PATCH`, `DELETE`) sends an `Idempotency-Key`, and a retry sends the same key as the first try. Pass `idempotencyKey` (TypeScript) or `idempotency_key` (Python) to choose it.
- `429`, `5xx` and a broken connection are tried again, up to three more times (the `retries` option changes that). The wait follows `Retry-After` when the API sends it, and is never more than 60 seconds.
- A refusal is thrown as `ZeikoError`, with `status`, `code`, the message, and a `requestId` (`request_id` in Python) to quote when you ask us about a call.
- Starting or reinstalling a server is asked for and answered later by our team. `waitForRequest` waits for the answer.

## Development

`npm run generate -- <path or address of openapi.json>` writes `src/operations.ts` and `python/zeiko/_operations.py` from the API's own document. `npm test` builds the TypeScript and runs the TypeScript and Python tests.
