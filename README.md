# Zeiko SDK

Clients for the Zeiko Cloud API, in TypeScript and Python, and a command line tool: VPS, Hosting, Sites, Proxy, QRIS payments and receipts, from your own code.

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

## Python

Python 3.9 or newer, nothing else to install. Not on PyPI yet: copy `python/zeiko` or add `python` to your path.

```python
from zeiko import Zeiko

zeiko = Zeiko(api_key="zkc_...")
vps = zeiko.get_vps()["services"]
asked = zeiko.post_vps_id_request(vps[0]["id"], body={"kind": "reboot"})["request"]
zeiko.wait_for_request(vps[0]["id"], asked["id"])
```

It retries, keeps one `Idempotency-Key` across tries and raises `ZeikoError`, as the TypeScript client does.

## Command line

```sh
zeiko login zkc_...          # kept in ~/.config/zeiko/key, readable by you only
zeiko vps ls
zeiko vps reboot <id>        # also start, stop
zeiko payment <id>
zeiko api GET /v1/receipts
zeiko api POST /v1/vps/order '{"plan":"..."}'
```

`ZEIKO_API_KEY` is used before the saved key. `--json` prints what the API answered.

## Working on it

`npm run generate -- <path or address of openapi.json>` writes `src/operations.ts` from the API's own document. `npm test` builds and runs the tests.
