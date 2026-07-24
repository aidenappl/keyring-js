import { Client, ClientOptions } from "./client";

/**
 * Env var that selects where configuration is resolved from. Setting it to
 * "env" (case-insensitive) skips the Keyring API entirely and reads only the
 * process environment.
 *
 * Services set this in tests and CI so a test process can never pick up
 * production secrets from a developer's configured Keyring. Mirrors
 * go-keyring's `KEYRING_SOURCE` / `SourceEnvVar`.
 */
export const SOURCE_ENV_VAR = "KEYRING_SOURCE";

/**
 * Reports whether Keyring lookups are disabled via {@link SOURCE_ENV_VAR}.
 * True when `KEYRING_SOURCE=env` (case-insensitive).
 */
export function envOnly(): boolean {
    return (process.env[SOURCE_ENV_VAR] ?? "").toLowerCase() === "env";
}

/**
 * Resolves a configuration value, reporting whether it was found.
 *
 * Resolution order:
 *   1. the process environment — a non-empty `process.env[key]` wins (so local
 *      development, tests, and values already injected by injectEnv() are
 *      reused without a network call);
 *   2. the Keyring API, when it is configured and envOnly() is false.
 *
 * Unlike get()/resolve(), an unconfigured or unreachable Keyring is NOT an
 * error — lookup() simply reports the value as not found, which lets a service
 * run purely from environment variables. It never throws.
 *
 * The "empty string = not set" rule matches go-keyring: an empty env value is
 * treated as absent and falls through to the Keyring lookup.
 *
 * @returns `[value, true]` when found, `["", false]` otherwise.
 */
export async function lookup(
    key: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<[string, boolean]> {
    const local = process.env[key];
    if (local !== undefined && local !== "") {
        return [local, true];
    }
    if (envOnly()) {
        return ["", false];
    }

    let client: Client;
    try {
        client = new Client(opts);
    } catch {
        // Keyring is not configured in this environment; env is all we have.
        return ["", false];
    }

    try {
        const value = await client.get(key, options);
        if (value === "") {
            return ["", false];
        }
        return [value, true];
    } catch {
        // Unreachable / unauthorized / missing — all reported as not found.
        return ["", false];
    }
}

/**
 * Returns the value for key, or throws an error naming the key (and the source
 * that was tried) when it is absent everywhere. Use it when a service wants to
 * report a misconfiguration rather than silently fall back.
 */
export async function resolve(
    key: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    const [value, ok] = await lookup(key, opts, options);
    if (ok) {
        return value;
    }
    if (envOnly()) {
        throw new Error(
            `keyring: "${key}" not set in the environment (${SOURCE_ENV_VAR}=env)`
        );
    }
    throw new Error(
        `keyring: "${key}" not found in the environment or Keyring`
    );
}

/**
 * Returns the value for key and throws when it is absent from every source.
 * Intended for service startup, where missing configuration is fatal.
 *
 * Prefer this over mustGet(): it succeeds when the value is present in the
 * environment even if the Keyring API is unreachable or unconfigured — the
 * normal situation in tests and CI.
 *
 * Note on parity: go-keyring's `MustResolve` is synchronous and panics. This
 * TypeScript port is **async** (Keyring access is inherently async here) and
 * rejects rather than panicking — `await mustResolve(key)` inside a try/catch,
 * or let the rejection abort startup.
 */
export async function mustResolve(
    key: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    return resolve(key, opts, options);
}

/**
 * Returns the value for key, or fallback when it is not set anywhere. Never
 * contacts Keyring when the value is already in the environment, and never
 * throws.
 */
export async function resolveOr(
    key: string,
    fallback: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    const [value, ok] = await lookup(key, opts, options);
    return ok ? value : fallback;
}
