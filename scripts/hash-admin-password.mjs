// Generates the `ADMIN_PASSWORD_HASH` value for the single admin password.
//
// This file is the single source of truth for the scrypt parameters and the
// hash format. `src/lib/auth.ts` imports them, so the generator and the runtime
// verifier can never drift apart.
//
// Usage:
//   node scripts/hash-admin-password.mjs "mi-password"
//
// Paste the printed line into your .env file.

import { randomBytes, scryptSync } from "node:crypto";

/** Shared scrypt cost parameters. */
export const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
});

/** Prefix of the `scrypt$<saltHex>$<hashHex>` hash format. */
export const PASSWORD_HASH_PREFIX = "scrypt";

/**
 * Derives the raw scrypt key for a password and a hex-encoded salt.
 *
 * @param {string} password
 * @param {string} saltHex
 * @returns {Buffer}
 */
export function deriveKey(password, saltHex) {
  return scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
}

/**
 * Builds a `scrypt$<saltHex>$<hashHex>` hash for a password.
 *
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const saltHex = randomBytes(SCRYPT_PARAMS.saltBytes).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${saltHex}$${deriveKey(password, saltHex).toString("hex")}`;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("hash-admin-password.mjs");

if (isDirectRun) {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/hash-admin-password.mjs "mi-password"');
    process.exit(1);
  }
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
}
