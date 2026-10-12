/**
 * T8 verification: admin event CRUD against the REAL database.
 *
 * It exercises the REAL functions from `src/lib/events.ts` (createEvent,
 * getEventForAdminById, listEventsForAdmin, updateEvent, setEventPublished,
 * getPublishedEventById, getUpcomingPublishedEvents) — never a copy. Node 24
 * runs the TypeScript directly via type stripping, and a `module.registerHooks`
 * resolver teaches it the project's `@/` alias and its extensionless imports,
 * exactly like `scripts/verify-concurrency.mjs`.
 *
 * Run: node scripts/verify-events-admin.mjs
 *
 * Every row this script creates is deleted at the end (reservations first,
 * then events, then customers) and the cleanup is asserted against the
 * database.
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

const {
  createEvent,
  getEventForAdminById,
  listEventsForAdmin,
  updateEvent,
  setEventPublished,
  getPublishedEventById,
  getUpcomingPublishedEvents,
} = await import("../src/lib/events.ts");
const { db } = await import("../src/db/index.ts");
const { events, customers, reservations } = await import("../src/db/schema.ts");
const { eq, inArray, sql } = await import("drizzle-orm");
const { eventSchema } = await import("../src/lib/event-schema.ts");

if (!process.env.DATABASE_URL) {
  console.error(
    "FAIL: DATABASE_URL is not set. It must come from .env (see .env.example).",
  );
  process.exit(1);
}

const createdEventIds = [];
const createdCustomerIds = [];

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

/** A Date at whole-second precision, `days` in the future (for exact round-trips). */
function futureDate(days) {
  return new Date(Math.floor(Date.now() / SECOND) * SECOND + days * DAY);
}

function newInput(overrides = {}) {
  const startsAt = overrides.startsAt ?? futureDate(7);
  return {
    title: "Verify admin — placeholder",
    theme: null,
    description: null,
    location: null,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * HOUR),
    capacity: 10,
    price: "1000.00",
    isPublished: false,
    ...overrides,
  };
}

async function addCustomer(label) {
  const email = `admin-verify-${label}-${randomUUID()}@verify.test`;
  const [row] = await db
    .insert(customers)
    .values({
      fullName: `Admin Verify ${label}`,
      email,
      whatsapp: "+5491100000000",
    })
    .returning({ id: customers.id });
  createdCustomerIds.push(row.id);
  return row.id;
}

async function addReservation(eventId, customerId, status, expiresAt = null) {
  await db.insert(reservations).values({
    eventId,
    customerId,
    status,
    publicToken: `admin-verify-${randomUUID()}`,
    expiresAt,
    hasCondition: false,
    termsAcceptedAt: new Date(),
  });
}

async function countReservations(eventId) {
  const [row] = await db
    .select({ n: sql`count(*)::int` })
    .from(reservations)
    .where(eq(reservations.eventId, eventId));
  return row.n;
}

function sameInstant(a, b) {
  return new Date(a).getTime() === new Date(b).getTime();
}

function sameMoment(row, expected) {
  return (
    row.title === expected.title &&
    row.capacity === expected.capacity &&
    row.price === expected.price &&
    row.isPublished === expected.isPublished &&
    sameInstant(row.startsAt, expected.startsAt) &&
    sameInstant(row.endsAt, expected.endsAt)
  );
}

// ---------------------------------------------------------------------------

async function scenarioValidation() {
  console.log(
    "\nSpec criterion (a) — eventSchema rejects invalid input server-side (real schema)",
  );
  const base = {
    title: "Ok",
    theme: "",
    description: "",
    location: "",
    startsAt: "2026-11-01T18:00",
    endsAt: "2026-11-01T20:00",
    capacity: "5",
    price: "1500",
    isPublished: "on",
  };

  check("rejects an empty title", !eventSchema.safeParse({ ...base, title: "" }).success, "accepted empty title");
  check(
    "rejects endsAt before startsAt",
    !eventSchema.safeParse({ ...base, endsAt: "2026-11-01T17:00" }).success,
    "accepted an inverted range",
  );
  check("rejects capacity 0", !eventSchema.safeParse({ ...base, capacity: "0" }).success, "accepted capacity 0");
  check("rejects a non-numeric price", !eventSchema.safeParse({ ...base, price: "abc" }).success, "accepted a non-numeric price");
  check("rejects price 0", !eventSchema.safeParse({ ...base, price: "0" }).success, "accepted price 0");

  const ok = eventSchema.safeParse(base);
  check("accepts a valid payload", ok.success, JSON.stringify(ok.error?.issues));
  if (ok.success) {
    check("price stays a string after validation", typeof ok.data.price === "string", `got ${typeof ok.data.price}`);
    check("startsAt becomes a Date instant", ok.data.startsAt instanceof Date, `got ${typeof ok.data.startsAt}`);
  }
}

