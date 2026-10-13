/**
 * T12 verification: admin client list + CSV export against the REAL database.
 *
 * It exercises the REAL functions from `src/lib/clients.ts`
 * (listClientsForAdmin, toClientsCsv) and the REAL filter parser from
 * `src/lib/reservation-admin-schema.ts` (parseAdminClientFilters) — never a
 * copy. Node 24 runs the TypeScript directly via type stripping, and a
 * `module.registerHooks` resolver teaches it the project's `@/` alias and its
 * extensionless imports, exactly like `scripts/verify-reservations-admin.mjs`
 * and `scripts/verify-events-admin.mjs`.
 *
 * Run: node scripts/verify-clients.mjs
 *
 * Data: three clients on distinct events (R1, the one-active-reservation-per-
 * person-and-event unique index, never bites because every seeded reservation
 * lives on its own event). The aggregates are compared against an independent
 * SQL oracle that re-encodes the seat-holding predicate from the stored status
 * plus the `expires_at` timer. Every row created here is deleted at the end and
 * the cleanup is asserted against whole-table row counts.
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

// The module under test is the NEW one: before T12 ships it cannot be resolved,
// which is the RED state this script is meant to record.
const { listClientsForAdmin, toClientsCsv } = await (async () => {
  try {
    return await import("../src/lib/clients.ts");
  } catch (error) {
    console.error(
      "RED: import of ../src/lib/clients.ts failed — module not implemented yet.",
    );
    console.error(`  ${error.code ?? ""} ${error.message ?? error}`);
    process.exit(1);
  }
})();

const { parseAdminClientFilters } = await import(
  "../src/lib/reservation-admin-schema.ts"
);
const { formatDateTime } = await import("../src/lib/format.ts");
const { db } = await import("../src/db/index.ts");
const { events, customers, reservations } = await import("../src/db/schema.ts");
const { inArray, sql } = await import("drizzle-orm");

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

/** Truncated to the second so timestamptz round-trips are exact. */
const base = Math.floor(Date.now() / SECOND) * SECOND;

function atOffset(secondsAgo) {
  return new Date(base - secondsAgo * SECOND);
}

const unique = () => randomUUID();

