/**
 * Base class for all Keyring errors.
 */
export class KeyringError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "KeyringError";
    }
}

/**
 * Returned when the API responds with 401 or 403, indicating the credentials
 * are invalid or the token is inactive.
 */
export class UnauthorizedError extends KeyringError {
    constructor() {
        super(
            "keyring: unauthorized — credentials invalid or token inactive"
        );
        this.name = "UnauthorizedError";
    }
}

/**
 * Returned when the Keyring API cannot be reached within the configured
 * timeout.
 */
export class UnavailableError extends KeyringError {
    constructor(cause?: unknown) {
        super("keyring: API unavailable");
        this.name = "UnavailableError";
        if (cause) this.cause = cause;
    }
}

/**
 * Returned when the API returns a response body that cannot be parsed.
 */
export class MalformedResponseError extends KeyringError {
    constructor(detail?: string) {
        super(
            detail
                ? `keyring: malformed response from API: ${detail}`
                : "keyring: malformed response from API"
        );
        this.name = "MalformedResponseError";
    }
}
