/**
 * T10 verification: read-time expiry of reservations against the REAL database.
 *
 * It exercises the REAL functions from `src/lib/reservations.ts`
 * (listReservationsForAdmin, getReservationForAdminById, getReservationByToken)
 * and the REAL seat count from `src/lib/events.ts` (getEventForAdminById) —
 * never a copy. Node 24 runs the TypeScript directly via type stripping, and a
 * `module.registerHooks` resolver teaches it the project's `@/` alias and its
 * extensionless imports, exactly like `scripts/verify-events-admin.mjs` and
 * `scripts/verify-reservations-admin.mjs`.
 *
 * Run: node scripts/verify-reservations-expiry.mjs
 *
 * Every row this script creates is deleted at the end (reservations first,
 * then events, then customers) and the cleanup is asserted against the
 * database by comparing whole-table row counts to a pre-run snapshot.
 */
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = new URL("../", import.meta.url);

/** Resolves `@/x` and extensionless relative imports to their `.ts` file. */
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
    const file = resolveTypeScript(specifier, context.fileURL ?? context.parentURL);
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

const {
  createReservation,
  listReservationsForAdmin,
  getReservationForAdminById,
  getReservationByToken,
  rejectReservation,
} = await import("../src/lib/reservations.ts");
const { getEventForAdminById } = await import("../src/lib/events.ts");
const { db } = await import("../src/db/index.ts");
const { events, customers, reservations } = await import("../src/db/schema.ts");
const { eq, inArray, sql } = await import("drizzle-orm");

if (!process.env.DATABASE_URL) {
  console.error(
    "FAIL: DATABASE_URL is not set. It must come from .env (see .env.example).",
  );
  process.exit(1);
}

const createdEventIds = [];
const createdCustomerIds = [];
const createdReservationIds = [];

let failures = 0;

function report(label, passed, detail) {
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

function check(label, passed, detail) {
  report(label, passed, detail ?? "assertion failed");
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function futureDate(days) {
  return new Date(Math.floor(Date.now() / SECOND) * SECOND + days * DAY);
}

const unique = () => randomUUID();

async function addEvent(overrides = {}) {
  const startsAt = overrides.startsAt ?? futureDate(7);
  const [row] = await db
    .insert(events)
    .values({
      title: `Verify T10 — ${overrides.title ?? "evento"}`,
      theme: null,
      description: null,
      location: null,
      startsAt,
      endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 2 * HOUR),
      capacity: 10,
      price: "1000.00",
      isPublished: false,
      ...overrides,
    })
    .returning({ id: events.id });
  createdEventIds.push(row.id);
  return row.id;
}

async function addCustomer(label, overrides = {}) {
  const email = `t10-verify-${label}-${unique()}@verify.test`;
  const [row] = await db
    .insert(customers)
    .values({
      fullName: `T10 Verify ${label}`,
      email,
      whatsapp: "+5491100000000",
      ...overrides,
    })
    .returning({ id: customers.id });
  createdCustomerIds.push(row.id);
  return row.id;
}

async function addReservation(eventId, customerId, status, overrides = {}) {
  const [row] = await db
    .insert(reservations)
    .values({
      eventId,
      customerId,
      status,
      publicToken: `t10-verify-${unique()}`,
      expiresAt: null,
      hasCondition: false,
      termsAcceptedAt: new Date(),
      ...overrides,
    })
    .returning({ id: reservations.id, publicToken: reservations.publicToken });
  createdReservationIds.push(row.id);
  return row;
}

/** Raw row straight from the table — no mapper, no filtering. */
async function rawReservation(id) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);
  return row ?? null;
}

/** Input for the real `createReservation`, shaped like the form schema. */
function reservationInput(email, label) {
  return {
    fullName: `T10 Verify ${label}`,
    email,
    whatsapp: "+5491100000000",
    hasHealthCondition: false,
    healthCondition: null,
    marketingConsent: false,
  };
}

// ---------------------------------------------------------------------------

/**
 * The bug T10 fixes: a `pending_no_receipt` whose timer already ran out must
 * read as `expired`, with the SAME stored status as a live hold, while a
 * `pending_review` never expires on the timer.
 */
