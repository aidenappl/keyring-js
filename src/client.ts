import {
    UnauthorizedError,
    UnavailableError,
    MalformedResponseError,
} from "./errors";

/** Maximum response bytes to read (32 MiB). */
const MAX_RESPONSE_BYTES = 32 << 20;

/** Options for configuring a Keyring Client. */
export interface ClientOptions {
    /** Base URL of the Keyring API. Trailing slashes are stripped. */
    url?: string;
    /** Token access key ID. */
    accessKeyId?: string;
    /** Token secret access key. */
    secretAccessKey?: string;
    /** HTTP timeout in milliseconds. Default: 10 000. */
    timeoutMs?: number;
}

/** Wire format of a single secret returned by the API. */
interface Secret {
    key: string;
    value: string;
}

/** Envelope the API wraps secrets in. */
interface SecretsResponse {
    data: Secret[];
}

/**
 * Client holds the configuration required to communicate with the Keyring API.
 */
export class Client {
    private readonly url: string;
    private readonly accessKeyId: string;
    private readonly secretAccessKey: string;
    private readonly timeoutMs: number;

    constructor(opts: ClientOptions = {}) {
        this.url = (
            opts.url ?? process.env.KEYRING_URL ?? ""
        ).replace(/\/+$/, "");
        this.accessKeyId =
            opts.accessKeyId ?? process.env.KEYRING_ACCESS_KEY_ID ?? "";
        this.secretAccessKey =
            opts.secretAccessKey ?? process.env.KEYRING_SECRET_ACCESS_KEY ?? "";
        this.timeoutMs = opts.timeoutMs ?? 10_000;

        if (!this.url) {
            throw new Error(
                "keyring: KEYRING_URL is required (set env var or pass url option)"
            );
        }
        if (!this.accessKeyId) {
            throw new Error(
                "keyring: KEYRING_ACCESS_KEY_ID is required (set env var or pass accessKeyId option)"
            );
        }
        if (!this.secretAccessKey) {
            throw new Error(
                "keyring: KEYRING_SECRET_ACCESS_KEY is required (set env var or pass secretAccessKey option)"
            );
        }
    }

    /**
     * Fetches all secrets granted to the token and returns them as a
     * Record<string, string> keyed by each secret's key field. The values are
     * decrypted by the API before transmission.
     *
     * Always makes a live HTTP call; cache the returned map yourself if you
     * need repeated access without repeated network calls.
     */
    async load(
        options?: { signal?: AbortSignal }
    ): Promise<Record<string, string>> {
        const credentials = Buffer.from(
            `${this.accessKeyId}:${this.secretAccessKey}`
        ).toString("base64");

        let response: Response;
        try {
            response = await fetch(`${this.url}/secrets`, {
                method: "GET",
                headers: { Authorization: `Basic ${credentials}` },
                signal:
                    options?.signal ??
                    AbortSignal.timeout(this.timeoutMs),
            });
        } catch (err: unknown) {
            throw new UnavailableError(err);
        }

        if (response.status === 401 || response.status === 403) {
            throw new UnauthorizedError();
        }

        if (!response.ok) {
            throw new MalformedResponseError(
                `unexpected status ${response.status}`
            );
        }

        let payload: SecretsResponse;
        try {
            const text = await response.text();
            if (text.length > MAX_RESPONSE_BYTES) {
                throw new MalformedResponseError("response body too large");
            }
            payload = JSON.parse(text) as SecretsResponse;
        } catch (err: unknown) {
            if (err instanceof MalformedResponseError) throw err;
            throw new MalformedResponseError(
                err instanceof Error ? err.message : String(err)
            );
        }

        const result: Record<string, string> = {};
        for (const s of payload.data) {
            result[s.key] = s.value;
        }
        return result;
    }

    /**
     * Calls load() and throws (rejects) if an error occurs. Intended for use
     * during service startup where a missing secret is a fatal condition.
     * Uses no abort signal timeout beyond the client default.
     */
    async mustLoad(): Promise<Record<string, string>> {
        return this.load();
    }

    /**
     * Calls load() and sets each returned secret as an environment variable
     * via process.env. Subsequent code can use process.env as if the variables
     * had been set natively. Prints a sorted table of injected key names to
     * stdout. Keys that replace an existing local env var are marked (override).
     */
    async injectEnv(
        options?: { signal?: AbortSignal }
    ): Promise<void> {
        const secrets = await this.load(options);

        const overridden = new Set<string>();
        for (const [k, v] of Object.entries(secrets)) {
            const existing = process.env[k];
            if (existing !== undefined && existing !== "" && existing !== v) {
                overridden.add(k);
            }
            process.env[k] = v;
        }

        const keys = Object.keys(secrets).sort();

        console.log("keyring: injected environment variables");
        console.log(
            "┌──────────────────────────────────────────────────┐"
        );
        for (const k of keys) {
            const tag = overridden.has(k) ? "(override)" : "          ";
            console.log(`│ ${k.padEnd(35)} ${tag} │`);
        }
        console.log(
            "└──────────────────────────────────────────────────┘"
        );
    }

    /**
     * Returns the value for key. If the key is already set in process.env,
     * that value is returned immediately without contacting the Keyring API
     * and a notice is printed to stdout. Otherwise the secret is fetched from
     * the API.
     */
    async get(
        key: string,
        options?: { signal?: AbortSignal }
    ): Promise<string> {
        const local = process.env[key];
        if (local !== undefined && local !== "") {
            console.log(
                `keyring: using local env var "${key}" (keyring lookup skipped)`
            );
            return local;
        }

        const secrets = await this.load(options);
        const value = secrets[key];
        if (value === undefined) {
            throw new Error(`keyring: secret "${key}" not found`);
        }
        return value;
    }

    /**
     * Returns the keyring value for key, or fallback if the key is absent or
     * any error occurs.
     */
    async getOr(
        key: string,
        fallback: string,
        options?: { signal?: AbortSignal }
    ): Promise<string> {
        try {
            return await this.get(key, options);
        } catch {
            return fallback;
        }
    }
}
