import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { PASSWORD_HASH_PREFIX, deriveKey } from "../../scripts/hash-admin-password.mjs";

/*
 * Authentication for the single admin user.
 *
 * There is no credentials table: the password is checked against a scrypt hash
 * kept in `ADMIN_PASSWORD_HASH`, and the session is a signed cookie whose key
 * comes from `SESSION_SECRET`. Every function here fails closed when the
 * environment is not fully configured — a missing secret never yields a valid
 * session and a missing hash never yields a successful login.
 */

/** Cookie that carries the signed admin session. Exported so Proxy reads the same name. */
export const ADMIN_SESSION_COOKIE = "admin_session";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

type AdminSession = { username: string };

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/** Compares two strings in constant time (UTF-8 bytes). */
function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length || bufferA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Verifies a password against a stored `scrypt$<saltHex>$<hashHex>` hash. */
export function verifyAdminPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3) {
    return false;
  }

  const [prefix, saltHex, hashHex] = parts;
  if (prefix !== PASSWORD_HASH_PREFIX || saltHex.length === 0 || hashHex.length === 0) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) {
    return false;
  }

  let actual: Buffer;
  try {
    actual = deriveKey(password, saltHex);
  } catch {
    return false;
  }

  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/** True only when user, password hash and session secret are all configured. */
export function isAdminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH && getSessionSecret(),
  );
}

/** Checks a username and password against the configured admin credentials. */
export function authenticateAdmin(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !storedHash) {
    return false;
  }

  const usernameMatches = constantTimeEqual(username, expectedUser);
  const passwordMatches = verifyAdminPassword(password, storedHash);
  return usernameMatches && passwordMatches;
}

/**
 * Creates a `base64url(payload).base64url(hmac)` session token.
 * Throws when `SESSION_SECRET` is missing: refusing to sign is the fail-closed path.
 */
export function createAdminSessionToken(username: string): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured; refusing to create an admin session.",
    );
  }

  const payload = JSON.stringify({
    u: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

/**
 * Parses and authenticates a session token's structure and signature without
 * sampling the current time. Returns the payload claims, or null for missing,
 * truncated or tampered tokens.
 */
function parseSignedAdminSession(
  token: string | null | undefined,
): { u: string; exp: number } | null {
  const secret = getSessionSecret();
  if (!secret || !token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  if (encodedPayload.length === 0 || signature.length === 0) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const { u, exp } = payload as Record<string, unknown>;
  if (typeof u !== "string" || u.length === 0) {
    return null;
  }
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return null;
  }

  return { u, exp };
}

/**
 * Authenticates a session token. Returns null for tampered, truncated, expired
 * or wrong-user tokens. This is the authoritative gate: Proxy runs it on every
 * `/admin` request, so an invalid session is answered with a real HTTP redirect
 * before any panel markup is generated.
 */
export function verifyAdminSessionToken(
  token: string | null | undefined,
): AdminSession | null {
  const claims = parseSignedAdminSession(token);
  if (!claims) {
    return null;
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  // A renamed admin must not keep an old session alive.
  const expectedUser = process.env.ADMIN_USER;
  if (expectedUser && claims.u !== expectedUser) {
    return null;
  }

  return { username: claims.u };
}

/** Sets the signed session cookie. Call only from a Server Function or Route Handler. */
export async function setAdminSessionCookie(username: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clears the session cookie server-side. */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Reads and verifies the session cookie from the current request. Memoized with
 * React's `cache` so the panel layout and any page below it verify the cookie
 * once per render pass instead of once per component. Proxy is the authoritative
 * gate; this second check is defense in depth for the case where the cookie
 * expires between the edge check and the render.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
});