async function scenarioCoreExpiryAndFilter() {
  console.log(
    "\nCore — timer-expired vs live hold share one stored status, and the panel filter follows the timer",
  );

  const eventId = await addEvent({ title: "core", capacity: 5 });

  const expired = await addReservation(
    eventId,
    await addCustomer("core-expired"),
    "pending_no_receipt",
    { expiresAt: new Date(Date.now() - 1 * HOUR) },
  );
  const live = await addReservation(
    eventId,
    await addCustomer("core-live"),
    "pending_no_receipt",
    { expiresAt: new Date(Date.now() + 30 * MINUTE) },
  );
  const review = await addReservation(
    eventId,
    await addCustomer("core-review"),
    "pending_review",
    // Deliberately ancient: the timer must NOT expire a `pending_review`.
    { expiresAt: new Date(Date.now() - 5 * HOUR) },
  );

  const rawExpired = await rawReservation(expired.id);
  const rawLive = await rawReservation(live.id);
  console.log(
    `  stored status: expired=${rawExpired.status} live=${rawLive.status}`,
  );
  check(
    "RED core: both rows are stored as 'pending_no_receipt'",
    rawExpired.status === "pending_no_receipt" &&
      rawLive.status === "pending_no_receipt",
    `expired=${rawExpired.status} live=${rawLive.status}`,
  );

  const all = await listReservationsForAdmin({ eventId });
  const byId = new Map(all.map((row) => [row.id, row]));
  const rowExpired = byId.get(expired.id);
  const rowLive = byId.get(live.id);
  const rowReview = byId.get(review.id);

  console.log(
    `  effectiveStatus: expired=${rowExpired?.effectiveStatus} live=${rowLive?.effectiveStatus} review=${rowReview?.effectiveStatus}`,
  );
  check(
    "RED core: the timer-expired hold reads as 'expired'",
    rowExpired?.effectiveStatus === "expired",
    `got ${JSON.stringify(rowExpired?.effectiveStatus)}`,
  );
  check(
    "RED core: the live hold still reads as 'pending_no_receipt'",
    rowLive?.effectiveStatus === "pending_no_receipt",
    `got ${JSON.stringify(rowLive?.effectiveStatus)}`,
  );
  check(
    "RED core: a stale `pending_review` does NOT read as 'expired'",
    rowReview?.effectiveStatus === "pending_review",
    `got ${JSON.stringify(rowReview?.effectiveStatus)}`,
  );
  check(
    "the raw stored status is still returned alongside the effective one",
    rowExpired?.status === "pending_no_receipt" && rowLive?.status === "pending_no_receipt",
    `expired=${rowExpired?.status} live=${rowLive?.status}`,
  );

  const filterExpired = await listReservationsForAdmin({
    eventId,
    status: "expired",
  });
  const filterExpiredIds = filterExpired.map((row) => row.id);
  console.log(
    `  filter {status: expired}: ${filterExpired.length} row(s)`,
  );
  check(
    "RED core: filtering 'expired' returns the timer-expired row",
    filterExpiredIds.includes(expired.id),
    `ids=${JSON.stringify(filterExpiredIds)}`,
  );
  check(
    "RED core: filtering 'expired' does NOT return the live hold or the review",
    !filterExpiredIds.includes(live.id) && !filterExpiredIds.includes(review.id),
    `ids=${JSON.stringify(filterExpiredIds)}`,
  );
  check(
    "every row returned by the 'expired' filter carries effectiveStatus 'expired'",
    filterExpired.length > 0 &&
      filterExpired.every((row) => row.effectiveStatus === "expired"),
    JSON.stringify(filterExpired.map((row) => row.effectiveStatus)),
  );

  const filterHold = await listReservationsForAdmin({
    eventId,
    status: "pending_no_receipt",
  });
  const filterHoldIds = filterHold.map((row) => row.id);
  console.log(
    `  filter {status: pending_no_receipt}: ${filterHold.length} row(s)`,
  );
  check(
    "RED core: filtering 'pending_no_receipt' returns the live hold",
    filterHoldIds.includes(live.id),
    `ids=${JSON.stringify(filterHoldIds)}`,
  );
  check(
    "RED core: filtering 'pending_no_receipt' does NOT return the timer-expired row",
    !filterHoldIds.includes(expired.id),
    `ids=${JSON.stringify(filterHoldIds)}`,
  );
  check(
    "filter badge agrees with the filter: every returned row is a live hold",
    filterHold.every((row) => row.effectiveStatus === "pending_no_receipt"),
    JSON.stringify(filterHold.map((row) => row.effectiveStatus)),
  );

  const detailExpired = await getReservationForAdminById(expired.id);
  const detailLive = await getReservationForAdminById(live.id);
  console.log(
    `  detail effectiveStatus: expired=${detailExpired?.effectiveStatus} live=${detailLive?.effectiveStatus}`,
  );
  check(
    "getReservationForAdminById projects the effective status too",
    detailExpired?.effectiveStatus === "expired" &&
      detailLive?.effectiveStatus === "pending_no_receipt",
    `expired=${detailExpired?.effectiveStatus} live=${detailLive?.effectiveStatus}`,
  );

  // The effective status must MIRROR the seat predicate, not diverge from it:
  // only the live hold and the pending_review hold occupy a seat, out of three
  // active rows (the timer-expired one released its seat on its own).
  const seatCount = await getEventForAdminById(eventId);
  console.log(`  occupied seats on the event: ${seatCount?.occupied}`);
  check(
    "the seat count matches the effective statuses (mirror of the seat predicate)",
    seatCount?.occupied === 2,
    `got ${seatCount?.occupied}`,
  );

  return { eventId, expired, live, review };
}

