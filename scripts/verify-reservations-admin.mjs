/**
 * T9 verification: admin reservation management against the REAL database.
 *
 * It exercises the REAL functions from `src/lib/reservations.ts`
 * (listReservationsForAdmin, getReservationForAdminById, approveReservation,
 * rejectReservation) and the REAL seat counts from `src/lib/events.ts`
 * (getEventForAdminById) — never a copy. Node 24 runs the TypeScript directly
 * via type stripping, and a `module.registerHooks` resolver teaches it the
 * project's `@/` alias and its extensionless imports, exactly like
 * `scripts/verify-events-admin.mjs` and `scripts/verify-concurrency.mjs`.
 *
 * Run: node scripts/verify-reservations-admin.mjs
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
  listReservationsForAdmin,
  getReservationForAdminById,
  approveReservation,
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
      title: `Verify T9 — ${overrides.title ?? "evento"}`,
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
  const email = `t9-verify-${label}-${unique()}@verify.test`;
  const [row] = await db
    .insert(customers)
    .values({
      fullName: `T9 Verify ${label}`,
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
      publicToken: `t9-verify-${unique()}`,
      expiresAt: null,
      hasCondition: false,
      termsAcceptedAt: new Date(),
      ...overrides,
    })
    .returning({ id: reservations.id });
  createdReservationIds.push(row.id);
  return row.id;
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

function sameInstant(a, b) {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** snapshot of every column an approve/reject transition could touch. */
function lifecycle(row) {
  return {
    status: row.status,
    resolvedAt: row.resolvedAt,
    rejectionReason: row.rejectionReason,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    hasCondition: row.hasCondition,
    conditionDetails: row.conditionDetails,
  };
}

function sameLifecycle(a, b) {
  return (
    a.status === b.status &&
    sameInstant(a.resolvedAt, b.resolvedAt) &&
    a.rejectionReason === b.rejectionReason &&
    sameInstant(a.updatedAt, b.updatedAt) &&
    sameInstant(a.expiresAt, b.expiresAt) &&
    a.hasCondition === b.hasCondition &&
    a.conditionDetails === b.conditionDetails
  );
}

// ---------------------------------------------------------------------------

async function scenario1ApproveKeepsSeat() {
  console.log(
    "\nScenario 1 (criterion a) — approve does NOT change the seat count",
  );
  const eventId = await addEvent({ title: "approve-seat", capacity: 5 });
  const customerId = await addCustomer("approve-seat");
  const id = await addReservation(eventId, customerId, "pending_review");

  const before = await getEventForAdminById(eventId);
  console.log(
    `  occupied/seatsAvailable BEFORE: ${before.occupied}/${before.seatsAvailable}`,
  );

  const approved = await approveReservation(id);
  console.log(`  approveReservation -> ${approved}`);
  check("approveReservation returns true", approved === true, `got ${approved}`);

  const after = await getEventForAdminById(eventId);
  console.log(
    `  occupied/seatsAvailable AFTER:  ${after.occupied}/${after.seatsAvailable}`,
  );
  check(
    "occupied is IDENTICAL after approving",
    before.occupied === after.occupied,
    `before=${before.occupied} after=${after.occupied}`,
  );
  check(
    "seatsAvailable is IDENTICAL after approving",
    before.seatsAvailable === after.seatsAvailable,
    `before=${before.seatsAvailable} after=${after.seatsAvailable}`,
  );

  const row = await rawReservation(id);
  check("row status is 'approved'", row.status === "approved", `got ${row.status}`);
  check("row resolvedAt is set", row.resolvedAt !== null, `got ${row.resolvedAt}`);
}