async function scenarioHoldingStatuses() {
  console.log("\nHolding statuses — approved also occupies a seat");
  const input = newInput({ title: "Verify admin — approved holds", capacity: 3 });
  const id = await createEvent(input);
  createdEventIds.push(id);
  for (let i = 0; i < 2; i += 1) {
    const customerId = await addCustomer(`approved-hold-${i}`);
    await addReservation(id, customerId, "approved");
  }

  const refused = await updateEvent(id, { ...input, capacity: 1 });
  console.log(`  observed (2 approved -> capacity 1): ${JSON.stringify(refused)}`);
  check(
    "capacity 1 with 2 approved seats is refused",
    refused.ok === false && refused.reason === "capacity_below_occupied",
    JSON.stringify(refused),
  );
  const allowed = await updateEvent(id, { ...input, capacity: 2 });
  console.log(`  observed (2 approved -> capacity 2): ${JSON.stringify(allowed)}`);
  check("capacity 2 with 2 approved seats is allowed", allowed.ok === true, JSON.stringify(allowed));
}

async function scenario1and2() {
  console.log("\nScenario 1 — createEvent persists exactly what was asked");
  const input = newInput({
    title: "Verify admin — persist",
    theme: "Té",
    description: "Persistencia exacta",
    location: "Salón",
    capacity: 10,
    price: "15000.50",
    isPublished: false,
  });
  const id = await createEvent(input);
  createdEventIds.push(id);

  check("createEvent returns an id (string)", typeof id === "string" && id.length > 0, `got ${JSON.stringify(id)}`);

  const row = await getEventForAdminById(id);
  check("getEventForAdminById returns the row", row !== null, "got null");
  if (row) {
    check("title round-trips", row.title === input.title, `got ${JSON.stringify(row.title)}`);
    check("capacity round-trips", row.capacity === input.capacity, `got ${JSON.stringify(row.capacity)}`);
    check("price is a string", typeof row.price === "string", `got typeof ${typeof row.price}`);
    check("price round-trips", row.price === input.price, `got ${JSON.stringify(row.price)}`);
    check("startsAt is the same instant", sameInstant(row.startsAt, input.startsAt), `got ${row.startsAt?.toISOString?.()}`);
    check("endsAt is the same instant", sameInstant(row.endsAt, input.endsAt), `got ${row.endsAt?.toISOString?.()}`);
    check("isPublished round-trips", row.isPublished === input.isPublished, `got ${JSON.stringify(row.isPublished)}`);
  }

  console.log("\nScenario 2 — listEventsForAdmin includes the draft with seat counts");
  const holder = await addCustomer("list-holder");
  await addReservation(id, holder, "pending_review");

  const list = await listEventsForAdmin();
  const found = list.find((event) => event.id === id);
  check("the new draft event is in the admin list", found !== undefined, "not found");
  if (found) {
    check("the draft is marked isPublished=false", found.isPublished === false, `got ${found.isPublished}`);
    check("occupied counts the pending_review seat", found.occupied === 1, `got ${found.occupied}`);
    check("seatsAvailable follows capacity - occupied", found.seatsAvailable === 9, `got ${found.seatsAvailable}`);
  }

  console.log(
    "\nSpec criterion (b) — createEvent with isPublished=true appears in the public catalog",
  );
  const publishedStartsAt = futureDate(9);
  const publishedId = await createEvent(
    newInput({
      title: "Verify admin — published on create",
      capacity: 4,
      isPublished: true,
      startsAt: publishedStartsAt,
      endsAt: new Date(publishedStartsAt.getTime() + 2 * HOUR),
    }),
  );
  createdEventIds.push(publishedId);
  check(
    "getPublishedEventById returns the freshly published event",
    (await getPublishedEventById(publishedId)) !== null,
    "got null",
  );
  check(
    "getUpcomingPublishedEvents includes it",
    (await getUpcomingPublishedEvents()).some((event) => event.id === publishedId),
    "not found among upcoming events",
  );
}