async function scenarioPublicToken(rows) {
  console.log(
    "\nPublic token — getReservationByToken reports the effective status and never leaks health data",
  );

  const expiredToken = await getReservationByToken(rows.expired.publicToken);
  const liveToken = await getReservationByToken(rows.live.publicToken);
  console.log(
    `  effectiveStatus: expired=${expiredToken?.effectiveStatus} live=${liveToken?.effectiveStatus}`,
  );
  check(
    "RED core: an expired hold's public page reads 'expired'",
    expiredToken?.effectiveStatus === "expired",
    `got ${JSON.stringify(expiredToken?.effectiveStatus)}`,
  );
  check(
    "RED core: a live hold's public page reads 'pending_no_receipt'",
    liveToken?.effectiveStatus === "pending_no_receipt",
    `got ${JSON.stringify(liveToken?.effectiveStatus)}`,
  );
  check(
    "the public lookup still returns the raw stored status",
    expiredToken?.status === "pending_no_receipt",
    `got ${JSON.stringify(expiredToken?.status)}`,
  );

  // A `pending_review` with declared transfer data and a receipt: the public page
  // needs those fields, and the health data must NOT travel with them.
  const eventId = await addEvent({ title: "public", capacity: 5 });
  const reviewRow = await addReservation(
    eventId,
    await addCustomer("public-review"),
    "pending_review",
    {
      expiresAt: new Date(Date.now() - 3 * HOUR),
      transferHolder: "Titular Público",
      transferAmount: "1000.00",
      transferDate: "2026-09-01",
      transferReference: "OP-PUBLIC",
      receiptPath: "receipts/t10-verify/public.png",
      hasCondition: true,
      conditionDetails: "Dato sensible que no debe salir",
    },
  );

  const publicRow = await getReservationByToken(reviewRow.publicToken);
  check("public lookup returns the row", publicRow !== null, "got null");
  if (publicRow) {
    check(
      "returns eventId (the public page needs it to link back)",
      publicRow.eventId === eventId,
      `got ${JSON.stringify(publicRow.eventId)}`,
    );
    check(
      "returns the declared transfer fields the page renders",
      publicRow.transferHolder === "Titular Público" &&
        publicRow.transferAmount === "1000.00" &&
        publicRow.transferDate === "2026-09-01" &&
        publicRow.transferReference === "OP-PUBLIC",
      JSON.stringify({
        holder: publicRow.transferHolder,
        amount: publicRow.transferAmount,
        date: publicRow.transferDate,
        reference: publicRow.transferReference,
      }),
    );
    check(
      "reports whether a receipt exists",
      publicRow.hasReceipt === true,
      `got ${JSON.stringify(publicRow.hasReceipt)}`,
    );
    check(
      "does NOT expose conditionDetails or hasCondition",
      !("conditionDetails" in publicRow) &&
        !("hasCondition" in publicRow) &&
        publicRow.conditionDetails === undefined,
      JSON.stringify(Object.keys(publicRow)),
    );
    check(
      "a stale `pending_review` reads as 'pending_review', not 'expired'",
      publicRow.effectiveStatus === "pending_review",
      `got ${JSON.stringify(publicRow.effectiveStatus)}`,
    );
  }

  const unknown = await getReservationByToken(`t10-verify-${unique()}-missing`);
  check("an unknown token returns null (the page 404s)", unknown === null, JSON.stringify(unknown));
}

