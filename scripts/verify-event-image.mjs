/**
 * Event image verification against the REAL database.
 *
 * It exercises the REAL functions from `src/lib/events.ts` (createEvent,
 * setEventImage, getEventForAdminById, getPublishedEventById,
 * getUpcomingPublishedEvents) and the REAL URL helpers from
 * `src/lib/storage.ts` — never a copy. Node runs the TypeScript directly via
 * type stripping, and a `module.registerHooks` resolver teaches it the
 * project's `@/` alias and its extensionless imports, exactly like
 * `scripts/verify-events-admin.mjs`.
 *
 * The storage helpers are pure string logic over the public URL space, so they
 * are checked with a configured-but-fake Supabase host. Nothing here talks to
 * Supabase and nothing here needs a real bucket: the real upload path is
 * exercised in the browser, and this script does NOT claim to cover it.
 *
 * Run: node scripts/verify-event-image.mjs
 *
 * Every row this script creates is deleted at the end and the cleanup is
 * asserted against the database.
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

/*
 * `src/db/index.ts` loads `.env` by itself, as an import side effect, and the
 * other verification scripts rely on exactly that. It has to be imported FIRST,
 * so the environment is complete before anything else reads it.
 */
const { db } = await import("../src/db/index.ts");
const { events } = await import("../src/db/schema.ts");
const { eq, inArray, isNotNull, sql } = await import("drizzle-orm");

const projectRootPath = fileURLToPath(projectRoot);

if (!process.env.DATABASE_URL) {
  console.error(
    "FAIL: DATABASE_URL is not set. It must come from .env (see .env.example).",
  );
  process.exit(1);
}

/*
 * `src/lib/storage.ts` reads the Supabase URL once, at module load, and the
 * local `.env` leaves it empty. The URL helpers ARE the thing under test here,
 * so a stand-in host is installed before that module is imported. A real project
 * URL would exercise exactly the same string logic; only the host inside the
 * expected string changes, and it is read back from the module below.
 */
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = "https://verify-project.supabase.co";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "verify-service-role-key";
}

const {
  createEvent,
  setEventImage,
  setEventPublished,
  getEventForAdminById,
  getPublishedEventById,
  getUpcomingPublishedEvents,
} = await import("../src/lib/events.ts");
const {
  getEventImagePublicUrl,
  eventImagePathFromPublicUrl,
  isEventImagePublicUrlForEvent,
} = await import("../src/lib/storage.ts");

// Read the base back from the module under test instead of rebuilding it here,
// so this script cannot disagree with the code about the URL shape.
const EVENT_IMAGES_BASE = getEventImagePublicUrl("");
const RECEIPTS_BASE = EVENT_IMAGES_BASE.replace("/event-images/", "/receipts/");

const createdEventIds = [];
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

