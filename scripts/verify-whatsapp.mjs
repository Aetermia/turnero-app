/**
 * T11 verification: one-tap WhatsApp deep link and pre-built messages.
 *
 * It imports the REAL functions from `src/lib/whatsapp.ts`
 * (normalizeWhatsAppNumber, buildWhatsAppDeepLink,
 * buildReservationWhatsAppMessage) and the REAL formatters from
 * `src/lib/format.ts` — never a copy. These are pure functions, so this script
 * does NOT touch the database.
 *
 * Node 24 runs the TypeScript directly via type stripping, and a
 * `module.registerHooks` resolver teaches it the project's `@/` alias and its
 * extensionless imports, exactly like the other `scripts/verify-*.mjs`.
 *
 * Run: node scripts/verify-whatsapp.mjs
 *
 * Exercises:
 *  - the phone normalization table (00/0/15 prefixes, 54 prepend, junk stripped);
 *  - the deep link shape and the exact encode/decode round-trip of the message;
 *  - that a non-plausible number yields `null` instead of a broken link;
 *  - that every effective status produces a message with the first name and the
 *    event title, and the per-state details (deadline, rejection reason, alias
 *    fallback) land where they should.
 */
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  normalizeWhatsAppNumber,
  buildWhatsAppDeepLink,
  buildReservationWhatsAppMessage,
} = await import("../src/lib/whatsapp.ts");
const { formatDateTime, formatEventDate, formatEventTime } = await import(
  "../src/lib/format.ts"
);

let failures = 0;

function check(label, ok) {
  if (!ok) {
    failures += 1;
    console.error(`  FAIL: ${label}`);
  } else {
    console.log(`  ok: ${label}`);
  }
}

// --- Normalization table ---------------------------------------------------

const normalizationTable = [
  ["11 5555-6666", "541155556666"],
  ["011-5555-6666", "541155556666"],
  ["+54 9 11 5555 6666", "5491155556666"],
  ["5491155556666", "5491155556666"],
  ["15 5555 6666", "5455556666"],
  ["0054 9 11 5555-6666", "5491155556666"],
  ["+54 (11) 5555-6666 con letras y espacios", "541155556666"],
];

for (const [raw, expected] of normalizationTable) {
  const actual = normalizeWhatsAppNumber(raw);
  check(`normalize("${raw}") -> "${actual}"`, actual === expected);
}

// --- Deep link -------------------------------------------------------------

const message = "¡Hola María! Tu reserva está CONFIRMADA. ¡Gracias!";
const link = buildWhatsAppDeepLink("11 5555-6666", message);
const expectedPrefix = "https://wa.me/541155556666?text=";
check("link starts with https://wa.me/<digits>?text=", link?.startsWith(expectedPrefix) === true);
check("link contains ?text=", link?.includes("?text=") === true);

if (link) {
  const marker = "?text=";
  const rawParam = link.slice(link.indexOf(marker) + marker.length);
  check(
    "decoded ?text= is EXACTLY the message (round-trip)",
    decodeURIComponent(rawParam) === message,
  );
  check(
    "encoded ?text= is encodeURIComponent(message)",
    rawParam === encodeURIComponent(message),
  );
} else {
  check("decoded ?text= is EXACTLY the message (round-trip)", false);
}

const mobileLink = buildWhatsAppDeepLink("+54 9 11 5555 6666", "Hola");
check(
  "13-digit number keeps 549 + 11 digits",
  mobileLink?.startsWith("https://wa.me/5491155556666?text=") === true,
);

for (const bad of ["555666", "54911555566", "54911555566666", "abc", ""]) {
  const result = buildWhatsAppDeepLink(bad, "Hola");
  check(`non-plausible number "${bad}" -> null`, result === null);
}

// --- Per-state messages ----------------------------------------------------

const eventStartsAt = new Date("2026-11-21T18:00:00-03:00");
const expiresAt = new Date("2026-11-21T18:30:00-03:00");
const baseInput = (overrides = {}) => ({
  fullName: "María Elena García",
  eventTitle: "Taller de cerámica",
  eventStartsAt,
  eventPrice: "$ 15.000,00",
  expiresAt,
  rejectionReason: null,
  paymentAlias: "casa.de.anton.mp",
  effectiveStatus: "pending_no_receipt",
  ...overrides,
});

const statuses = [
  "pending_no_receipt",
  "pending_review",
  "approved",
  "rejected",
  "expired",
  "cancelled",
];

for (const status of statuses) {
  const input = baseInput({ effectiveStatus: status });
  const msg = buildReservationWhatsAppMessage(input);
  check(`${status}: contains first name`, msg.includes("María"));
  check(`${status}: contains event title`, msg.includes("Taller de cerámica"));
}

const hold = buildReservationWhatsAppMessage(baseInput());
check(
  "pending_no_receipt: mentions the deadline date when expiresAt is given",
  hold.includes(formatDateTime(expiresAt)),
);
check("pending_no_receipt: mentions the price", hold.includes("$ 15.000,00"));
check(
  "pending_no_receipt: uses the payment alias",
  hold.includes("casa.de.anton.mp"),
);

const holdNoExpiry = buildReservationWhatsAppMessage(
  baseInput({ expiresAt: null }),
);
check(
  "pending_no_receipt with null deadline: keeps the release sentence",
  holdNoExpiry.includes("el lugar se libera solo"),
);
check(
  "pending_no_receipt with null deadline: no dangling 'antes del' date",
  !holdNoExpiry.includes("antes del"),
);

const holdNoAlias = buildReservationWhatsAppMessage(
  baseInput({ paymentAlias: null }),
);
check(
  "pending_no_receipt with null alias: fallback phrasing",
  holdNoAlias.includes("al alias que te pasamos por este chat"),
);

const rejectedWithReason = buildReservationWhatsAppMessage(
  baseInput({
    effectiveStatus: "rejected",
    rejectionReason: "El comprobante no se ve bien.",
  }),
);
check(
  "rejected: embeds the rejection reason",
  rejectedWithReason.includes("El comprobante no se ve bien."),
);

const rejectedWithoutReason = buildReservationWhatsAppMessage(
  baseInput({ effectiveStatus: "rejected", rejectionReason: null }),
);
check(
  "rejected without reason: omits the reason sentence",
  !rejectedWithoutReason.includes("El comprobante no se ve bien."),
);

const approved = buildReservationWhatsAppMessage(
  baseInput({ effectiveStatus: "approved" }),
);
check("approved: keeps CONFIRMADA", approved.includes("CONFIRMADA"));
check(
  "approved: mentions the event date",
  approved.includes(formatEventDate(eventStartsAt)),
);
check(
  "approved: mentions the event time",
  approved.includes(`a las ${formatEventTime(eventStartsAt)}`),
);

// Messages must never carry emojis.
for (const status of statuses) {
  const msg = buildReservationWhatsAppMessage(baseInput({ effectiveStatus: status }));
  check(`${status}: no emojis`, !/[\p{Extended_Pictographic}]/u.test(msg));
}

// ---------------------------------------------------------------------------

console.log("");
if (failures === 0) {
  console.log("RESULT: PASS");
  process.exit(0);
} else {
  console.log(`RESULT: FAIL (${failures} assertion(s) failed)`);
  process.exit(1);
}