async function scenario3and4() {
  const input = newInput({ title: "Verify admin — capacity guard", capacity: 5 });
  const id = await createEvent(input);
  createdEventIds.push(id);

  /*
   * A refusal can only be exercised when the new capacity is genuinely UNDER
   * the seats held. With one occupied seat, lowering the capacity to 2 is legal
   * under the spec rule ("never go below the occupied seats"), so the refusal
   * path would never run. Three seat-holding reservations make capacity 2 a
   * real violation and capacity 3 its exact boundary.
   */
  for (let i = 0; i < 3; i += 1) {
    const holder = await addCustomer(`guard-holder-${i}`);
    await addReservation(id, holder, "pending_review");
  }

  const before = await getEventForAdminById(id);

  console.log("\nScenario 3 — capacity guard refuses below occupied");
  const refused = await updateEvent(id, { ...input, title: "SHOULD NOT STICK", capacity: 2 });
  console.log(`  observed (3 occupied -> capacity 2): ${JSON.stringify(refused)}`);
  check(
    "returns { ok: false, reason: 'capacity_below_occupied' }",
    refused.ok === false && refused.reason === "capacity_below_occupied",
    JSON.stringify(refused),
  );
  const afterRefusal = await getEventForAdminById(id);
  check(
    "the row did NOT change",
    afterRefusal !== null && before !== null && sameMoment(afterRefusal, before),
    `before=${JSON.stringify(before)} after=${JSON.stringify(afterRefusal)}`,
  );

  console.log("\nScenario 4 — capacity equal to occupied is allowed");
  const boundary = await updateEvent(id, { ...input, capacity: 3 });
  console.log(`  observed (3 occupied -> capacity 3): ${JSON.stringify(boundary)}`);
  check("returns { ok: true }", boundary.ok === true, JSON.stringify(boundary));
  const afterBoundary = await getEventForAdminById(id);
  check("capacity is now 3", afterBoundary?.capacity === 3, `got ${afterBoundary?.capacity}`);
}

async function scenario5() {
  console.log("\nScenario 5 — an expired hold does not count toward occupied");
  const input = newInput({ title: "Verify admin — expired hold", capacity: 5 });
  const id = await createEvent(input);
  createdEventIds.push(id);

  const holder = await addCustomer("expired-holder");
  await addReservation(id, holder, "pending_review");

  const expiredCustomer = await addCustomer("expired-past");
  await addReservation(
    id,
    expiredCustomer,
    "pending_no_receipt",
    new Date(Date.now() - 1 * HOUR),
  );

  const observed = await updateEvent(id, { ...input, capacity: 1 });
  console.log(`  observed: ${JSON.stringify(observed)}`);
  check(
    "lowering capacity to 1 is allowed (only 1 genuine seat held)",
    observed.ok === true,
    JSON.stringify(observed),
  );
}

async function scenario6() {
  console.log("\nScenario 6 — cancelled / rejected / expired do not count toward occupied");
  const input = newInput({ title: "Verify admin — non-holding", capacity: 5 });
  const id = await createEvent(input);
  createdEventIds.push(id);

  const genuine = await addCustomer("non-holding-genuine");
  await addReservation(id, genuine, "pending_review");

  for (const status of ["cancelled", "rejected", "expired"]) {
    const customerId = await addCustomer(`non-holding-${status}`);
    await addReservation(id, customerId, status);
  }

  const observed = await updateEvent(id, { ...input, capacity: 1 });
  console.log(`  observed: ${JSON.stringify(observed)}`);
  check(
    "lowering capacity to 1 is allowed (non-holding rows ignored)",
    observed.ok === true,
    JSON.stringify(observed),
  );
}

async function scenario7() {
  console.log("\nScenario 7 — unpublish leaves reservations alone, republish restores");
  const startsAt = futureDate(10);
  const input = newInput({
    title: "Verify admin — publish toggle",
    capacity: 5,
    isPublished: true,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * HOUR),
  });
  const id = await createEvent(input);
  createdEventIds.push(id);

  const c1 = await addCustomer("publish-1");
  const c2 = await addCustomer("publish-2");
  await addReservation(id, c1, "pending_review");
  await addReservation(id, c2, "approved");

  const beforeUnpublish = await countReservations(id);
  check("the published event is visible publicly before unpublish", (await getPublishedEventById(id)) !== null, "got null");

  const returnedFalse = await setEventPublished(id, false);
  check("setEventPublished(id, false) returns true", returnedFalse === true, `got ${returnedFalse}`);
  check("getPublishedEventById returns null after unpublish", (await getPublishedEventById(id)) === null, "still visible");
  const afterUnpublish = await countReservations(id);
  check(
    "reservation row count is UNCHANGED by unpublishing",
    afterUnpublish === beforeUnpublish && afterUnpublish === 2,
    `before=${beforeUnpublish} after=${afterUnpublish}`,
  );

  const returnedTrue = await setEventPublished(id, true);
  check("setEventPublished(id, true) returns true", returnedTrue === true, `got ${returnedTrue}`);
  const republished = await getPublishedEventById(id);
  check("getPublishedEventById returns the event after republish", republished !== null, "got null");

  const upcoming = await getUpcomingPublishedEvents();
  check(
    "the republished event appears in getUpcomingPublishedEvents",
    upcoming.some((event) => event.id === id),
    "not found among upcoming events",
  );
}

