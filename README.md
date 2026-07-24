# keyring-js

Node.js / TypeScript consumer SDK for the Keyring secrets platform.

> **appleby.cloud platform** · Node SDK · `@aidenappleby/keyring-js` (npm) · API host `keys.appleby.cloud`

---

## Overview

A service imports this package and calls **`injectEnv()`** at startup to pull the secrets it has
been granted from Keyring and load them into `process.env` — so the service never carries a `.env`
file for its production config. It is the TypeScript counterpart to
[`go-keyring`](https://github.com/aidenappl/go-keyring) and hits the same endpoint
(`GET /secrets`, HTTP Basic auth).

It **owns** the client that authenticates a service token, the secrets-to-`process.env` mapping,
the single-key/resolve helpers, and the typed error set. It does **not** own storage, encryption,
grants, or any admin surface — that is [`keyring-api`](https://github.com/aidenappl/keyring-api).

**Zero runtime dependencies.** Uses only Node ≥18 built-ins (`fetch`, `AbortSignal.timeout`,
`Buffer`). This is a Node SDK, not a browser SDK.

> **⚠️ Two-hostname trap:** the **API** this SDK talks to is **`keys.appleby.cloud`**. The web
> dashboard `keyring.appleby.cloud` is a different service (`keyring-web`). Point `KEYRING_URL` at
> `keys.appleby.cloud`.

## Role in the appleby.cloud ecosystem

- [`keyring-api`](https://github.com/aidenappl/keyring-api) — the server this SDK calls; owns
  `GET /secrets`, storage, encryption, grants, tokens, audit.
- [`go-keyring`](https://github.com/aidenappl/go-keyring) — the Go equivalent; kept behaviourally
  aligned with this package.
- [`keyring-web`](https://github.com/aidenappl/keyring-web) — the admin dashboard
  (`keyring.appleby.cloud`).
- [`keyring-actions`](https://github.com/aidenappl/keyring-actions) — the CI analogue of
  `injectEnv()`.

## Tech stack

TypeScript (`strict`, ES2022) · tsup (dual CJS + ESM + `.d.ts`) · vitest · zero runtime deps.

## Getting started

### Prerequisites

- Node **≥ 18**
- A Keyring **service token** (`access_key_id` + `secret_access_key`) with grants on the secrets
  you need.

### Setup

```bash
npm install @aidenappleby/keyring-js
```

Provide the token and API host via environment variables:

```bash
KEYRING_URL=https://keys.appleby.cloud
KEYRING_ACCESS_KEY_ID=<access key id>
KEYRING_SECRET_ACCESS_KEY=<secret access key>
```

### Quickstart — `injectEnv()`

```ts
import { injectEnv } from "@aidenappleby/keyring-js";

async function main() {
  await injectEnv();                                   // secrets land in process.env
  const { startServer } = await import("./server");    // import AFTER inject
  await startServer();                                 // modules now see real values
}
main();
```

**Lazy-init matters:** secrets are not in `process.env` until Keyring responds. A module that
reads a keyring-provided value at import time (`const X = process.env.FOO` at module top level)
captures `undefined`, because `injectEnv()` runs after imports resolve. Read config lazily (inside
functions) or dynamic-import boot modules after `injectEnv()`.

## API surface

### Package-level convenience functions

Each constructs a `Client` from env vars (or the options you pass) and delegates:

| Function | Behaviour |
|---|---|
| `injectEnv(opts?, options?)` | Loads all granted secrets and writes them into `process.env`, printing a table of injected key **names** (never values); `(override)` tags keys that replaced a different local value. |
| `load(opts?, options?)` | Returns all secrets as `Record<string,string>`. Live HTTP call — cache it yourself. |
| `get(key, opts?, options?)` | Returns one secret. A non-empty `process.env[key]` wins (local override) and skips the API. Throws if absent. |
| `mustGet(key, opts?, options?)` | Like `get`, throwing on absence/error. Mirrors go-keyring's `MustGet` (async here — rejects rather than panics). |
| `getOr(key, fallback, opts?, options?)` | `get` with a fallback on **any** error. Never throws. |

### Resolve family (env-first)

Resolution order: **process env first** (a non-empty value wins), then the Keyring API unless
`KEYRING_SOURCE=env`. An empty env value is treated as **not set**. Mirrors go-keyring's
`Resolve` family.

| Function | Behaviour |
|---|---|
| `lookup(key, opts?, options?)` | `Promise<[value, found]>`. Env first, then Keyring. An unconfigured/unreachable Keyring is **not** an error — reports not-found. Never throws. |
| `resolve(key, opts?, options?)` | The value, or throws naming the key when absent everywhere. |
| `mustResolve(key, opts?, options?)` | Startup variant — throws when absent. Succeeds from env alone even if Keyring is unreachable. (Async, unlike go-keyring's sync `MustResolve`.) |
| `resolveOr(key, fallback, opts?, options?)` | The value, or `fallback` when absent. Never throws. |
| `envOnly()` | `true` when `KEYRING_SOURCE=env` (case-insensitive) — the API is skipped entirely. Used by tests/CI so a test process can't pick up production secrets. |
| `SOURCE_ENV_VAR` | The `"KEYRING_SOURCE"` constant. |

### `Client`

`new Client(opts?)` — all options fall back to env vars; the constructor **throws immediately**
if `url` / `accessKeyId` / `secretAccessKey` resolve empty (fail-fast at boot). Methods:
`load()`, `mustLoad()`, `injectEnv()`, `get()`, `getOr()`.

`ClientOptions`: `url` (`KEYRING_URL`), `accessKeyId` (`KEYRING_ACCESS_KEY_ID`),
`secretAccessKey` (`KEYRING_SECRET_ACCESS_KEY`), `timeoutMs` (default `10000`).

### Errors

All extend `KeyringError`, so `catch (e) { if (e instanceof KeyringError) … }` catches them all:

| Error | When |
|---|---|
| `UnauthorizedError` | HTTP 401 / 403 — credentials invalid or token inactive/ungranted. |
| `UnavailableError` | `fetch` failed (network/DNS/timeout). Carries `.cause`. |
| `MalformedResponseError` | Unexpected non-2xx status, unparseable body, a 2xx body missing the `data` array, or a body exceeding the 32 MiB cap. |

## Environment variables

| Var | Meaning |
|---|---|
| `KEYRING_URL` | Base URL of the Keyring API (`https://keys.appleby.cloud`). Trailing slashes stripped. |
| `KEYRING_ACCESS_KEY_ID` | Service token access key ID. |
| `KEYRING_SECRET_ACCESS_KEY` | Service token secret access key. |
| `KEYRING_SOURCE` | Set to `env` to skip the Keyring API entirely (resolve family reads only `process.env`). |

## Development

| Command | What it does |
|---|---|
| `npm ci` | Install dev deps (required before check/build on a fresh clone). |
| `npm run check` | `tsc --noEmit` — typecheck only. |
| `npm run build` | `tsup` → `dist/` (CJS + ESM + `.d.ts` + sourcemaps). |
| `npm test` | `vitest run`. |

The `dev` CLI (`Devfile.yaml`) maps `dev build` / `dev check` / `dev test` / `dev install` to the
matching npm scripts.

## Project structure

```
src/
  index.ts     # Public entry — re-exports Client, errors, resolve family;
               #   package-level load/injectEnv/get/mustGet/getOr
  client.ts    # Client class + config resolution + GET /secrets
  resolve.ts   # Env-first resolve family: lookup/resolve/mustResolve/resolveOr/envOnly
  errors.ts    # KeyringError + Unauthorized / Unavailable / MalformedResponse
  *.test.ts    # vitest suites for client.load and the resolve family
```

## Deployment

There is no server — **the npm package is the deployment.** `prepublishOnly` runs the build, so
`npm publish` ships a fresh `dist/`. Bump `version` in `package.json` for any published change.
Consumers pick up a new version only on reinstall + restart. Do not publish unless explicitly
asked.

## Contributing & further reading

See [`AGENTS.md`](./AGENTS.md) for the full contributor/agent guide (wire contract, failure
behaviour, lazy-init story, conventions). The wire contract lives in
[`keyring-api`](https://github.com/aidenappl/keyring-api); keep behaviour aligned with
[`go-keyring`](https://github.com/aidenappl/go-keyring).
