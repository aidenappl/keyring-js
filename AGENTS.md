# AGENTS.md — keyring-js

> `keyring-js` is the **Node.js / TypeScript consumer SDK** for the Keyring secrets platform
> (`@aidenappleby/keyring-js`, published to npm). A service imports it and calls **`injectEnv()`**
> at startup to pull the secrets it has been granted from `keys.appleby.cloud` and load them into
> `process.env` — so the service never carries a `.env` file for its production config. It is the
> TypeScript counterpart to [`go-keyring`](https://github.com/aidenappl/go-keyring) and hits the
> exact same service endpoint (`GET /secrets`, HTTP Basic auth).
>
> It **owns**: the client that authenticates a service token against the Keyring API, the
> secrets-to-`process.env` mapping, the single-key helpers, and the typed error set. It **does
> not** own storage, encryption, the grant graph, or any admin surface — that is
> [`keyring-api`](https://github.com/aidenappl/keyring-api). This SDK only ever calls the one
> public, grant-scoped, decrypted-values endpoint.
>
> **⚠️ Golden rule — keep this file current:** any change that alters the public SDK surface
> (exported functions/types/classes), the wire contract with `keyring-api` (`GET /secrets`, the
> `{data:[{key,value}]}` envelope, the HTTP Basic auth), the env-var names it reads, the build
> output, or the commands MUST update this AGENTS.md **in the same change**. Stale context here
> misleads every future agent. Update `README.md` too when the consumer-facing usage changes.
>
> **⚠️ Two-hostname trap:** the **API** this SDK talks to is **`keys.appleby.cloud`**. The web
> dashboard is `keyring.appleby.cloud` (that is `keyring-web`, a different service). Point
> `KEYRING_URL` at `keys.appleby.cloud` — pointing it at the web host will not work.

---

## 1. What this repo is

A tiny, dependency-free TypeScript SDK. Published to npm as **`@aidenappleby/keyring-js`**
(current version **1.0.0**, MIT, author `aidenappl`, Node `>=18`). Its whole reason to exist is
the startup line:

```ts
import { injectEnv } from "@aidenappleby/keyring-js";
await injectEnv();          // secrets are now in process.env
```

A service holds a **Keyring service token** (an `access_key_id` + `secret_access_key` pair). At
boot it exchanges that pair — via HTTP Basic auth — for the set of secrets granted to that token,
and this SDK writes each one into `process.env`. From then on the rest of the codebase reads
`process.env.FOO` as if it had been set natively.

The GitHub repo is `github.com/aidenappl/keyring-js` (owner `aidenappl`). Local clone lives at
`/Users/aiden/Desktop/Personal/Repos/keyring-js`.

**What it is not:** it is not an admin client. It cannot create/update/delete secrets, manage
grants, mint tokens, or read the encryption key. All of that is Forta-authenticated admin surface
on `keyring-api`, reachable via `keyring-web`, `keyring-mcp`, or the API directly — never through
this package. This SDK only reads the secrets its token can see.

---

## 2. Stack & dependencies

- **Language:** TypeScript, `"strict": true`, target **ES2022**, module **ESNext**,
  `moduleResolution: "bundler"`. See `tsconfig.json`.
- **Runtime dependencies: ZERO.** It uses the global `fetch`, `AbortSignal.timeout`, and `Buffer`
  — all present in Node ≥18. Do not add runtime dependencies; that is a deliberate constraint (a
  boot-critical SDK should not drag a dependency tree into every service).
- **Dev dependencies only:** `tsup` (bundler), `typescript`, `vitest` (test runner), `@types/node`.
- **Build tool:** **tsup** → dual **CJS + ESM** + **`.d.ts`** types (see `tsup.config.ts` and §4).
- **Node target:** `engines.node >= 18.0.0`. It relies on Node globals (`Buffer`,
  `AbortSignal.timeout`, `fetch`); this is a **Node SDK**, not a browser SDK.

Package entry points (`package.json`):

| Field | Value |
|---|---|
| `main` (CJS) | `dist/index.js` |
| `module` (ESM) | `dist/index.mjs` |
| `types` | `dist/index.d.ts` |
| `exports["."]` | `types` → `.d.ts`, `import` → `.mjs`, `require` → `.js` |
| `files` | `["dist"]` — only the build output is published |

---

## 3. Project structure

The SDK is four source files under `src/`, plus co-located vitest suites. Flat and small on purpose.

```
keyring-js/
  src/
    index.ts        # Public entry — re-exports Client + errors + the resolve family, and the
                    #   package-level convenience functions: load(), injectEnv(), get(),
                    #   mustGet(), getOr()
    client.ts       # The Client class — ClientOptions, config resolution, the GET /secrets
                    #   call, load() / mustLoad() / injectEnv() / get() / getOr(); plus the
                    #   internal readBodyCapped() byte-capped body reader
    resolve.ts      # Env-first resolve family — envOnly(), lookup(), resolve(), mustResolve(),
                    #   resolveOr(), and the SOURCE_ENV_VAR constant
    errors.ts       # Typed error hierarchy: KeyringError (base) + Unauthorized / Unavailable /
                    #   MalformedResponse
    client.test.ts  # vitest — Client.load / constructor
    resolve.test.ts # vitest — the resolve family
  tsup.config.ts # Build config (CJS+ESM+dts, clean, sourcemap)
  tsconfig.json  # strict, ES2022, bundler resolution
  package.json   # name, version, entry points, scripts
  Devfile.yaml   # `dev` CLI command mappings (build/check/test/install)
  README.md      # Front-door (standard SDK shape — install, quickstart, API surface)
```

There is **no `dist/` in git** (built on publish) and **no `.env`** (this SDK's config comes from
the consuming service's environment). Tests live in `src/*.test.ts` and are excluded from the tsup
build (entry is `src/index.ts` only).

---

## 4. Running, building & testing

```bash
npm ci            # install dev deps first — REQUIRED before check/build (see note below)
npm run check     # tsc --noEmit   → typecheck only
npm run build     # tsup           → dist/ (CJS index.js + ESM index.mjs + index.d.ts + maps)
npm test          # vitest run     → runs src/*.test.ts (client + resolve suites)
```

`Devfile.yaml` maps the `dev` CLI to the real npm scripts: `dev build` → `npm run build`,
`dev check` → `npm run check`, `dev test` → `npm test`, `dev install` → `npm install`. (It was
previously pointed at non-existent `dev`/`start`/`lint` scripts; it now mirrors `package.json`,
which defines `build`, `check`, `test`, and `prepublishOnly`.)

**⚠️ Typecheck requires deps installed.** `npm run check` on a fresh clone with no `node_modules`
fails with `Cannot find name 'AbortSignal'` / `Buffer` etc. — those are Node globals that come
from `@types/node`. This is **not** a code bug; run `npm ci` first and the typecheck is clean.

### Build output (tsup)

`tsup.config.ts`: `entry: ["src/index.ts"]`, `format: ["cjs", "esm"]`, `dts: true`,
`clean: true`, `sourcemap: true`. Produces in `dist/`:
`index.js` (CJS), `index.mjs` (ESM), `index.d.ts` (types), plus `.map` sourcemaps. `clean: true`
wipes `dist/` each build. These filenames must stay in lockstep with the `main`/`module`/`types`/
`exports` fields in `package.json` — if you change the entry or format, update both.

### Publishing IS deployment

There is no server to deploy; **the npm package is the deployment.** `prepublishOnly` runs
`npm run build`, so `npm publish` always ships a fresh `dist/`.

- Consumers resolve **latest** via `npm install @aidenappleby/keyring-js` — so publishing a new
  version immediately affects every service that reinstalls or has a `^` range and re-resolves.
- **Bump `version` in `package.json`** for any published change (npm rejects a duplicate version).
- Publishing requires npm auth / **2FA** from an interactive terminal — an agent cannot publish
  unattended, and per the repo guardrails you should **never publish/deploy** unless explicitly
  asked. A running service does **not** pick up a new SDK version until it reinstalls and restarts.

---

## 5. How code is written here — the SDK surface

Everything hangs off the `Client` class in `client.ts`; `index.ts` adds no-boilerplate
package-level wrappers that construct a `Client` and call the matching method.

### `ClientOptions` (all optional — fall back to env vars)

| Option | Env fallback | Default | Meaning |
|---|---|---|---|
| `url` | `KEYRING_URL` | — (**required**) | Base URL of the Keyring API. Trailing slashes stripped. Point at `https://keys.appleby.cloud`. |
| `accessKeyId` | `KEYRING_ACCESS_KEY_ID` | — (**required**) | Service token access key ID. |
| `secretAccessKey` | `KEYRING_SECRET_ACCESS_KEY` | — (**required**) | Service token secret access key. |
| `timeoutMs` | — | `10_000` | Per-request timeout, applied via `AbortSignal.timeout` unless the caller passes their own `signal`. |

The constructor resolves each field as `opts.X ?? process.env.<VAR> ?? ""` and then **throws a
plain `Error` immediately** if `url`, `accessKeyId`, or `secretAccessKey` is empty (fail-fast at
construction — you find out at boot, not on first request). The three env-var **names** (never
their values) are: `KEYRING_URL`, `KEYRING_ACCESS_KEY_ID`, `KEYRING_SECRET_ACCESS_KEY`.

### `Client` methods

| Method | Returns | Behaviour |
|---|---|---|
| `load(options?)` | `Promise<Record<string,string>>` | The core call. `GET {url}/secrets` with `Authorization: Basic base64(accessKeyId:secretAccessKey)`. Reads the body **byte-capped** at 32 MiB (streamed via `readBodyCapped`), parses it, and — guarding that `.data` is actually an array — maps `{data:[{key,value}]}` into a `Record` keyed by `key`. A 2xx body missing/ non-array `.data` throws `MalformedResponseError` (not a raw `TypeError`). **Always a live HTTP call** — no caching; cache the map yourself if you need repeated access. |
| `mustLoad()` | `Promise<Record<string,string>>` | Throw-on-failure startup variant of `load()` (no abort signal beyond the client default timeout). In go-keyring `Load` returns an error and `MustLoad` panics; in JS `load()` already *rejects* on failure, so `mustLoad()` throws under the same conditions and exists for naming parity + call-site intent. |
| `injectEnv(options?)` | `Promise<void>` | Calls `load()`, writes every returned secret into `process.env`, and prints a sorted ASCII table of injected key **names** to stdout. Keys that replace a non-empty, different existing local value are tagged `(override)`. **The headline function.** |
| `get(key, options?)` | `Promise<string>` | If `process.env[key]` is already set (non-empty), returns it immediately and logs that the keyring lookup was skipped — **local env wins**. Otherwise `load()`s and returns that key, throwing `keyring: secret "<key>" not found` if absent. |
| `getOr(key, fallback, options?)` | `Promise<string>` | `get()` wrapped in try/catch — returns `fallback` on **any** error (missing key, unauthorized, unavailable). Never throws. |

### Package-level convenience functions (`index.ts`)

Each constructs a fresh `Client(opts)` and delegates: `load(opts?, options?)`,
`injectEnv(opts?, options?)`, `get(key, opts?, options?)`, `mustGet(key, opts?, options?)`,
`getOr(key, fallback, opts?, options?)`. The common startup call `await injectEnv()` therefore
takes **no arguments** and reads everything from the environment. `mustGet` mirrors go-keyring's
`MustGet` — it constructs a client and `get`s, throwing on absence/error (async here, so it
*rejects* rather than panics).

### Env-first resolve family (`resolve.ts`)

Ported from go-keyring's `resolve.go`. **Resolution order: process env first** (a non-empty
`process.env[key]` wins), then the Keyring API — unless `KEYRING_SOURCE=env`, which skips the API
entirely. The **"empty string = not set"** rule is honoured: an empty env value falls through to
the Keyring lookup. Unlike `get`, an unconfigured/unreachable Keyring is **not** an error here.

| Function | Returns | Behaviour |
|---|---|---|
| `envOnly()` | `boolean` | `true` when `KEYRING_SOURCE=env` (case-insensitive) — the API is skipped. |
| `lookup(key, opts?, options?)` | `Promise<[string, boolean]>` | `[value, found]`. Env first; then (unless envOnly) constructs a `Client` and `get`s. A Client that can't be constructed (unconfigured) or a failed `get` (unreachable/unauthorized/missing) → `["", false]`. **Never throws.** |
| `resolve(key, opts?, options?)` | `Promise<string>` | `lookup`, else throws naming the key (and the `KEYRING_SOURCE=env` source when applicable). |
| `mustResolve(key, opts?, options?)` | `Promise<string>` | Startup variant — throws when absent. Succeeds from env alone even if Keyring is down. **Async**, unlike go-keyring's sync `MustResolve` (which panics) — this rejects. |
| `resolveOr(key, fallback, opts?, options?)` | `Promise<string>` | `lookup`, else `fallback`. **Never throws.** |
| `SOURCE_ENV_VAR` | `string` | The `"KEYRING_SOURCE"` constant. |

### Exports (`index.ts`)

- **Classes/values:** `Client`, `load`, `injectEnv`, `get`, `mustGet`, `getOr`; the resolve family
  `envOnly`, `lookup`, `resolve`, `mustResolve`, `resolveOr`, `SOURCE_ENV_VAR`; and the error
  classes `KeyringError`, `UnauthorizedError`, `UnavailableError`, `MalformedResponseError`.
- **Types:** `ClientOptions`.
- The `Secret` / `SecretsResponse` wire interfaces and `readBodyCapped` in `client.ts` are
  **internal** (not exported).

### Conventions to keep

- **Zero runtime deps** — never `import` a third-party package into `src/`.
- **Fail-fast on config**, tolerant on lookups: the constructor throws on missing credentials;
  `get`/`load`/`injectEnv` reject on failure; only `getOr` swallows.
- **Local env var wins** in `get()`/`getOr()` — a value already in `process.env` short-circuits
  the network call. This is what lets local development override a keyring secret.
- **Never log a secret value.** `injectEnv` prints key **names** and an `(override)` tag only —
  never values. Preserve that. Same for any new code.
- **Trailing slashes stripped** from `url` via `.replace(/\/+$/, "")` so `.../` + `/secrets`
  never doubles up.
- **32 MiB response cap** (`MAX_RESPONSE_BYTES`) guards against a runaway body. Enforced as a
  **real byte cap** by `readBodyCapped()` — it checks `Content-Length` up front, then streams the
  body via `response.body.getReader()`, counting bytes and aborting the read once the budget is
  exceeded (mirroring go-keyring's `io.LimitReader` intent). It does **not** buffer the whole body
  and then measure `String.length` — that old check counted UTF-16 units *after* the full read and
  never actually capped anything.

---

## 6. Domain & architecture

### The wire contract with `keyring-api`

This is the single integration point and must stay in lockstep with
[`keyring-api`](https://github.com/aidenappl/keyring-api)'s `GET /secrets` handler:

- **Request:** `GET {KEYRING_URL}/secrets`
- **Auth:** HTTP Basic — header `Authorization: Basic base64("<access_key_id>:<secret_access_key>")`.
  This is the **service-token** path (`tokens` table on the API), **NOT Forta**. Contrast with the
  admin path: `keyring-api`'s `/admin/*` is Forta-authenticated (access JWT / session cookie /
  `frt_` token) and returns **ciphertext**; this SDK's `/secrets` path returns **decrypted values**,
  grant-scoped to the token, and every read is written to the API's access-log audit trail.
- **Response body:** JSON envelope `{ "data": [ { "key": "...", "value": "..." }, ... ] }`. The SDK
  reads only `.data`, mapping `key → value`.
- **Values are already decrypted** by `keyring-api` before transmission — `GET /secrets` is the one
  endpoint whose whole purpose is to return plaintext. The SDK does no crypto.

### Failure behaviour (`load` → the typed errors in `errors.ts`)

| Condition | Thrown |
|---|---|
| `fetch` rejects (network down, DNS, timeout via `AbortSignal.timeout`) | `UnavailableError` (with `.cause`) |
| HTTP `401` or `403` | `UnauthorizedError` — credentials invalid or token inactive/ungranted |
| Any other non-2xx | `MalformedResponseError("unexpected status <n>")` |
| Body unparseable, 2xx body missing/non-array `.data`, or `> 32 MiB` (byte-capped during read) | `MalformedResponseError(detail)` |

All four extend `KeyringError`, so a caller can `catch (e) { if (e instanceof KeyringError) … }`.
`getOr` catches all of them and returns its fallback.

### The lazy-init pattern (why this matters at startup)

**Secrets are not available in `process.env` until Keyring responds.** Any module that reads a
keyring-provided value at **import time** (top-level `const X = process.env.FOO`) will capture
`undefined`, because `injectEnv()` runs *after* imports resolve. The correct startup shape:

```ts
import { injectEnv } from "@aidenappleby/keyring-js";

async function main() {
  await injectEnv();          // 1. secrets land in process.env
  const { startServer } = await import("./server");  // 2. dynamic import AFTER inject
  await startServer();        //    modules that read process.env now see real values
}
main();
```

Equivalently: read config **lazily** (inside functions / getters), not at module top level. This
is the exact analogue of `go-keyring`'s lazy `Init()` guidance and of the CLAUDE.md note that
Keyring-backed services use a lazy `Init()` instead of an IIFE for their DB/config. If a service
"can't find its config" at boot, the usual cause is eager top-level reads before `injectEnv()`
resolved — not a Keyring outage.

### How services consume it

A typical `appleby.cloud` Node service: holds a Keyring service token (via `KEYRING_ACCESS_KEY_ID`
/ `KEYRING_SECRET_ACCESS_KEY` in its container env, or CI-injected), calls `await injectEnv()` as
the first line of `main`, then boots normally. Go services do the identical thing through
`go-keyring`. Local dev falls back to a real `.env` / shell env because `get()` lets local values
win and because you can simply not call `injectEnv()`.

---

## 7. Ecosystem & related repos

| Repo | Relationship |
|---|---|
| [`keyring-api`](https://github.com/aidenappl/keyring-api) | **The server this SDK calls.** Owns `GET /secrets` (the exact endpoint here), storage, encryption, grants, tokens, audit. `keys.appleby.cloud`. §6 is the contract between the two. |
| [`go-keyring`](https://github.com/aidenappl/go-keyring) | **The Go equivalent of this package.** Same `GET /secrets` + HTTP Basic contract, same `injectEnv`/lazy-init story. Keep the two SDKs behaviourally aligned. |
| [`keyring-web`](https://github.com/aidenappl/keyring-web) | The admin dashboard at **`keyring.appleby.cloud`** (the *other* hostname). Manages secrets/grants/tokens; not something this SDK touches. |
| [`keyring-mcp`](https://github.com/aidenappl/keyring-mcp) | MCP server exposing Keyring's admin API to Claude Code. Redacts values; no encryption-key tool. Admin-side, not consumer-side. |
| [`keyring-actions`](https://github.com/aidenappl/keyring-actions) | GitHub Action that injects Keyring secrets into CI — the CI analogue of `injectEnv()`. |
| [`forta-api`](https://github.com/aidenappl/forta-api) | Identity provider for Keyring's **admin** auth. **Irrelevant to this SDK** — the `/secrets` path uses service-token HTTP Basic, not Forta. Noted here only to make the boundary explicit. |

**Hostname reminder:** API = `keys.appleby.cloud` (what `KEYRING_URL` points at); web =
`keyring.appleby.cloud` (dashboard). Do not swap them.

---

## 8. Operations

- **No deployed service** — the "deploy" is `npm publish` (see §4). There is no Lattice stack, no
  container, no health endpoint for this repo.
- **Version discovery:** `npm view @aidenappleby/keyring-js version` shows what consumers resolve.
- **Consumers pick up changes only on reinstall + restart** — a long-running service keeps the SDK
  version it was built/installed with.
- **Common failure modes seen by consumers (diagnose in the *consuming* service, not here):**
  - *Constructor throws `KEYRING_URL/…_ACCESS_KEY_ID/…_SECRET_ACCESS_KEY is required`* → the env
    var isn't set in that service's environment. Check the container env / Keyring grant that
    should supply the token.
  - *`UnauthorizedError` (401/403)* → the service token is wrong, inactive, or has no grant on the
    secret it wants. Check `keyring_list_secret_grants` / `keyring_list_tokens` on the API side.
  - *`UnavailableError`* → can't reach `keys.appleby.cloud` (network/DNS/timeout), or `KEYRING_URL`
    points at the wrong host (e.g. the `keyring.appleby.cloud` web host).
  - *Config is `undefined` despite a successful inject* → eager top-level `process.env` reads
    before `injectEnv()` resolved. Move to lazy reads / post-inject dynamic import (§6).

---

## 9. Rules & guardrails

- **Never add a runtime dependency.** Zero-dep is a hard constraint for a boot-critical SDK.
- **Never log, echo, or print a secret value** — not in `injectEnv`'s table (names + `(override)`
  only), not in errors, not in debug output. Same for the access key / secret key.
- **Never break the wire contract** with `keyring-api` (`GET /secrets`, `{data:[{key,value}]}`,
  HTTP Basic) without changing `keyring-api` and, ideally, `go-keyring` in the same effort.
- **Keep fail-fast semantics:** constructor throws on missing config; `load`/`get`/`injectEnv`
  reject on failure; only `getOr` swallows. Don't silently degrade the others.
- **Bump `package.json` version** for any change you intend to publish; keep the tsup output
  filenames aligned with the `main`/`module`/`types`/`exports` fields.
- **Do not publish/deploy** unless the user explicitly asks (repo-wide guardrail). Publishing is
  irreversible-ish and hits every consumer.
- **Stay Node-targeted** — don't add browser-only assumptions; it depends on `Buffer` /
  `AbortSignal.timeout` / global `fetch`.

---

## 10. Verification — always before "done"

```bash
npm ci            # REQUIRED first on a fresh clone (types come from @types/node)
npm run check     # tsc --noEmit — must be clean
npm run build     # tsup — must produce dist/{index.js,index.mjs,index.d.ts}
npm test          # vitest run — runs src/*.test.ts (client + resolve suites); must pass
```

A clone with no `node_modules` will show spurious `Cannot find name 'AbortSignal'/'Buffer'`
errors from `npm run check` — that is the missing-`@types/node` symptom, not a real failure. Run
`npm ci` first, then treat any remaining `tsc` error as real.

**Never report work complete if `tsc` or `tsup` fails.** If a change touches the SDK surface, the
wire contract, the env-var names, the build output, or the commands, update this AGENTS.md (and
`README.md`) in the same change before calling it done.

---

## 11. Keeping this file updated

Update this AGENTS.md **in the same change** when you:

- **Add/rename/remove an export** (a `Client` method, a package-level function, an error class, a
  type) → update §5 (the surface tables) and §3.
- **Change the wire contract** — endpoint path, auth scheme, or the `{data:[{key,value}]}` envelope
  → update §6, and coordinate with `keyring-api` / `go-keyring`.
- **Change the env-var names** it reads (`KEYRING_URL`, `KEYRING_ACCESS_KEY_ID`,
  `KEYRING_SECRET_ACCESS_KEY`) → update §5 (NAMES only, never values).
- **Change failure behaviour / the error hierarchy** → update §6's failure table.
- **Change the build** (tsup format, entry, output filenames) or the package entry points →
  update §2 and §4, and keep `package.json` in sync.
- **Add tests** → update §3/§4 (keep the test-layout description current).

`README.md` is the standard front-door (install, `injectEnv()` quickstart, the full API surface —
Client methods, the resolve family, errors, env vars, the keys-vs-keyring hostname note). Keep it
in sync with §5's surface tables whenever the exported API changes.