async function scenario8and9() {
  console.log("\nScenario 8 — malformed ids (must not throw / 500)");
  const input = newInput({ title: "Verify admin — bad id", capacity: 3 });

  const badUpdate = await updateEvent("not-a-uuid", input);
  console.log(`  updateEvent(not-a-uuid): ${JSON.stringify(badUpdate)}`);
  check(
    "updateEvent returns { ok: false, reason: 'not_found' }",
    badUpdate.ok === false && badUpdate.reason === "not_found",
    JSON.stringify(badUpdate),
  );

  const badPublish = await setEventPublished("not-a-uuid", true);
  console.log(`  setEventPublished(not-a-uuid): ${JSON.stringify(badPublish)}`);
  check("setEventPublished returns false", badPublish === false, `got ${badPublish}`);

  const badRead = await getEventForAdminById("not-a-uuid");
  console.log(`  getEventForAdminById(not-a-uuid): ${JSON.stringify(badRead)}`);
  check("getEventForAdminById returns null", badRead === null, `got ${JSON.stringify(badRead)}`);

  console.log("\nScenario 9 — unknown but well-formed id");
  const unknown = randomUUID();
  const unknownUpdate = await updateEvent(unknown, input);
  console.log(`  updateEvent(<random uuid>): ${JSON.stringify(unknownUpdate)}`);
  check(
    "updateEvent returns not_found",
    unknownUpdate.ok === false && unknownUpdate.reason === "not_found",
    JSON.stringify(unknownUpdate),
  );
  const unknownPublish = await setEventPublished(unknown, true);
  console.log(`  setEventPublished(<random uuid>): ${JSON.stringify(unknownPublish)}`);
  check("setEventPublished returns false", unknownPublish === false, `got ${unknownPublish}`);
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

async function assertClean(baseline) {
  let leftoverReservations = 0;
  let leftoverEvents = 0;
  let leftoverCustomers = 0;
  if (createdEventIds.length > 0) {
    const [r] = await db
      .select({ n: sql`count(*)::int` })
      .from(reservations)
      .where(inArray(reservations.eventId, createdEventIds));
    leftoverReservations = r.n;
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

  // Independent audit: the whole database must be back to the row counts it had
  // before the script ran, and no verification marker may survive.
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
    .where(sql`${events.title} like 'Verify admin%'`);
  const leftoverMarkerCustomers = await db
    .select({ email: customers.email, createdAt: customers.createdAt })
    .from(customers)
    .where(sql`${customers.email} like 'admin-verify-%'`);
  if (leftoverMarkerCustomers.length > 0) {
    console.log(
      `  note: leftover admin-verify customers: ${JSON.stringify(leftoverMarkerCustomers)}`,
    );
  }
  report(
    "no rows created by this script remain",
    markerEvents.n === 0 && leftoverMarkerCustomers.length === 0,
    `events=${markerEvents.n} customers=${leftoverMarkerCustomers.length}`,
  );
}

async function main() {
  console.log("T8 admin event CRUD verification (real functions, real database)");
  console.log(`Database: ${maskedDatabaseUrl()}`);

  await scenarioValidation();
  await scenario1and2();
  await scenario3and4();
  await scenario5();
  await scenario6();
  await scenarioHoldingStatuses();
  await scenario7();
  await scenario8and9();
}

async function tableCounts() {
  const [e] = await db.select({ n: sql`count(*)::int` }).from(events);
  const [c] = await db.select({ n: sql`count(*)::int` }).from(customers);
  const [r] = await db.select({ n: sql`count(*)::int` }).from(reservations);
  return { events: e.n, customers: c.n, reservations: r.n };
}

const baseline = await tableCounts();

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
    ? "\nRESULT: PASS — all T8 admin event CRUD scenarios held against the real database."
    : `\nRESULT: FAIL — ${failures} assertion(s) did not hold.`,
);

await db.$client.end();
process.exit(failures === 0 ? 0 : 1);
