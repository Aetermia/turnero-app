/**
 * R1 verification under real concurrency, against the real database.
 *
 * It exercises the REAL `createReservation` (the TypeScript module), not a
 * re-implementation. Node 24 runs the TypeScript directly via its type
 * stripping; a small `module.registerHooks` resolver teaches it the project's
 * `@/` alias and its extensionless imports, which Node does not understand on
 * its own.
 *
 * Run: node scripts/verify-concurrency.mjs
 */
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const projectRoot = new URL("../", import.meta.url);

/**
 * Resolves `@/x` and extensionless relative imports (`./x`, `../x`) to their
 * `.ts` file (or `x/index.ts`). Node's ESM resolver needs the extension; the
 * app's bundler does not. Bare specifiers (`drizzle-orm`, `postgres`, ...) fall
 * through to Node's default resolver untouched.
 */
function resolveTypeScript(base, parentUrl) {
  let candidate = null;
  if (base.startsWith("@/")) {
    candidate = fileURLToPath(new URL(`src/${base.slice(2)}`, projectRoot));
  } else if (base.startsWith("./") || base.startsWith("../")) {
    candidate = fileURLToPath(new URL(base, parentUrl));
  }

  if (!candidate || candidate.includes("node_modules")) {
    return null;
  }

  if (candidate.endsWith(".ts") && fs.existsSync(candidate)) {
    return candidate;
  }
  if (fs.existsSync(`${candidate}.ts`)) {
    return `${candidate}.ts`;
  }
  const index = path.join(candidate, "index.ts");
  if (fs.existsSync(index)) {
    return index;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const file = resolveTypeScript(specifier, context.parentURL);
    if (file) {
      return {
        url: pathToFileURL(file).href,
        format: "module-typescript",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

// ---------------------------------------------------------------------------

/** @type {{ createReservation: Function, RESERVATION_HOLD_MINUTES: number }} */
const { createReservation } = await import("../src/lib/reservations.ts");
const { db } = await import("../src/db/index.ts");
const { events, customers, reservations } = await import("../src/db/schema.ts");
const { eq, inArray } = await import("drizzle-orm");

if (!process.env.DATABASE_URL) {
  console.error(
    "FAIL: DATABASE_URL is not set. It must come from .env (see .env.example).",
  );
  process.exit(1);
}

const CONCURRENT_ATTEMPTS = 8;
const createdEventIds = [];
const createdEmails = [];
let failures = 0;

function report(label, passed, detail) {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

function tally(results) {
  const counts = { ok: 0, sold_out: 0, already_reserved: 0, not_found: 0 };
  const unexpected = [];
  for (const result of results) {
    if (result.ok) {
      counts.ok += 1;
    } else if (result.reason in counts) {
      counts[result.reason] += 1;
    } else {
      unexpected.push(result);
    }
  }
  return { counts, unexpected };
}

function newEvent(title, capacity) {
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  return {
    title,
    startsAt,
    endsAt,
    capacity,
    price: "1000.00",
    isPublished: true,
  };
}

function input(email, fullName) {
  createdEmails.push(email);
  return {
    fullName,
    email,
    whatsapp: "+5491100000000",
    hasHealthCondition: false,
    healthCondition: null,
    marketingConsent: false,
  };
}

async function main() {
  console.log("R1 concurrency verification (real createReservation)");
  console.log(`Database: ${maskedDatabaseUrl()}`);

  // --- Scenario 1: last seat, 8 concurrent attempts, different emails -------
  const [lastSeatEvent] = await db
    .insert(events)
    .values(newEvent("Concurrency check — single seat", 1))
    .returning({ id: events.id });
  createdEventIds.push(lastSeatEvent.id);

  const batchOne = await Promise.all(
    Array.from({ length: CONCURRENT_ATTEMPTS }, (_, i) =>
      createReservation(lastSeatEvent.id, input(`seat-${i}@verify.test`, `Seat ${i}`)),
    ),
  );

  const one = tally(batchOne);
  console.log(
    `\nScenario 1 — capacity 1, ${CONCURRENT_ATTEMPTS} concurrent attempts (distinct emails):`,
  );
  console.log(
    `  observed: ok=${one.counts.ok}, sold_out=${one.counts.sold_out}, ` +
      `already_reserved=${one.counts.already_reserved}, not_found=${one.counts.not_found}` +
      (one.unexpected.length ? `, unexpected=${JSON.stringify(one.unexpected)}` : ""),
  );
  report(
    `exactly 1 success and ${CONCURRENT_ATTEMPTS - 1} sold_out`,
    one.counts.ok === 1 &&
      one.counts.sold_out === CONCURRENT_ATTEMPTS - 1 &&
      one.unexpected.length === 0,
    `expected ok=1, sold_out=${CONCURRENT_ATTEMPTS - 1}; got ${JSON.stringify(one.counts)}`,
  );

  // --- Scenario 2: same email twice, concurrent (per-person rule) -----------
  // Capacity must be >= 2 here: with capacity 1 the seat check would fire first
  // and mask the per-person index, and the test would prove nothing.
  const [perPersonEvent] = await db
    .insert(events)
    .values(newEvent("Concurrency check — per person", 5))
    .returning({ id: events.id });
  createdEventIds.push(perPersonEvent.id);

  const sameEmail = "same-person@verify.test";
  const batchTwo = await Promise.all([
    createReservation(perPersonEvent.id, input(sameEmail, "Same Person")),
    createReservation(perPersonEvent.id, input(sameEmail, "Same Person")),
  ]);

  const two = tally(batchTwo);
  console.log(
    "\nScenario 2 — capacity 5, 2 concurrent attempts with the SAME email:",
  );
  console.log(
    `  observed: ok=${two.counts.ok}, already_reserved=${two.counts.already_reserved}, ` +
      `sold_out=${two.counts.sold_out}` +
      (two.unexpected.length ? `, unexpected=${JSON.stringify(two.unexpected)}` : ""),
  );
  report(
    "exactly 1 success and 1 already_reserved",
    two.counts.ok === 1 &&
      two.counts.already_reserved === 1 &&
      two.unexpected.length === 0,
    `expected ok=1, already_reserved=1; got ${JSON.stringify(two.counts)}`,
  );
}

function maskedDatabaseUrl() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function cleanup() {
  // Order matters: reservations and customers are referenced with ON DELETE
  // RESTRICT, so the reservations must go first.
  if (createdEventIds.length > 0) {
    await db
      .delete(reservations)
      .where(inArray(reservations.eventId, createdEventIds));
    await db.delete(events).where(inArray(events.id, createdEventIds));
  }
  if (createdEmails.length > 0) {
    await db.delete(customers).where(inArray(customers.email, createdEmails));
  }
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error("\nUnexpected error during verification:", error);
} finally {
  try {
    await cleanup();
    console.log("\nCleanup: throwaway events, customers and reservations removed.");
  } catch (cleanupError) {
    failures += 1;
    console.error("Cleanup failed:", cleanupError);
  }
}

console.log(
  failures === 0
    ? "\nRESULT: PASS — the seat was sold exactly once under real concurrency."
    : `\nRESULT: FAIL — ${failures} assertion(s) did not hold.`,
);

await db.$client.end();
process.exit(failures === 0 ? 0 : 1);
