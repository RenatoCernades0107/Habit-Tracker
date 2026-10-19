// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isFresh,
  parsePendingSignIn,
  PENDING_SIGN_IN_TTL_MS,
  pendingSignInStore,
} from "./pending-sign-in";

afterEach(() => {
  pendingSignInStore.clear();
  vi.useRealTimers();
});

describe("parsePendingSignIn", () => {
  it("parses a stored value", () => {
    expect(parsePendingSignIn('{"email":"a@b.co","sentAt":1000}')).toEqual({
      email: "a@b.co",
      sentAt: 1000,
    });
  });

  it.each([
    null,
    "",
    "not json",
    "null",
    "[]",
    '{"email":"a@b.co"}',
    '{"email":"","sentAt":1}',
    '{"email":1,"sentAt":1}',
    '{"email":"a@b.co","sentAt":"1"}',
  ])("rejects %j", (raw) => {
    expect(parsePendingSignIn(raw)).toBeNull();
  });
});

describe("isFresh", () => {
  it("expires after the TTL", () => {
    const pending = { email: "a@b.co", sentAt: 1_000_000 };
    expect(isFresh(pending, 1_000_000)).toBe(true);
    expect(isFresh(pending, 1_000_000 + PENDING_SIGN_IN_TTL_MS - 1)).toBe(true);
    expect(isFresh(pending, 1_000_000 + PENDING_SIGN_IN_TTL_MS)).toBe(false);
    expect(isFresh(pending, 1_000_000 - 120_000)).toBe(false);
  });
});

describe("pendingSignInStore", () => {
  it("saves, notifies and clears", () => {
    const listener = vi.fn();
    const unsubscribe = pendingSignInStore.subscribe(listener);

    pendingSignInStore.save({ email: "a@b.co", sentAt: Date.now() });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(parsePendingSignIn(pendingSignInStore.getSnapshot())?.email).toBe("a@b.co");

    pendingSignInStore.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(pendingSignInStore.getSnapshot()).toBeNull();

    unsubscribe();
    pendingSignInStore.save({ email: "a@b.co", sentAt: Date.now() });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a stable snapshot while nothing changes", () => {
    pendingSignInStore.save({ email: "a@b.co", sentAt: Date.now() });
    expect(pendingSignInStore.getSnapshot()).toBe(pendingSignInStore.getSnapshot());
  });

  it("hides stale values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    pendingSignInStore.save({ email: "a@b.co", sentAt: Date.now() });
    vi.setSystemTime(new Date("2026-10-19T11:00:00Z"));
    expect(pendingSignInStore.getSnapshot()).toBeNull();
  });

  it("keeps working when storage is blocked", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    pendingSignInStore.save({ email: "a@b.co", sentAt: Date.now() });
    expect(parsePendingSignIn(pendingSignInStore.getSnapshot())?.email).toBe("a@b.co");
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it("has no server snapshot", () => {
    expect(pendingSignInStore.getServerSnapshot()).toBeNull();
  });
});
