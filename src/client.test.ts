import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "./client";
import {
    MalformedResponseError,
    UnauthorizedError,
    UnavailableError,
} from "./errors";

const OPTS = {
    url: "https://keys.example.test",
    accessKeyId: "AKID",
    secretAccessKey: "SECRET",
};

function stubFetch(fn: typeof fetch): void {
    vi.stubGlobal("fetch", vi.fn(fn));
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Client.load", () => {
    it("maps a well-formed {data:[{key,value}]} envelope", async () => {
        stubFetch(async () =>
            new Response(
                JSON.stringify({
                    data: [
                        { key: "FOO", value: "1" },
                        { key: "BAR", value: "2" },
                    ],
                }),
                { status: 200, headers: { "content-type": "application/json" } }
            )
        );

        const secrets = await new Client(OPTS).load();
        expect(secrets).toEqual({ FOO: "1", BAR: "2" });
    });

    it("throws UnauthorizedError on 401", async () => {
        stubFetch(async () => new Response("", { status: 401 }));
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            UnauthorizedError
        );
    });

    it("throws UnauthorizedError on 403", async () => {
        stubFetch(async () => new Response("", { status: 403 }));
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            UnauthorizedError
        );
    });

    it("throws UnavailableError when fetch rejects (network down)", async () => {
        stubFetch(async () => {
            throw new Error("ECONNREFUSED");
        });
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            UnavailableError
        );
    });

    it("throws MalformedResponseError on a 2xx body without .data (the fixed bug)", async () => {
        stubFetch(async () =>
            new Response(JSON.stringify({}), { status: 200 })
        );
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            MalformedResponseError
        );
    });

    it("throws MalformedResponseError when .data is not an array", async () => {
        stubFetch(async () =>
            new Response(JSON.stringify({ data: "nope" }), { status: 200 })
        );
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            MalformedResponseError
        );
    });

    it("throws MalformedResponseError on invalid JSON", async () => {
        stubFetch(async () =>
            new Response("not json", { status: 200 })
        );
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            MalformedResponseError
        );
    });

    it("throws MalformedResponseError on an unexpected non-2xx status", async () => {
        stubFetch(async () => new Response("", { status: 500 }));
        await expect(new Client(OPTS).load()).rejects.toBeInstanceOf(
            MalformedResponseError
        );
    });
});

describe("Client constructor", () => {
    it("throws when url is missing", () => {
        expect(
            () => new Client({ accessKeyId: "a", secretAccessKey: "b" })
        ).toThrow(/KEYRING_URL is required/);
    });

    it("strips trailing slashes from url", async () => {
        const spy = vi.fn(
            async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
        );
        vi.stubGlobal("fetch", spy);
        await new Client({ ...OPTS, url: "https://keys.example.test///" }).load();
        expect(spy).toHaveBeenCalledWith(
            "https://keys.example.test/secrets",
            expect.anything()
        );
    });
});