async function scenario2RejectReleasesSeat() {
  console.log("\nScenario 2 (criterion b) — reject DOES release the seat");
  const eventId = await addEvent({ title: "reject-seat", capacity: 5 });
  const customerId = await addCustomer("reject-seat");
  const id = await addReservation(eventId, customerId, "pending_review");

  const before = await getEventForAdminById(eventId);
  console.log(
    `  occupied/seatsAvailable BEFORE: ${before.occupied}/${before.seatsAvailable}`,
  );

  const rejected = await rejectReservation(id, "Motivo de prueba");
  console.log(`  rejectReservation -> ${rejected}`);
  check("rejectReservation returns true", rejected === true, `got ${rejected}`);

  const after = await getEventForAdminById(eventId);
  console.log(
    `  occupied/seatsAvailable AFTER:  ${after.occupied}/${after.seatsAvailable}`,
  );
  check(
    "occupied decreased by exactly 1",
    before.occupied - after.occupied === 1,
    `before=${before.occupied} after=${after.occupied}`,
  );
  check(
    "seatsAvailable increased by exactly 1",
    after.seatsAvailable - before.seatsAvailable === 1,
    `before=${before.seatsAvailable} after=${after.seatsAvailable}`,
  );

  const row = await rawReservation(id);
  check("row status is 'rejected'", row.status === "rejected", `got ${row.status}`);
  check(
    "rejection_reason round-trips",
    row.rejectionReason === "Motivo de prueba",
    `got ${JSON.stringify(row.rejectionReason)}`,
  );
  check("row resolvedAt is set", row.resolvedAt !== null, `got ${row.resolvedAt}`);
}

async function scenario3RejectNoReason() {
  console.log("\nScenario 3 — reject with null reason stores NULL, not ''");
  const eventId = await addEvent({ title: "reject-null", capacity: 5 });
  const customerId = await addCustomer("reject-null");
  const id = await addReservation(eventId, customerId, "pending_review");

  const rejected = await rejectReservation(id, null);
  console.log(`  rejectReservation(id, null) -> ${rejected}`);
  check("rejectReservation returns true", rejected === true, `got ${rejected}`);

  const row = await rawReservation(id);
  check("row status is 'rejected'", row.status === "rejected", `got ${row.status}`);
  check(
    "rejection_reason is strictly null (not '')",
    row.rejectionReason === null,
    `got ${JSON.stringify(row.rejectionReason)}`,
  );
}

