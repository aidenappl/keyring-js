import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envOnly, lookup, mustResolve, resolve, resolveOr } from "./resolve";

const OPTS = {
    url: "https://keys.example.test",
    accessKeyId: "AKID",
    secretAccessKey: "SECRET",
};

function stubFetchData(pairs: Array<{ key: string; value: string }>): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
            new Response(JSON.stringify({ data: pairs }), { status: 200 })
        )
    );
}

beforeEach(() => {
    // Silence the "using local env var" / inject notices during tests.
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("envOnly", () => {
    it("is true when KEYRING_SOURCE=env (case-insensitive)", () => {
        vi.stubEnv("KEYRING_SOURCE", "ENV");
        expect(envOnly()).toBe(true);
    });

    it("is false when unset", () => {
        vi.stubEnv("KEYRING_SOURCE", "");
        expect(envOnly()).toBe(false);
    });

    it("is false for any other value", () => {
        vi.stubEnv("KEYRING_SOURCE", "keyring");
        expect(envOnly()).toBe(false);
    });
});

describe("lookup", () => {
    it("returns the env value first, without touching the API", async () => {
        const spy = vi.fn();
        vi.stubGlobal("fetch", spy);
        vi.stubEnv("MY_KEY", "from-env");

        const [value, ok] = await lookup("MY_KEY", OPTS);
        expect([value, ok]).toEqual(["from-env", true]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("treats an empty env value as not set (falls through)", async () => {
        vi.stubEnv("MY_KEY", "");
        vi.stubEnv("KEYRING_SOURCE", "env"); // short-circuit the API
        const [value, ok] = await lookup("MY_KEY", OPTS);
        expect([value, ok]).toEqual(["", false]);
    });

    it("short-circuits the API entirely when KEYRING_SOURCE=env", async () => {
        const spy = vi.fn();
        vi.stubGlobal("fetch", spy);
        vi.stubEnv("KEYRING_SOURCE", "env");

        const [value, ok] = await lookup("ABSENT", OPTS);
        expect([value, ok]).toEqual(["", false]);
        expect(spy).not.toHaveBeenCalled();
    });

    it("falls back to the Keyring API when not in env", async () => {
        stubFetchData([{ key: "API_KEY", value: "from-api" }]);
        const [value, ok] = await lookup("API_KEY", OPTS);
        expect([value, ok]).toEqual(["from-api", true]);
    });

    it("reports not-found (never throws) when the Keyring is unreachable", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("ECONNREFUSED");
            })
        );
        const [value, ok] = await lookup("API_KEY", OPTS);
        expect([value, ok]).toEqual(["", false]);
    });

    it("reports not-found (never throws) when Keyring is unconfigured", async () => {
        // No opts and no KEYRING_* env → Client construction throws internally,
        // lookup swallows it and reports not found.
        vi.stubEnv("KEYRING_URL", "");
        vi.stubEnv("KEYRING_ACCESS_KEY_ID", "");
        vi.stubEnv("KEYRING_SECRET_ACCESS_KEY", "");
        const [value, ok] = await lookup("API_KEY");
        expect([value, ok]).toEqual(["", false]);
    });
});

describe("resolve / mustResolve / resolveOr", () => {
    it("resolve returns the value when present", async () => {
        vi.stubEnv("MY_KEY", "present");
        await expect(resolve("MY_KEY", OPTS)).resolves.toBe("present");
    });

    it("resolve throws naming the key when absent", async () => {
        vi.stubEnv("KEYRING_SOURCE", "env");
        await expect(resolve("MISSING", OPTS)).rejects.toThrow(/MISSING/);
    });

    it("mustResolve throws when absent", async () => {
        vi.stubEnv("KEYRING_SOURCE", "env");
        await expect(mustResolve("MISSING", OPTS)).rejects.toThrow(/MISSING/);
    });

    it("mustResolve resolves from env even with no Keyring configured", async () => {
        vi.stubEnv("KEYRING_SOURCE", "env");
        vi.stubEnv("MY_KEY", "env-value");
        await expect(mustResolve("MY_KEY")).resolves.toBe("env-value");
    });

    it("resolveOr returns the fallback when absent, never throwing", async () => {
        vi.stubEnv("KEYRING_SOURCE", "env");
        await expect(resolveOr("MISSING", "default", OPTS)).resolves.toBe(
            "default"
        );
    });

    it("resolveOr returns the resolved value when present", async () => {
        vi.stubEnv("MY_KEY", "real");
        await expect(resolveOr("MY_KEY", "default", OPTS)).resolves.toBe("real");
    });
});
