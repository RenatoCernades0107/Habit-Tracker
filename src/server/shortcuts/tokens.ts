import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** `ht_` + 32 random bytes (docs/spec/03-architecture.md §10). Only the hash is stored. */
export function generateToken(): { token: string; prefix: string; hash: Buffer } {
  const token = `ht_${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, 8), hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/** Postgres bytea literal for PostgREST: `\x` + hex. */
export const byteaHex = (buf: Buffer) => `\\x${buf.toString("hex")}`;
