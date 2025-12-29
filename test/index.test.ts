import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clear, flushExpired, get, remove, set } from "../src/index";

describe("local-storage-expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("persists data before expiry", () => {
    set("myKey", { a: 1, nested: { ok: true } }, 1_000);

    const v = get<{ a: number; nested: { ok: boolean } }>("myKey");
    expect(v).toEqual({ a: 1, nested: { ok: true } });
  });

  it("persists data when ttl is not provided", () => {
    set("myKey", { a: 1 });
    expect(get<{ a: number }>("myKey")).toEqual({ a: 1 });

    vi.advanceTimersByTime(10_000_000);
    expect(get<{ a: number }>("myKey")).toEqual({ a: 1 });

    flushExpired();
    expect(get<{ a: number }>("myKey")).toEqual({ a: 1 });
  });

  it("returns null after expiry and removes the item", () => {
    set("myKey", "hello", 1_000);
    expect(get<string>("myKey")).toBe("hello");

    vi.advanceTimersByTime(1_001);

    expect(get<string>("myKey")).toBeNull();
    expect(localStorage.getItem("lse_myKey")).toBeNull();
  });

  it("flushExpired removes expired data but keeps valid data", () => {
    set("old", 111, 1_000);
    set("fresh", 222, 5_000);
    localStorage.setItem("not_lse_key", "keep-me");

    vi.advanceTimersByTime(2_000);
    flushExpired();

    expect(get<number>("old")).toBeNull();
    expect(get<number>("fresh")).toBe(222);
    expect(localStorage.getItem("not_lse_key")).toBe("keep-me");
  });

  it("obfuscates the raw localStorage value (not plain JSON)", () => {
    set("secret", { token: "abc123", msg: "✅ unicode ok" }, 10_000);

    const raw = localStorage.getItem("lse_secret");
    expect(raw).toBeTypeOf("string");
    expect(raw).not.toContain("{");
    expect(raw).not.toContain("}");
    expect(() => JSON.parse(raw as string)).toThrow();
  });

  it("returns null and removes item if data is tampered", () => {
    set("t", { ok: true }, 10_000);
    localStorage.setItem("lse_t", "definitely-tampered");

    expect(get("t")).toBeNull();
    expect(localStorage.getItem("lse_t")).toBeNull();
  });

  it("remove deletes only the specific lse_ key", () => {
    set("a", 1, 10_000);
    set("b", 2, 10_000);

    remove("a");
    expect(get("a")).toBeNull();
    expect(get("b")).toBe(2);
  });

  it("clear removes only lse_ keys", () => {
    set("a", 1, 10_000);
    localStorage.setItem("not_lse_key", "keep");

    clear();
    expect(localStorage.getItem("lse_a")).toBeNull();
    expect(localStorage.getItem("not_lse_key")).toBe("keep");
  });
});