/**
 * Criterion (h): a person whose hold expired can reserve the SAME event again.
 *
 * The seat predicate releases the seat on its own when the timer runs out, but
 * the stored status stays `pending_no_receipt`, so the partial unique index
 * would keep matching the dead hold and answer `already_reserved` forever.
 * `createReservation` materializes that row to `expired` before it inserts.
 */
async function scenarioReReservation() {
  console.log(
    "\nRe-reservation — an expired hold does not block the same person forever",
  );

  const eventId = await addEvent({
    title: "re-reserve",
    capacity: 5,
    isPublished: true,
  });

  const email = `t10-verify-re-reserve-${unique()}@verify.test`;
  const input = reservationInput(email, "Re-reserve");

  const first = await createReservation(eventId, input);
  console.log(`  createReservation #1 -> ${JSON.stringify(first)}`);
  check("the first reservation succeeds", first.ok === true, JSON.stringify(first));

  const rowOne = first.ok
    ? await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(eq(reservations.publicToken, first.publicToken))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;
  if (rowOne) createdReservationIds.push(rowOne.id);

  const occupiedBefore = await getEventForAdminById(eventId);
  console.log(`  occupied after #1: ${occupiedBefore?.occupied}`);
  check(
    "the hold occupies a seat",
    occupiedBefore?.occupied === 1,
    `got ${occupiedBefore?.occupied}`,
  );

  // Force the timer into the past. The seat predicate releases the seat on its
  // own; the STORED status is left as `pending_no_receipt`.
  await db
    .update(reservations)
    .set({ expiresAt: sql`now() - interval '1 hour'` })
    .where(eq(reservations.publicToken, first.ok ? first.publicToken : ""));

  const occupiedAfterExpiry = await getEventForAdminById(eventId);
  console.log(`  occupied after force-expire: ${occupiedAfterExpiry?.occupied}`);
  check(
    "the timer released the seat before any write",
    occupiedAfterExpiry?.occupied === 0,
    `got ${occupiedAfterExpiry?.occupied}`,
  );

  const second = await createReservation(eventId, input);
  console.log(
    `  createReservation #2 (same event, same email) -> ${JSON.stringify(second)}`,
  );
  check(
    "RED core: the same person can reserve again after the hold expired",
    second.ok === true,
    JSON.stringify(second),
  );

  if (rowOne) {
    const deadHold = await rawReservation(rowOne.id);
    console.log(`  stored status of the first row: ${deadHold?.status}`);
    check(
      "the dead hold was materialized to 'expired'",
      deadHold?.status === "expired",
      `got ${deadHold?.status}`,
    );
  }

  const occupiedAfterSecond = await getEventForAdminById(eventId);
  console.log(`  occupied after #2: ${occupiedAfterSecond?.occupied}`);
  check(
    "the second hold occupies exactly one seat",
    occupiedAfterSecond?.occupied === 1,
    `got ${occupiedAfterSecond?.occupied}`,
  );

  // Contrast: a real rejection frees the person too, through the same index.
  const rejectEmail = `t10-verify-re-reserve-reject-${unique()}@verify.test`;
  const [rejectCustomer] = await db
    .insert(customers)
    .values({
      fullName: "T10 Verify Re-reserve Reject",
      email: rejectEmail,
      whatsapp: "+5491100000000",
    })
    .returning({ id: customers.id });
  createdCustomerIds.push(rejectCustomer.id);

  const reviewRow = await addReservation(eventId, rejectCustomer.id, "pending_review", {
    expiresAt: null,
  });
  const rejected = await rejectReservation(reviewRow.id, "Pago no acreditado");
  check(
    "rejectReservation applies to the pending_review row",
    rejected === true,
    `got ${rejected}`,
  );

  const afterReject = await createReservation(
    eventId,
    reservationInput(rejectEmail, "Re-reserve Reject"),
  );
  console.log(`  createReservation after reject -> ${JSON.stringify(afterReject)}`);
  check(
    "a rejected reservation also does not block the same person",
    afterReject.ok === true,
    JSON.stringify(afterReject),
  );
}

