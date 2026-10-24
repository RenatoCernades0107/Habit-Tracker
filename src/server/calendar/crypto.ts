import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/env.server";

/**
 * AES-256-GCM for Google refresh tokens (docs/spec/03-architecture.md §10). TOKEN_ENCRYPTION_KEY
 * is 32 bytes in base64 or hex; anything else is hashed to 32 bytes.
 */
export function encryptionKey(raw = getServerEnv().TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return createHash("sha256").update(raw).digest();
}

/** iv (12) ‖ tag (16) ‖ ciphertext. */
export function encrypt(plain: string, key = encryptionKey()): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(sealed: Buffer, key = encryptionKey()): string {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8");
}

/** bytea from PostgREST comes back as "\x…" hex. */
export const fromBytea = (value: string) => Buffer.from(value.replace(/^\\x/, ""), "hex");
export const toBytea = (buf: Buffer) => `\\x${buf.toString("hex")}`;
