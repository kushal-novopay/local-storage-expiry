const PREFIX = "lse_" as const;

/**
 * NOTE: This is obfuscation, not cryptography.
 * It is meant to discourage casual inspection in DevTools.
 */
const SECRET = "local-storage-expiry::static-secret::v1" as const;
const VERSION = 1 as const;

type StoredEnvelopeV1 = {
    v: typeof VERSION;
    /** expiry epoch millis; null means "never expires" */
    e: number | null;
    /** payload */
    d: unknown;
};

function assertLocalStorageAvailable(): void {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
        throw new Error("localStorage is not available in this environment.");
    }
}

function toNamespacedKey(key: string): string {
    return `${PREFIX}${key}`;
}

function utf8Encode(input: string): Uint8Array {
    // TextEncoder is widely supported in modern browsers and in Node 18+.
    return new TextEncoder().encode(input);
}

function utf8Decode(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

function base64Encode(bytes: Uint8Array): string {
    // Convert bytes to a binary string, then base64.
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);

    if (typeof globalThis.btoa === "function") {
        return globalThis.btoa(binary);
    }

    // Node fallback (no runtime dep; Buffer is built-in in Node).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer as
        | { from: (s: string, enc: "binary") => { toString: (enc: "base64") => string } }
        | undefined;
    if (B) return B.from(binary, "binary").toString("base64");

    throw new Error("Base64 encoder is not available in this environment.");
}

function base64Decode(base64: string): Uint8Array {
    let binary: string;
    if (typeof globalThis.atob === "function") {
        binary = globalThis.atob(base64);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const B = (globalThis as any).Buffer as
            | { from: (s: string, enc: "base64") => { toString: (enc: "binary") => string } }
            | undefined;
        if (!B) throw new Error("Base64 decoder is not available in this environment.");
        binary = B.from(base64, "base64").toString("binary");
    }

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        out[i] = data[i]! ^ key[i % key.length]!;
    }
    return out;
}

function encodeEnvelope(envelope: StoredEnvelopeV1): string {
    const json = JSON.stringify(envelope);
    const dataBytes = utf8Encode(json);
    const keyBytes = utf8Encode(SECRET);
    const xored = xorBytes(dataBytes, keyBytes);
    return base64Encode(xored);
}

function decodeEnvelope(raw: string): StoredEnvelopeV1 | null {
    try {
        const keyBytes = utf8Encode(SECRET);
        const xored = base64Decode(raw);
        const dataBytes = xorBytes(xored, keyBytes);
        const json = utf8Decode(dataBytes);
        const parsed: unknown = JSON.parse(json);
        if (!isEnvelopeV1(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function isEnvelopeV1(input: unknown): input is StoredEnvelopeV1 {
    if (typeof input !== "object" || input === null) return false;
    const rec = input as Record<string, unknown>;
    if (rec.v !== VERSION) return false;
    if (rec.e !== null && (typeof rec.e !== "number" || !Number.isFinite(rec.e))) return false;
    // d can be any JSON-serializable value; no further checks here.
    return "d" in rec;
}

function isExpired(expiryEpochMs: number | null, nowEpochMs: number): boolean {
    if (expiryEpochMs === null) return false;
    return nowEpochMs >= expiryEpochMs;
}

/**
 * Stores a value with an optional TTL in milliseconds.
 * Keys are automatically namespaced with `lse_`.
 */
export function set(key: string, value: unknown, ttlInMs?: number): void {
    assertLocalStorageAvailable();

    const expiry = typeof ttlInMs === "number" ? Date.now() + ttlInMs : null;
    const envelope: StoredEnvelopeV1 = { v: VERSION, e: expiry, d: value };
    const encoded = encodeEnvelope(envelope);
    globalThis.localStorage.setItem(toNamespacedKey(key), encoded);
}

/**
 * Retrieves a value. If expired or tampered, returns null and removes the item.
 * Keys are automatically namespaced with `lse_`.
 */
export function get<T>(key: string): T | null {
    assertLocalStorageAvailable();

    const nsKey = toNamespacedKey(key);
    const raw = globalThis.localStorage.getItem(nsKey);
    if (raw === null) return null;

    const decoded = decodeEnvelope(raw);
    if (!decoded) {
        globalThis.localStorage.removeItem(nsKey);
        return null;
    }

    if (isExpired(decoded.e, Date.now())) {
        globalThis.localStorage.removeItem(nsKey);
        return null;
    }

    return decoded.d as T;
}

/**
 * Removes the specific key.
 * Keys are automatically namespaced with `lse_`.
 */
export function remove(key: string): void {
    assertLocalStorageAvailable();
    globalThis.localStorage.removeItem(toNamespacedKey(key));
}

/**
 * Loops through ALL localStorage keys. If a key starts with `lse_` and is expired,
 * delete it. (Also deletes malformed/tampered entries to keep storage clean.)
 */
export function flushExpired(): void {
    assertLocalStorageAvailable();

    const keys: string[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
        const k = globalThis.localStorage.key(i);
        if (k) keys.push(k);
    }

    const now = Date.now();
    for (const k of keys) {
        if (!k.startsWith(PREFIX)) continue;
        const raw = globalThis.localStorage.getItem(k);
        if (raw === null) continue;
        const decoded = decodeEnvelope(raw);
        if (!decoded || isExpired(decoded.e, now)) {
            globalThis.localStorage.removeItem(k);
        }
    }
}

/**
 * Removes ONLY keys starting with `lse_`.
 */
export function clear(): void {
    assertLocalStorageAvailable();

    const keys: string[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
        const k = globalThis.localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
    }

    for (const k of keys) globalThis.localStorage.removeItem(k);
}

export const __internal = {
    PREFIX
};


