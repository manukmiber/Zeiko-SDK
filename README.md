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

## Zeiko DB

Zeiko DB is a database you reach over HTTPS, in the language you pick: `postgres`, `mysql`, `sqlite`, `kv` (key-value) or `mongo`. Make one with the command line or in the developer console. The same `zkc_` key works for it.

```sh
zeiko db create <project-id> notes --lang postgres   # prints the id and its address
zeiko db execute <db-id> "create table notes (id serial primary key, body text)"
zeiko db execute <db-id> --file seed.sql             # each ;-separated statement, in one transaction
zeiko db migrations apply <db-id> ./migrations       # each *.sql file once, in name order
zeiko db list
zeiko db delete <db-id>
```

`zeiko db execute` prints a table, or the answers with `--json`. Migrations work on `postgres`, `mysql` and `sqlite` databases, and record what they applied in a table called `_zeiko_migrations`. `ZEIKO_DB_URL` changes the address.

Snapshots and archives:

```sh
zeiko db snapshots <db-id>                       # the project's schedule and the snapshots kept
zeiko db snapshot <db-id>                        # one now, on top of the schedule
zeiko db restore <db-id> <snapshot-id> --name notes-copy   # always into a new database
zeiko db export <db-id>                          # a download archive in the database's own format
zeiko db download <db-id> <archive-id> --out notes.sql
zeiko db extension <db-id> vector                # PostgreSQL extensions from the catalog
zeiko db schedule <project-id> daily             # weekly is included; daily and hourly are paid from your balance
```

From your code, with the SDK:

```ts
import { database, ZeikoDbError } from 'zeiko-sdk';

const db = database(process.env.ZEIKO_DB_ID!, { key: process.env.ZEIKO_API_KEY! });

const { rows } = await db.query('select id, body from notes where id > $1', [0]);  // each row is an array of values

await db.transaction(async (tx) => {
  await tx.query('insert into notes (body) values ($1)', ['hello']);
});  // commits when the function returns, rolls back when it throws

await db.kv.put('session/abc', { user: 'a' }, { ttl: 3600 });  // on a kv database
const session = await db.kv.getJson<{ user: string }>('session/abc');  // null when there is none
await db.redis('SET', 'counter', 1);

const users = db.collection('users');  // on a mongo database
await users.insertOne({ name: 'Ana', age: 30 });
const adults = await users.find({ age: { $gte: 18 } }, { sort: { age: -1 } });
await db.mongo({ createIndexes: 'users', indexes: [{ key: { name: 1 }, name: 'name_1', unique: true }] });
```

On a `mongo` database, `db.mongo(command)` sends one command as `db.runCommand` takes it, in extended JSON, and gives back the reply in relaxed extended JSON (dates as `{ "$date": "<ISO-8601>" }`). A cursor is read to the end, so there is no `getMore`. Sessions, transactions and commands that reach another database are refused with the reason. A write that Mongo answers with `writeErrors` throws from `collection()` with code `mongo_write` and Mongo's own code in `mongoCode` (11000 for a duplicate key).

Or with `fetch`, from any language: `POST https://db.zeiko.biz.id/v1/<db-id>/query` with `authorization: Bearer <key>` and a JSON body `{ "sql": "...", "params": [] }`.

With Drizzle, wrap the client in the proxy for your language and pass that to `drizzle` (`drizzle-orm/pg-proxy`, `mysql-proxy` or `sqlite-proxy`):

```ts
import { drizzle } from 'drizzle-orm/pg-proxy';
import { pgProxy } from 'zeiko-sdk';

const orm = drizzle(pgProxy(db));
```

With Kysely, give its dialect classes for your language and `kyselyDriver(db)`:

```ts
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { kyselyDriver } from 'zeiko-sdk';

const orm = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => kyselyDriver(db),
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});
```

On a `mysql` database use `MysqlAdapter`, `MysqlIntrospector` and `MysqlQueryCompiler`; on `sqlite`, the `Sqlite` ones. `orm.transaction()` runs on one transaction of the database (`db.begin()`); choosing an isolation level is refused.

A refusal is thrown as `ZeikoDbError`, with `status` and `code`. Nothing is retried for you: a request that failed in transit may still have run.

## What the clients do for you

- Every write (`POST`, `PUT`, `PATCH`, `DELETE`) sends an `Idempotency-Key`, and a retry sends the same key as the first try. Pass `idempotencyKey` (TypeScript) or `idempotency_key` (Python) to choose it.
- `429`, `5xx` and a broken connection are tried again, up to three more times (the `retries` option changes that). The wait follows `Retry-After` when the API sends it, and is never more than 60 seconds.
- A refusal is thrown as `ZeikoError`, with `status`, `code`, the message, and a `requestId` (`request_id` in Python) to quote when you ask us about a call.
- Starting or reinstalling a server is asked for and answered later by our team. `waitForRequest` waits for the answer.

## Development

`npm run generate -- <path or address of openapi.json>` writes `src/operations.ts` and `python/zeiko/_operations.py` from the API's own document. `npm test` builds the TypeScript and runs the TypeScript and Python tests.