async function addEvent(overrides = {}) {
  const startsAt = overrides.startsAt ?? futureDate(7);
  const [row] = await db
    .insert(events)
    .values({
      title: `Verify T12 — ${overrides.title ?? "evento"}`,
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

/** Days from now, truncated to the second (same helper as the T9 script). */
function futureDate(days) {
  return new Date(Math.floor(Date.now() / SECOND) * SECOND + days * DAY);
}

const DAY = 24 * HOUR;

async function addCustomer(label, overrides = {}) {
  const email = `t12-verify-${label}-${unique()}@verify.test`;
  const [row] = await db
    .insert(customers)
    .values({
      fullName: `T12 Verify ${label}`,
      email,
      whatsapp: "+5491100000000",
      ...overrides,
    })
    .returning({ id: customers.id });
  createdCustomerIds.push(row.id);
  return row.id;
}

async function addReservation(eventId, customerId, status, overrides = {}) {
  await db.insert(reservations).values({
    eventId,
    customerId,
    status,
    publicToken: `t12-verify-${unique()}`,
    expiresAt: null,
    hasCondition: false,
    termsAcceptedAt: new Date(),
    ...overrides,
  });
}

function sameInstant(a, b) {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Independent SQL oracle: re-encodes the seat-holding predicate (stored status
 * plus the `expires_at` timer) in its own correlated subqueries instead of
 * reusing effectiveStatusSql, so the two implementations can disagree and the
 * test would catch it. Written as raw SQL with aliases: interpolating a column
 * into a drizzle `sql` subquery renders it without a table prefix, which would
 * let the inner `"id"` resolve to the reservation's own primary key.
 */
async function clientsOracle(ids) {
  return db.execute(sql`
    select c.id,
      (select count(*)::int from reservations r where r.customer_id = c.id) as total,
      (select count(*)::int from reservations r
        where r.customer_id = c.id and (
          r.status in ('pending_review', 'approved')
          or (r.status = 'pending_no_receipt' and r.expires_at > now())
        )) as active,
      (select max(r.created_at) from reservations r where r.customer_id = c.id) as last_at
    from customers c
    where c.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
}

// ---------------------------------------------------------------------------

async function scenarioAggregatesAndOrder() {
  console.log("\nScenario 1 (criterion a) — one row per client, right aggregates, newest activity first");

  // One event per reservation: the partial unique index (R1) keys on
  // (event_id, customer_id) and stored status, so it never trips here.
  const eA1 = await addEvent({ title: "clients-A-approved" });
  const eA2 = await addEvent({ title: "clients-A-pnr-future" });
  const eA3 = await addEvent({ title: "clients-A-rejected" });
  const eB = await addEvent({ title: "clients-B" });
  const eC = await addEvent({ title: "clients-C-overdue" });

  const clientA = await addCustomer("alpha", {
    fullName: "Alpha García",
    whatsapp: "+5491133311111",
  });
  const clientB = await addCustomer("beta", {
    fullName: "Beta Pérez",
    whatsapp: "+5491133322222",
  });
  const clientC = await addCustomer("gamma", {
    fullName: "Gamma López",
    whatsapp: "+5491133333333",
  });
  const ids = [clientA, clientB, clientC];
  const mine = new Set(ids);

  // Client A: approved + live hold (future expires_at) + rejected.
  await addReservation(eA1, clientA, "approved", {
    resolvedAt: atOffset(300),
    createdAt: atOffset(300),
  });
  await addReservation(eA2, clientA, "pending_no_receipt", {
    expiresAt: new Date(base + 10 * MINUTE),
    createdAt: atOffset(240),
  });
  await addReservation(eA3, clientA, "rejected", {
    resolvedAt: atOffset(90),
    createdAt: atOffset(90),
  });
  // Client B: pending_review (holds a seat forever).
  await addReservation(eB, clientB, "pending_review", {
    createdAt: atOffset(120),
  });
  // Client C: pending_no_receipt with an OVERDUE expires_at (explicit past
  // timestamp) — counts as a reservation but NOT as active: the timer must
  // fold through effectiveStatusSql into `expired`.
  await addReservation(eC, clientC, "pending_no_receipt", {
    expiresAt: atOffset(5 * MINUTE),
    createdAt: atOffset(60),
  });

  const list = await listClientsForAdmin({});
  console.log(`  listClientsForAdmin({}) returned ${list.length} rows`);

  const mineInList = list.filter((row) => mine.has(row.id));
  check(
    "no filter returns all three created clients",
    mineInList.length === 3,
    `got ${mineInList.length}: ${JSON.stringify(mineInList.map((r) => r.id))}`,
  );
  check(
    "list rows expose NO health data (no hasCondition / conditionDetails key) and no marketingConsent",
    mineInList.every(
      (row) =>
        !("hasCondition" in row) &&
        !("conditionDetails" in row) &&
        !("marketingConsent" in row),
    ),
    "health/marketing keys leaked",
  );

  const oracle = await clientsOracle(ids);
  const oracleById = new Map(oracle.map((row) => [row.id, row]));

  for (const row of mineInList) {
    const expected = oracleById.get(row.id);
    console.log(
      `  ${row.fullName}: total=${row.totalReservations} active=${row.activeReservations}`,
    );
    check(
      `aggregates match the independent SQL oracle (${row.fullName})`,
      expected &&
        row.totalReservations === expected.total &&
        row.activeReservations === expected.active &&
        sameInstant(row.lastReservationAt, expected.last_at),
      `row=${JSON.stringify(row)} oracle=${expected ? JSON.stringify(expected) : "missing"}`,
    );
  }

  check(
    "client A: total 3, active 2 (approved + live hold; rejected never holds)",
    mineInList.find((r) => r.id === clientA)?.totalReservations === 3 &&
      mineInList.find((r) => r.id === clientA)?.activeReservations === 2,
    JSON.stringify(mineInList.find((r) => r.id === clientA)),
  );
  check(
    "client B: total 1, active 1 (pending_review holds a seat)",
    mineInList.find((r) => r.id === clientB)?.totalReservations === 1 &&
      mineInList.find((r) => r.id === clientB)?.activeReservations === 1,
    JSON.stringify(mineInList.find((r) => r.id === clientB)),
  );
  check(
    "client C: total 1, active 0 (overdue hold is expired through the timer)",
    mineInList.find((r) => r.id === clientC)?.totalReservations === 1 &&
      mineInList.find((r) => r.id === clientC)?.activeReservations === 0,
    JSON.stringify(mineInList.find((r) => r.id === clientC)),
  );

  // Ordering: the most recent reservation wins, regardless of status.
  const order = mineInList.map((r) => r.id);
  const expectedOrder = [clientC, clientA, clientB];
  console.log(
    `  relative order observed=${JSON.stringify(order.map((id) => id === clientC ? "C" : id === clientA ? "A" : "B"))}`,
  );
  check(
    "clients come back newest-last-reservation first (C at -60s, A at -90s, B at -120s)",
    JSON.stringify(order) === JSON.stringify(expectedOrder),
    JSON.stringify(order),
  );
  check(
    "lastReservationAt is right for every client (max creation, not the first one)",
    sameInstant(mineInList.find((r) => r.id === clientA)?.lastReservationAt, atOffset(90)) &&
      sameInstant(mineInList.find((r) => r.id === clientB)?.lastReservationAt, atOffset(120)) &&
      sameInstant(mineInList.find((r) => r.id === clientC)?.lastReservationAt, atOffset(60)),
    JSON.stringify(mineInList.map((r) => [r.id, r.lastReservationAt])),
  );

  const times = list.map((r) => r.lastReservationAt?.getTime() ?? 0);
  check(
    "lastReservationAt is non-increasing across the whole list",
    times.every((t, i) => i === 0 || times[i - 1] >= t),
    JSON.stringify(times),
  );
}

async function scenarioSearch() {
  console.log("\nScenario 2 (criterion b) — search by name / email / whatsapp + literal %/_");

  const mine = new Set(createdCustomerIds);

  // Case-insensitive name fragment.
  const byName = await listClientsForAdmin({ search: "ALPHA" });
  console.log(`  search "ALPHA" -> ${byName.length} rows`);
  check(
    "name fragment matches only the expected client (case-insensitive)",
    byName.every((r) => mine.has(r.id)) &&
      byName.some((r) => r.fullName === "Alpha García") &&
      !byName.some((r) => r.fullName !== "Alpha García"),
    JSON.stringify(byName.map((r) => r.fullName)),
  );

  // Email fragment.
  const byEmail = await listClientsForAdmin({ search: "beta-" });
  console.log(`  search "beta-" -> ${byEmail.length} rows`);
  check(
    "email fragment matches only client B",
    byEmail.length === 1 && byEmail[0].fullName === "Beta Pérez",
    JSON.stringify(byEmail.map((r) => r.email)),
  );

  // WhatsApp fragment.
  const byWhatsapp = await listClientsForAdmin({ search: "3332" });
  console.log(`  search "3332" -> ${byWhatsapp.length} rows`);
  check(
    "whatsapp fragment matches only client B",
    byWhatsapp.length === 1 && byWhatsapp[0].fullName === "Beta Pérez",
    JSON.stringify(byWhatsapp.map((r) => r.whatsapp)),
  );

  // A literal % must never act as a wildcard: it matches nothing instead of
  // every client.
  const byPercent = await listClientsForAdmin({ search: "%" });
  console.log(`  search "%" -> ${byPercent.length} rows`);
  check(
    'a literal "%" matches nothing (escaping works, it cannot list everyone)',
    byPercent.length === 0,
    `got ${byPercent.length}`,
  );

  const byUnderscore = await listClientsForAdmin({ search: "_" });
  console.log(`  search "_" -> ${byUnderscore.length} rows`);
  check(
    'a literal "_" matches nothing (escaping works)',
    byUnderscore.length === 0,
    `got ${byUnderscore.length}`,
  );

  // A % in the middle of a term is escaped too.
  const byMixed = await listClientsForAdmin({ search: "a%a" });
  check(
    'a "%" inside a term cannot act as a wildcard',
    byMixed.length === 0,
    `got ${byMixed.length}`,
  );
}

async function scenarioCsv() {
  console.log("\nScenario 3 (criterion c) — toClientsCsv is pure, quoted, BOM + CRLF");

  const date = new Date("2026-05-10T21:30:00.000Z");
  const crafted = [
    {
      id: "1",
      fullName: `Doe, "Jr"\nSegunda línea`,
      email: "a@b.c",
      whatsapp: "+54 9 11 1111-2222",
      totalReservations: 2,
      activeReservations: 1,
      lastReservationAt: date,
    },
    {
      id: "2",
      fullName: "Rowe",
      email: "x@y.z",
      whatsapp: "",
      totalReservations: 0,
      activeReservations: 0,
      lastReservationAt: null,
    },
  ];

  const csv = toClientsCsv(crafted);
  check("BOM \\uFEFF prefixes the whole string", csv.charCodeAt(0) === 0xfeff, `first char ${csv.charCodeAt(0)}`);

  // The crafted row carries an embedded `\n` INSIDE a quoted field, so a line
  // regex cannot be used here: byte-exact equality is the only check that
  // proves the row separators are CRLF, the file ends with CRLF, every field
  // is quoted and inner quotes are doubled.
  const expectedCsv =
    '\uFEFF"Nombre","Email","WhatsApp","Reservas totales","Reservas activas","Última reserva"\r\n' +
    `"Doe, ""Jr""\nSegunda línea","a@b.c","+54 9 11 1111-2222","2","1","${formatDateTime(date)}"\r\n` +
    `"Rowe","x@y.z","","0","0",""\r\n`;
  check(
    "whole crafted CSV is byte-exact (BOM + CRLF rows + trailing CRLF + quoting + doubled quotes)",
    csv === expectedCsv,
    `expected=${JSON.stringify(expectedCsv)} got=${JSON.stringify(csv)}`,
  );

  const parsed = parseCsv(csv);
  check(
    "header row is exactly the six expected columns",
    JSON.stringify(parsed[0]) ===
      JSON.stringify([
        "Nombre",
        "Email",
        "WhatsApp",
        "Reservas totales",
        "Reservas activas",
        "Última reserva",
      ]),
    JSON.stringify(parsed[0]),
  );

  console.log(`  dirty field round-trips: ${JSON.stringify(parsed[1]?.[0])}`);
  check(
    'a field with comma, double quote and newline round-trips (quoted, "" doubled)',
    parsed[1][0] === `Doe, "Jr"\nSegunda línea`,
    JSON.stringify(parsed[1]?.[0]),
  );
  check(
    "plain fields round-trip unquoted-equivalent",
    parsed[1][1] === "a@b.c" &&
      parsed[1][2] === "+54 9 11 1111-2222" &&
      parsed[1][3] === "2" &&
      parsed[1][4] === "1",
    JSON.stringify(parsed[1]),
  );
  check(
    "dates are formatted with formatDateTime, not raw ISO",
    parsed[1][5] === formatDateTime(date) && parsed[1][5] !== date.toISOString(),
    `got ${JSON.stringify(parsed[1][5])}`,
  );
  check(
    "a null lastReservationAt renders an empty quoted field",
    parsed[2][5] === "",
    JSON.stringify(parsed[2]),
  );
  check(
    "whole-file parse-back equals the input rows (dates via formatDateTime)",
    JSON.stringify(parsed.slice(1)) ===
      JSON.stringify([
        [
          `Doe, "Jr"\nSegunda línea`,
          "a@b.c",
          "+54 9 11 1111-2222",
          "2",
          "1",
          formatDateTime(date),
        ],
        ["Rowe", "x@y.z", "", "0", "0", ""],
      ]),
    JSON.stringify(parsed),
  );

  const empty = toClientsCsv([]);
  check(
    "empty input yields BOM + header + trailing CRLF and nothing else",
    empty ===
      '\uFEFF"Nombre","Email","WhatsApp","Reservas totales","Reservas activas","Última reserva"\r\n',
    JSON.stringify(empty),
  );
}

/** Minimal RFC-4180-ish parser: quoted fields, "" escapes, CRLF row endings. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function scenarioSchema() {
  console.log("\nScenario 4 — parseAdminClientFilters drops anything invalid");

  const trimmed = parseAdminClientFilters({ search: "  Alpha  " });
  console.log(`  "  Alpha  " -> ${JSON.stringify(trimmed)}`);
  check("search is trimmed", trimmed.search === "Alpha", JSON.stringify(trimmed));

  const tooLong = parseAdminClientFilters({ search: "x".repeat(101) });
  check(
    "a search over 100 chars is ignored (undefined), not a 500",
    tooLong.search === undefined,
    JSON.stringify(tooLong),
  );

  const repeated = parseAdminClientFilters({ search: ["a", "b"] });
  check(
    "a repeated query param is dropped (firstValue only accepts a string)",
    repeated.search === undefined,
    JSON.stringify(repeated),
  );

  const absent = parseAdminClientFilters({});
  check("a missing search param stays undefined", absent.search === undefined, JSON.stringify(absent));

  const empty = parseAdminClientFilters({ search: "" });
  check("an empty search is falsy (no filter applied)", !empty.search, JSON.stringify(empty));
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
  const [markerEvents] = await db
    .select({ n: sql`count(*)::int` })
    .from(events)
    .where(sql`${events.title} like 'Verify T12%'`);
  const [markerReservations] = await db
    .select({ n: sql`count(*)::int` })
    .from(reservations)
    .where(sql`${reservations.publicToken} like 't12-verify-%'`);
  const leftoverMarkerCustomers = await db
    .select({ email: customers.email })
    .from(customers)
    .where(sql`${customers.email} like 't12-verify-%'`);
  if (leftoverMarkerCustomers.length > 0) {
    console.log(
      `  note: leftover t12-verify customers: ${JSON.stringify(leftoverMarkerCustomers)}`,
    );
  }
  report(
    "no rows created by this script remain",
    markerEvents.n === 0 &&
      markerReservations.n === 0 &&
      leftoverMarkerCustomers.length === 0,
    `events=${markerEvents.n} reservations=${markerReservations.n} customers=${leftoverMarkerCustomers.length}`,
  );

  const after = await tableCounts();
  report(
    "database row counts match the pre-run snapshot",
    after.events === baseline.events &&
      after.customers === baseline.customers &&
      after.reservations === baseline.reservations,
    `before=${JSON.stringify(baseline)} after=${JSON.stringify(after)}`,
  );
}

async function main() {
  console.log("T12 client list + CSV export verification (real functions, real database)");
  console.log(`Database: ${maskedDatabaseUrl()}`);

  await scenarioAggregatesAndOrder();
  await scenarioSearch();
  await scenarioCsv();
  await scenarioSchema();
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
    ? "\nRESULT: PASS — all T12 client list and CSV scenarios held against the real database."
    : `\nRESULT: FAIL — ${failures} assertion(s) did not hold.`,
);

await db.$client.end();
process.exit(failures === 0 ? 0 : 1);