async function scenario4OnlyPendingReviewResolvable() {
  console.log(
    "\nScenario 4 (criterion c) — only pending_review can be resolved",
  );
  const eventId = await addEvent({ title: "only-pending", capacity: 10 });

  const cases = [];

  {
    const customerId = await addCustomer("only-no-receipt");
    const id = await addReservation(eventId, customerId, "pending_no_receipt", {
      expiresAt: new Date(Date.now() + 30 * MINUTE),
    });
    cases.push({ name: "pending_no_receipt (unexpired)", id });
  }
  {
    const customerId = await addCustomer("only-approved");
    const id = await addReservation(eventId, customerId, "approved", {
      resolvedAt: new Date(),
    });
    cases.push({ name: "approved", id });
  }
  {
    const customerId = await addCustomer("only-rejected");
    const id = await addReservation(eventId, customerId, "rejected", {
      resolvedAt: new Date(),
      rejectionReason: "ya rechazada",
    });
    cases.push({ name: "rejected", id });
  }

  for (const { name, id } of cases) {
    const before = lifecycle(await rawReservation(id));
    const approved = await approveReservation(id);
    const rejected = await rejectReservation(id, "no debería aplicar");
    const after = lifecycle(await rawReservation(id));
    console.log(
      `  ${name}: approve=${approved} reject=${rejected} status=${after.status} resolvedAt=${after.resolvedAt ? "set" : "null"} reason=${JSON.stringify(after.rejectionReason)}`,
    );
    check(`${name}: approveReservation returns false`, approved === false, `got ${approved}`);
    check(`${name}: rejectReservation returns false`, rejected === false, `got ${rejected}`);
    check(`${name}: row is COMPLETELY unchanged`, sameLifecycle(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
}

async function scenario5DoubleApply() {
  console.log("\nScenario 5 — double apply is a no-op");
  const eventId = await addEvent({ title: "double", capacity: 5 });
  const customerId = await addCustomer("double");
  const id = await addReservation(eventId, customerId, "pending_review");

  const first = await approveReservation(id);
  const afterFirst = lifecycle(await rawReservation(id));
  const second = await approveReservation(id);
  const afterSecond = lifecycle(await rawReservation(id));

  console.log(`  first approve -> ${first}; second approve -> ${second}`);
  check("first approveReservation returns true", first === true, `got ${first}`);
  check("second approveReservation returns false", second === false, `got ${second}`);
  check(
    "row unchanged between first and second apply",
    sameLifecycle(afterFirst, afterSecond),
    `first=${JSON.stringify(afterFirst)} second=${JSON.stringify(afterSecond)}`,
  );
}

async function scenario6MalformedId() {
  console.log("\nScenario 6 — malformed id never throws");
  const approved = await approveReservation("not-a-uuid");
  const rejected = await rejectReservation("not-a-uuid", null);
  const detail = await getReservationForAdminById("not-a-uuid");
  console.log(
    `  approve=${approved} reject=${rejected} detail=${JSON.stringify(detail)}`,
  );
  check("approveReservation('not-a-uuid') -> false", approved === false, `got ${approved}`);
  check("rejectReservation('not-a-uuid', null) -> false", rejected === false, `got ${rejected}`);
  check("getReservationForAdminById('not-a-uuid') -> null", detail === null, `got ${JSON.stringify(detail)}`);
}

async function scenario7UnknownUuid() {
  console.log("\nScenario 7 — unknown but well-formed uuid");
  const unknown = randomUUID();
  const approved = await approveReservation(unknown);
  const rejected = await rejectReservation(unknown, null);
  const detail = await getReservationForAdminById(unknown);
  console.log(
    `  approve=${approved} reject=${rejected} detail=${JSON.stringify(detail)}`,
  );
  check("approveReservation(<random uuid>) -> false", approved === false, `got ${approved}`);
  check("rejectReservation(<random uuid>, null) -> false", rejected === false, `got ${rejected}`);
  check("getReservationForAdminById(<random uuid>) -> null", detail === null, `got ${JSON.stringify(detail)}`);
}

async function scenario8ListShapeAndFilters() {
  console.log(
    "\nScenario 8 (criterion d) — listReservationsForAdmin shape + filters",
  );
  const eventA = await addEvent({ title: "list-A", capacity: 10 });
  const eventB = await addEvent({ title: "list-B", capacity: 10 });

  const mk = async (eventId, status, label, overrides = {}) => {
    const customerId = await addCustomer(label, {
      fullName: `List ${label}`,
      whatsapp: `+54911${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`,
    });
    return addReservation(eventId, customerId, status, overrides);
  };

  const a1 = await mk(eventA, "pending_review", "a-pr-1");
  const a2 = await mk(eventA, "pending_review", "a-pr-2");
  const a3 = await mk(eventA, "approved", "a-ap");
  const b1 = await mk(eventB, "pending_review", "b-pr");
  const b2 = await mk(eventB, "rejected", "b-rj", {
    resolvedAt: new Date(),
    receiptPath: "receipts/t9-verify/one.png",
  });

  const mine = new Set([a1, a2, a3, b1, b2]);

  const all = await listReservationsForAdmin({});
  const mineInAll = all.filter((r) => mine.has(r.id));
  console.log(`  no filter: ${all.length} rows total, ${mineInAll.length} of mine`);
  check(
    "no filter returns every one of my reservations",
    mineInAll.length === 5,
    `got ${mineInAll.length}`,
  );

  // Shape of every row: joins resolved + boolean hasReceipt + no health data.
  let shapeProblem = null;
  for (const row of all) {
    if (
      typeof row.eventTitle !== "string" ||
      row.eventTitle.length === 0 ||
      typeof row.customerFullName !== "string" ||
      row.customerFullName.length === 0 ||
      typeof row.customerEmail !== "string" ||
      row.customerEmail.length === 0 ||
      typeof row.customerWhatsapp !== "string" ||
      row.customerWhatsapp.length === 0 ||
      typeof row.hasReceipt !== "boolean"
    ) {
      shapeProblem = row;
      break;
    }
  }
  check(
    "every row has non-empty eventTitle/customerFullName/customerEmail/customerWhatsapp and boolean hasReceipt",
    shapeProblem === null,
    JSON.stringify(shapeProblem),
  );

  const leaked = all.find(
    (row) => "conditionDetails" in row || "hasCondition" in row,
  );
  check(
    "list rows expose NO health data (no conditionDetails / hasCondition key)",
    leaked === undefined,
    leaked ? JSON.stringify(Object.keys(leaked)) : "",
  );

  const leakedToken = all.find((row) => "publicToken" in row);
  check(
    "list rows do NOT leak the secret publicToken",
    leakedToken === undefined,
    leakedToken ? JSON.stringify(Object.keys(leakedToken)) : "",
  );

  const receiptRow = all.find((r) => r.id === b2);
  check(
    "hasReceipt === true when receipt_path is present",
    receiptRow && receiptRow.hasReceipt === true,
    JSON.stringify(receiptRow),
  );
  const noReceiptRow = all.find((r) => r.id === a1);
  check(
    "hasReceipt === false when receipt_path is null",
    noReceiptRow && noReceiptRow.hasReceipt === false,
    JSON.stringify(noReceiptRow),
  );

  const byEventA = await listReservationsForAdmin({ eventId: eventA });
  console.log(
    `  filter {eventId: A}: ${byEventA.length} rows, all eventId===A? ${byEventA.every((r) => r.eventId === eventA)}`,
  );
  check(
    "filter {eventId} returns only that event's rows",
    byEventA.every((r) => r.eventId === eventA),
    `foreign=${JSON.stringify(byEventA.filter((r) => r.eventId !== eventA).map((r) => r.id))}`,
  );
  check(
    "filter {eventId} includes all 3 of A's reservations",
    [a1, a2, a3].every((id) => byEventA.some((r) => r.id === id)) &&
      !byEventA.some((r) => r.id === b1 || r.id === b2),
    `ids=${JSON.stringify(byEventA.map((r) => r.id))}`,
  );

  const byPending = await listReservationsForAdmin({ status: "pending_review" });
  console.log(
    `  filter {status: pending_review}: ${byPending.length} rows, all pending_review? ${byPending.every((r) => r.status === "pending_review")}`,
  );
  check(
    "filter {status} returns only that status",
    byPending.every((r) => r.status === "pending_review"),
    `foreign=${JSON.stringify(byPending.filter((r) => r.status !== "pending_review").map((r) => r.id))}`,
  );
  check(
    "filter {status} includes my pending_review and excludes my others",
    [a1, a2, b1].every((id) => byPending.some((r) => r.id === id)) &&
      ![a3, b2].some((id) => byPending.some((r) => r.id === id)),
    `ids=${JSON.stringify(byPending.map((r) => r.id))}`,
  );

  const both = await listReservationsForAdmin({
    eventId: eventA,
    status: "pending_review",
  });
  console.log(
    `  filter {eventId: A, status: pending_review}: ${both.length} rows, ids=${JSON.stringify(both.map((r) => r.id))}`,
  );
  check(
    "both filters intersect (A + pending_review)",
    both.every((r) => r.eventId === eventA && r.status === "pending_review") &&
      both.some((r) => r.id === a1) &&
      both.some((r) => r.id === a2) &&
      !both.some((r) => r.id === a3 || r.id === b1),
    JSON.stringify(both.map((r) => r.id)),
  );
}

async function scenario9Detail() {
  console.log(
    "\nScenario 9 — getReservationForAdminById returns nested customer + event + health data",
  );
  const startsAt = futureDate(5);
  const eventId = await addEvent({
    title: "detail",
    theme: "Té de la tarde",
    location: "Salón principal",
    capacity: 8,
    price: "2500.50",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3 * HOUR),
  });
  const customerId = await addCustomer("detail", {
    fullName: "Detalle Verificado",
    whatsapp: "+5491133344455",
    marketingConsent: true,
    marketingConsentAt: new Date(),
  });
  const id = await addReservation(eventId, customerId, "pending_review", {
    hasCondition: true,
    conditionDetails: "Alergia a los frutos secos",
    transferHolder: "Detalle Verificado",
    transferAmount: "2500.50",
    transferReference: "OP-123456",
    receiptPath: "receipts/t9-verify/detail.png",
  });

  const detail = await getReservationForAdminById(id);
  console.log(`  detail.id=${detail?.id}`);
  check("returns the row", detail !== null, "got null");
  if (!detail) return;

  check("id matches", detail.id === id, `got ${detail.id}`);
  check(
    "status matches ('pending_review')",
    detail.status === "pending_review",
    `got ${detail.status}`,
  );
  check(
    "conditionDetails round-trips",
    detail.conditionDetails === "Alergia a los frutos secos",
    `got ${JSON.stringify(detail.conditionDetails)}`,
  );
  check("hasCondition is true", detail.hasCondition === true, `got ${detail.hasCondition}`);

  check(
    "nested customer values match what was inserted",
    detail.customer.fullName === "Detalle Verificado" &&
      detail.customer.whatsapp === "+5491133344455" &&
      detail.customer.marketingConsent === true &&
      detail.customer.marketingConsentAt !== null,
    JSON.stringify(detail.customer),
  );

  check(
    "nested event values match what was inserted",
    detail.event.id === eventId &&
      detail.event.title.includes("detail") &&
      detail.event.theme === "Té de la tarde" &&
      detail.event.location === "Salón principal" &&
      detail.event.capacity === 8 &&
      detail.event.price === "2500.50" &&
      sameInstant(detail.event.startsAt, startsAt),
    JSON.stringify(detail.event),
  );

  check(
    "declared transfer data round-trips",
    detail.transferHolder === "Detalle Verificado" &&
      detail.transferAmount === "2500.50" &&
      detail.transferReference === "OP-123456",
    JSON.stringify({
      h: detail.transferHolder,
      a: detail.transferAmount,
      r: detail.transferReference,
    }),
  );
}

async function supplementarySchemas() {
  console.log(
    "\nSupplementary — list filters / rejection reason schema (reservation-admin-schema.ts)",
  );
  const {
    parseAdminReservationFilters,
    rejectionSchema,
  } = await import("../src/lib/reservation-admin-schema.ts");

  const eventId = await addEvent({ title: "schema", capacity: 3 });

  const valid = parseAdminReservationFilters({ eventId, status: "approved" });
  console.log(`  valid filters -> ${JSON.stringify(valid)}`);
  check(
    "valid eventId + status survive parsing",
    valid.eventId === eventId && valid.status === "approved",
    JSON.stringify(valid),
  );

  const badStatus = parseAdminReservationFilters({ status: "whatever" });
  console.log(`  invalid status -> ${JSON.stringify(badStatus)}`);
  check(
    "invalid status is ignored (undefined), not rejected",
    badStatus.status === undefined && badStatus.eventId === undefined,
    JSON.stringify(badStatus),
  );

  const badEvent = parseAdminReservationFilters({ eventId: "not-a-uuid" });
  console.log(`  invalid eventId -> ${JSON.stringify(badEvent)}`);
  check(
    "malformed eventId is ignored (undefined)",
    badEvent.eventId === undefined,
    JSON.stringify(badEvent),
  );

  const emptyStrings = parseAdminReservationFilters({ eventId: "", status: "" });
  console.log(`  empty strings -> ${JSON.stringify(emptyStrings)}`);
  check(
    "empty strings (the 'all' option) become no filter",
    emptyStrings.eventId === undefined && emptyStrings.status === undefined,
    JSON.stringify(emptyStrings),
  );

  const repeated = parseAdminReservationFilters({
    status: ["approved", "rejected"],
  });
  check(
    "a repeated query param is dropped (firstValue only accepts a string)",
    repeated.status === undefined,
    JSON.stringify(repeated),
  );

  const empty = rejectionSchema.safeParse({ rejectionReason: "" });
  check(
    "empty rejection reason becomes null",
    empty.success && empty.data.rejectionReason === null,
    JSON.stringify(empty.success ? empty.data : empty.error.issues),
  );
  const spaces = rejectionSchema.safeParse({ rejectionReason: "   " });
  check(
    "whitespace-only rejection reason becomes null",
    spaces.success && spaces.data.rejectionReason === null,
    JSON.stringify(spaces.success ? spaces.data : spaces.error.issues),
  );
  const trimmed = rejectionSchema.safeParse({ rejectionReason: "  pago  " });
  check(
    "rejection reason is trimmed",
    trimmed.success && trimmed.data.rejectionReason === "pago",
    JSON.stringify(trimmed.success ? trimmed.data : trimmed.error.issues),
  );
  const tooLong = rejectionSchema.safeParse({
    rejectionReason: "x".repeat(501),
  });
  check(
    "rejection reason over 500 chars is rejected",
    tooLong.success === false,
    JSON.stringify(tooLong.success ? tooLong.data : "accepted"),
  );
  const missing = rejectionSchema.safeParse({ rejectionReason: null });
  console.log(
    `  rejectionReason: null -> ${missing.success ? JSON.stringify(missing.data) : "parse error " + JSON.stringify(missing.error.issues)}`,
  );
}

async function scenario10NewestFirst() {
  console.log("\nScenario 10 — listReservationsForAdmin is newest first");
  const eventId = await addEvent({ title: "order", capacity: 10 });
  const base = Date.now();

  const oldest = await addReservation(
    eventId,
    await addCustomer("order-oldest"),
    "approved",
    { createdAt: new Date(base - 30 * SECOND) },
  );
  const middle = await addReservation(
    eventId,
    await addCustomer("order-middle"),
    "approved",
    { createdAt: new Date(base - 20 * SECOND) },
  );
  const newest = await addReservation(
    eventId,
    await addCustomer("order-newest"),
    "approved",
    { createdAt: new Date(base - 10 * SECOND) },
  );

  const list = await listReservationsForAdmin({ eventId });
  const order = list
    .filter((r) => [oldest, middle, newest].includes(r.id))
    .map((r) => r.id);
  console.log(
    `  expected=[newest,middle,oldest] observed=${JSON.stringify(order.map((id) => (id === newest ? "newest" : id === middle ? "middle" : "oldest")))}`,
  );
  check(
    "rows come back newest createdAt first",
    JSON.stringify(order) === JSON.stringify([newest, middle, oldest]),
    JSON.stringify(order),
  );

  const times = list.map((r) => r.createdAt.getTime());
  const sorted = times.every((t, i) => i === 0 || times[i - 1] >= t);
  check("createdAt is non-increasing across the whole list", sorted, JSON.stringify(times));
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
  if (createdCustomerIds.length > 0) {
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  }
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
    .where(sql`${events.title} like 'Verify T9%'`);
  const leftoverMarkerCustomers = await db
    .select({ email: customers.email, createdAt: customers.createdAt })
    .from(customers)
    .where(sql`${customers.email} like 't9-verify-%'`);
  if (leftoverMarkerCustomers.length > 0) {
    console.log(
      `  note: leftover t9-verify customers: ${JSON.stringify(leftoverMarkerCustomers)}`,
    );
  }
  report(
    "no rows created by this script remain",
    markerEvents.n === 0 && leftoverMarkerCustomers.length === 0,
    `events=${markerEvents.n} customers=${leftoverMarkerCustomers.length}`,
  );
}

async function main() {
  console.log("T9 admin reservation management verification (real functions, real database)");
  console.log(`Database: ${maskedDatabaseUrl()}`);

  await scenario1ApproveKeepsSeat();
  await scenario2RejectReleasesSeat();
  await scenario3RejectNoReason();
  await scenario4OnlyPendingReviewResolvable();
  await scenario5DoubleApply();
  await scenario6MalformedId();
  await scenario7UnknownUuid();
  await scenario8ListShapeAndFilters();
  await scenario9Detail();
  await scenario10NewestFirst();
  await supplementarySchemas();
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
    ? "\nRESULT: PASS — all T9 admin reservation scenarios held against the real database."
    : `\nRESULT: FAIL — ${failures} assertion(s) did not hold.`,
);

await db.$client.end();
process.exit(failures === 0 ? 0 : 1);