// ---------------------------------------------------------------------------

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
  // Reservations and customers are referenced with ON DELETE RESTRICT, so the
  // reservations must go first, then the events, then the customers.
  if (createdEventIds.length > 0) {
    await db.delete(reservations).where(inArray(reservations.eventId, createdEventIds));
    await db.delete(events).where(inArray(events.id, createdEventIds));
  }
  if (createdReservationIds.length > 0) {
    await db.delete(reservations).where(inArray(reservations.id, createdReservationIds));
  }
  if (createdCustomerIds.length > 0) {
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  }
  // `createReservation` upserts its customer by email, so those rows are not in
  // `createdCustomerIds`. Reservations are already gone above, so the FK no
  // longer blocks; the marker deletes exactly what this script can own.
  await db.delete(customers).where(sql`${customers.email} like 't10-verify-%'`);
}

async function tableCounts() {
  const [e] = await db.select({ n: sql`count(*)::int` }).from(events);
  const [c] = await db.select({ n: sql`count(*)::int` }).from(customers);
  const [r] = await db.select({ n: sql`count(*)::int` }).from(reservations);
  return { events: e.n, customers: c.n, reservations: r.n };
}

async function assertClean(baseline) {
  let leftoverReservations = 0;
  let leftoverEvents = 0;
  let leftoverCustomers = 0;
  if (createdReservationIds.length > 0) {
    const [r] = await db
      .select({ n: sql`count(*)::int` })
      .from(reservations)
      .where(inArray(reservations.id, createdReservationIds));
    leftoverReservations = r.n;
  }
  if (createdEventIds.length > 0) {
    const [e] = await db
      .select({ n: sql`count(*)::int` })
      .from(events)
      .where(inArray(events.id, createdEventIds));
    leftoverEvents = e.n;
  }
  if (createdCustomerIds.length > 0) {
    const [c] = await db
      .select({ n: sql`count(*)::int` })
      .from(customers)
      .where(inArray(customers.id, createdCustomerIds));
    leftoverCustomers = c.n;
  }
  report(
    "cleanup left no rows behind (reservations, events, customers)",
    leftoverReservations === 0 && leftoverEvents === 0 && leftoverCustomers === 0,
    `reservations=${leftoverReservations} events=${leftoverEvents} customers=${leftoverCustomers}`,
  );

  const after = await tableCounts();
  report(
    "database row counts match the pre-run snapshot",
    after.events === baseline.events &&
      after.customers === baseline.customers &&
      after.reservations === baseline.reservations,
    `before=${JSON.stringify(baseline)} after=${JSON.stringify(after)}`,
  );

  const [markerEvents] = await db
    .select({ n: sql`count(*)::int` })
    .from(events)
    .where(sql`${events.title} like 'Verify T10%'`);
  const leftoverMarkerCustomers = await db
    .select({ email: customers.email })
    .from(customers)
    .where(sql`${customers.email} like 't10-verify-%'`);
  if (leftoverMarkerCustomers.length > 0) {
    console.log(
      `  note: leftover t10-verify customers: ${JSON.stringify(leftoverMarkerCustomers)}`,
    );
  }
  report(
    "no rows created by this script remain",
    markerEvents.n === 0 && leftoverMarkerCustomers.length === 0,
    `events=${markerEvents.n} customers=${leftoverMarkerCustomers.length}`,
  );
}

async function main() {
  console.log("T10 reservation expiry verification (real functions, real database)");
  console.log(`Database: ${maskedDatabaseUrl()}`);

  const rows = await scenarioCoreExpiryAndFilter();
  await scenarioPublicToken(rows);
  await scenarioReReservation();
}

const baseline = await tableCounts();
console.log(`Pre-run row counts: ${JSON.stringify(baseline)}`);

try {
  await main();
} catch (error) {
  failures += 1;
  console.error("\nUnexpected error during verification:", error);
} finally {
  try {
    await cleanup();
    await assertClean(baseline);
  } catch (cleanupError) {
    failures += 1;
    console.error("Cleanup failed:", cleanupError);
  }
}

console.log(
  failures === 0
    ? "\nRESULT: PASS — all T10 reservation expiry scenarios held against the real database."
    : `\nRESULT: FAIL — ${failures} assertion(s) did not hold.`,
);

await db.$client.end();
process.exit(failures === 0 ? 0 : 1);
