import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Compares a secret received in a request with the expected one in constant time
 * (docs/spec/03-architecture.md §10). Both sides are hashed first, so the comparison
 * always runs over 32 bytes: neither the content nor the length of the expected secret
 * leaks through timing. A missing or empty value never matches.
 */
export function secretsMatch(received: string | null | undefined, expected: string): boolean {
  if (!received || !expected) return false;
  return timingSafeEqual(digest(received), digest(expected));
}