function newInput(overrides = {}) {
  const startsAt = overrides.startsAt ?? futureDate(7);
  return {
    title: "Verify event image — placeholder",
    theme: "Acuarela",
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

/** Reads the raw column, bypassing every wrapper. */
async function rawImageUrl(eventId) {
  const [row] = await db
    .select({ imageUrl: events.imageUrl })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return row ? row.imageUrl : undefined;
}

async function countEvents() {
  const [row] = await db
    .select({ total: sql`count(*)::int` })
    .from(events);
  return row.total;
}

// ---------------------------------------------------------------------------

console.log("Scenario 1 — public URL helpers (pure logic, fake Supabase host)");

const eventIdA = randomUUID();
const eventIdB = randomUUID();
const goodUrl = `${EVENT_IMAGES_BASE}event-${eventIdA}/1700000000000.jpg`;

check(
  "getEventImagePublicUrl builds the documented public path",
  getEventImagePublicUrl(`event-${eventIdA}/1700000000000.jpg`) === goodUrl,
  `got ${getEventImagePublicUrl(`event-${eventIdA}/1700000000000.jpg`)}`,
);

check(
  "a URL of this event's folder is accepted",
  isEventImagePublicUrlForEvent(goodUrl, eventIdA) === true,
);

check(
  "the same URL is rejected for a different event",
  isEventImagePublicUrlForEvent(goodUrl, eventIdB) === false,
);

check(
  "a foreign host is rejected",
  isEventImagePublicUrlForEvent(
    `https://evil.example.com/storage/v1/object/public/event-images/event-${eventIdA}/x.jpg`,
    eventIdA,
  ) === false,
);

check(
  "another bucket on our host is rejected",
  isEventImagePublicUrlForEvent(
    `${RECEIPTS_BASE}event-${eventIdA}/x.jpg`,
    eventIdA,
  ) === false,
);

check(
  "a folder with no object is rejected",
  isEventImagePublicUrlForEvent(`${EVENT_IMAGES_BASE}event-${eventIdA}/`, eventIdA) === false,
);

check(
  "a traversal path is rejected",
  isEventImagePublicUrlForEvent(
    `${EVENT_IMAGES_BASE}event-${eventIdA}/../event-${eventIdB}/x.jpg`,
    eventIdA,
  ) === false,
);

check(
  "garbage is rejected",
  isEventImagePublicUrlForEvent("", eventIdA) === false &&
    isEventImagePublicUrlForEvent("not a url", eventIdA) === false,
);

check(
  "the object path is recovered from a stored URL",
  eventImagePathFromPublicUrl(goodUrl) === `event-${eventIdA}/1700000000000.jpg`,
  `got ${eventImagePathFromPublicUrl(goodUrl)}`,
);

check(
  "the object path is null for a foreign URL",
  eventImagePathFromPublicUrl("https://evil.example.com/x.jpg") === null,
);

console.log("");
console.log("Scenario 2 — a fresh event has no photo");

const beforeEvents = await countEvents();

const eventId = await createEvent(newInput());
createdEventIds.push(eventId);

const fresh = await getEventForAdminById(eventId);
check("createEvent stores a null image", fresh?.imageUrl === null, `got ${fresh?.imageUrl}`);
check("the raw column is null", (await rawImageUrl(eventId)) === null);

console.log("");
console.log("Scenario 3 — setEventImage writes the column");

const setOk = await setEventImage(eventId, goodUrl);
check("setEventImage returns true for an existing event", setOk === true);
check("the raw column holds the URL", (await rawImageUrl(eventId)) === goodUrl);

const adminWithImage = await getEventForAdminById(eventId);
check(
  "the admin read carries the image",
  adminWithImage?.imageUrl === goodUrl,
  `got ${adminWithImage?.imageUrl}`,
);

console.log("");
console.log("Scenario 4 — the public catalog carries the image");

await setEventPublished(eventId, true);

const publicOne = await getPublishedEventById(eventId);
check(
  "getPublishedEventById carries the image",
  publicOne?.imageUrl === goodUrl,
  `got ${publicOne?.imageUrl}`,
);

const upcoming = await getUpcomingPublishedEvents();
const inCatalog = upcoming.find((row) => row.id === eventId);
check(
  "getUpcomingPublishedEvents carries the image",
  inCatalog?.imageUrl === goodUrl,
  `got ${inCatalog?.imageUrl}`,
);

console.log("");
console.log("Scenario 5 — clearing the photo goes back to null");

const cleared = await setEventImage(eventId, null);
check("setEventImage(null) returns true", cleared === true);
check("the raw column is null again", (await rawImageUrl(eventId)) === null);

const adminCleared = await getEventForAdminById(eventId);
check("the admin read is null again", adminCleared?.imageUrl === null);
check(
  "the public read is null again",
  (await getPublishedEventById(eventId))?.imageUrl === null,
);

console.log("");
console.log("Scenario 6 — malformed and unknown ids (must not throw / 500)");

check(
  "setEventImage(not-a-uuid) returns false without throwing",
  (await setEventImage("not-a-uuid", goodUrl)) === false,
);

check(
  "setEventImage(<random uuid>) returns false",
  (await setEventImage(randomUUID(), goodUrl)) === false,
);

check(
  "a bad id did not write anything",
  (await countEvents()) === beforeEvents + createdEventIds.length,
);

console.log("");
console.log(
  "Scenario 7 — a local sample image resolves to a real file (case-sensitive)",
);

/*
 * Sample photos live in `public/` and are stored as `/Name.webp`. Windows and
 * macOS resolve those names ignoring case, so a wrong-case path works in local
 * development and 404s on Vercel, which runs Linux. The on-disk name is compared
 * exactly, not through `existsSync` alone.
 */
const localSamples = (
  await db
    .select({ title: events.title, imageUrl: events.imageUrl })
    .from(events)
    .where(isNotNull(events.imageUrl))
).filter((row) => row.imageUrl.startsWith("/"));

console.log(`  INFO  ${localSamples.length} event(s) point at a file in public/`);

for (const row of localSamples) {
  const full = path.join(projectRootPath, "public", row.imageUrl);
  check(
    `"${row.title}" -> ${row.imageUrl} exists`,
    fs.existsSync(full),
    "no such file in public/",
  );
  const names = fs.existsSync(path.dirname(full))
    ? fs.readdirSync(path.dirname(full))
    : [];
  check(
    `"${row.title}" -> ${row.imageUrl} matches the on-disk name exactly`,
    names.includes(path.basename(full)),
    "the name differs from the file on disk; Linux is case-sensitive",
  );
}

console.log("");
console.log("Scenario 8 — cleanup");

await db.delete(events).where(inArray(events.id, createdEventIds));
const leftovers = await db
  .select({ id: events.id })
  .from(events)
  .where(inArray(events.id, createdEventIds));

check("no rows created by this script remain", leftovers.length === 0);
check(
  "database row count matches the pre-run snapshot",
  (await countEvents()) === beforeEvents,
);

console.log("");
if (failures > 0) {
  console.log(`RESULT: FAIL — ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log(
  "RESULT: PASS — the event image column, the admin read, the public read and the URL validation all held against the real database.",
);
console.log(
  "NOT COVERED: the real Storage upload (mint signed URL, browser PUT, bucket read). There is no Supabase project configured locally.",
);
