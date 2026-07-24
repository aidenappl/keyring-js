export { Client, type ClientOptions } from "./client";
export {
    KeyringError,
    UnauthorizedError,
    UnavailableError,
    MalformedResponseError,
} from "./errors";
export {
    SOURCE_ENV_VAR,
    envOnly,
    lookup,
    resolve,
    mustResolve,
    resolveOr,
} from "./resolve";

import { Client, ClientOptions } from "./client";

/**
 * Package-level convenience — creates a client from environment variables
 * (or the provided options) and returns all secrets as a Record.
 */
export async function load(
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<Record<string, string>> {
    const client = new Client(opts);
    return client.load(options);
}

/**
 * Package-level convenience — creates a client from environment variables
 * (or the provided options) and injects all secrets into process.env.
 */
export async function injectEnv(
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<void> {
    const client = new Client(opts);
    return client.injectEnv(options);
}

/**
 * Package-level convenience — creates a client from environment variables
 * (or the provided options) and returns the value for a single key. If the
 * key is already set as a local env var it is returned immediately without
 * hitting the API.
 */
export async function get(
    key: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    const client = new Client(opts);
    return client.get(key, options);
}

/**
 * Package-level convenience — creates a client from environment variables
 * (or the provided options) and returns the value for a single key, throwing
 * if the key is absent or any error occurs. Mirrors go-keyring's `MustGet`
 * (which panics); this async port rejects instead.
 *
 * Prefer {@link mustResolve} at startup: unlike mustGet(), it succeeds from the
 * environment alone even when the Keyring API is unconfigured or unreachable.
 */
export async function mustGet(
    key: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    const client = new Client(opts);
    return client.get(key, options);
}

/**
 * Package-level convenience — creates a client from environment variables
 * (or the provided options) and returns the value for a single key, or
 * fallback on any error.
 */
export async function getOr(
    key: string,
    fallback: string,
    opts?: ClientOptions,
    options?: { signal?: AbortSignal }
): Promise<string> {
    const client = new Client(opts);
    return client.getOr(key, fallback, options);
}
