# local-storage-expiry

Vanilla TypeScript wrapper for `localStorage` that adds:

- **TTL (Time-To-Live)** expiration per key
- **Lightweight obfuscation** (Unicode-safe **XOR + Base64**) so values aren’t stored as plain JSON

This package has **zero runtime dependencies**.

## Install

```bash
npm i @kushalst/local-storage-expiry
```

## Quick start

```ts
import {
  set,
  get,
  remove,
  flushExpired,
  clear,
} from "@kushalst/local-storage-expiry";

set("myKey", { hello: "world" }, 60_000); // expires in 60s
set("myKeyForever", { hello: "world" }); // persisted (no TTL)
const value = get<{ hello: string }>("myKey");

remove("myKey");
flushExpired();
clear(); // removes only keys created by this library (prefix: lse_)
```

## Key behavior (namespace)

All keys written by this library are stored under the `localStorage` key:

- `lse_${key}`

So:

- `set("token", "abc", 1000)` stores under `lse_token`
- `set("token", "abc")` stores under `lse_token` (no TTL)

This also means:

- `clear()` removes **only** keys starting with `lse_` (it won’t touch other app keys)

## API

All functions automatically apply the `lse_` prefix.

### `set(key, value, ttlInMs?)`

Store a value that expires after `ttlInMs` milliseconds. If `ttlInMs` is omitted, the value is persisted (never expires).

```ts
set("profile", { id: 123, name: "Kushal" }, 5 * 60_000);
set("profile", { id: 123, name: "Kushal" });
```

- **key**: `string` (stored as `lse_${key}`)
- **value**: `unknown` (must be JSON-serializable)
- **ttlInMs**: `number` (milliseconds, optional)

Notes:

- Expiry is computed using `Date.now() + ttlInMs`.

### `get<T>(key): T | null`

Read a value.

```ts
const profile = get<{ id: number; name: string }>("profile");
```

Returns:

- The stored value if present and not expired
- `null` if missing, expired, or tampered/malformed

Important:

- If the entry is **expired**, `get()` will **remove it** and return `null`.
- If the entry is **tampered/malformed**, `get()` will **remove it** and return `null`.

### `remove(key)`

Remove a single key (only `lse_${key}`).

```ts
remove("profile");
```

### `flushExpired()`

Scan **all** `localStorage` keys and remove expired `lse_` entries.

```ts
flushExpired();
```

Behavior:

- Only keys starting with `lse_` are considered
- Expired entries are deleted
- Malformed/tampered entries are also deleted (to keep storage tidy)
- Non-`lse_` keys are untouched

### `clear()`

Remove **only** keys starting with `lse_`.

```ts
clear();
```

## Obfuscation (XOR + Base64)

This library does **not** store plain JSON in `localStorage`. Instead it:

- Serializes `{ v, e, d }` as JSON (`v`=version, `e`=expiry epoch ms or `null` for “no expiry”, `d`=data)
- UTF-8 encodes the JSON (so Unicode is safe)
- XORs bytes with a static internal secret
- Base64 encodes the result

This provides **light obfuscation** so data is not casually readable in DevTools.

### Security note

This is **not encryption** and should not be used to protect secrets against a determined attacker.
If you need real security, store sensitive data server-side or use proper cryptography and key management.

## TTL / time notes

- Expiration uses the system clock via `Date.now()`.
- If the device clock changes, expiration behavior changes accordingly.
- `flushExpired()` uses a single `now = Date.now()` snapshot for the entire sweep.

## SSR / non-browser environments

This package uses `localStorage`. In environments where `localStorage` doesn’t exist (SSR, some Node contexts),
calling `set/get/remove/flushExpired/clear` will throw:

- `"localStorage is not available in this environment."`

Common patterns:

```ts
if (typeof window !== "undefined") {
  set("k", "v", 1000);
}
```

## Testing

The included test suite uses **Vitest fake timers** to validate TTL behavior.
If you test code that depends on expiration, prefer fake timers + `vi.setSystemTime(...)` for deterministic tests.

## License

MIT
