import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Reservation lifecycle.
 *
 *   pending_no_receipt --> pending_review --> approved | rejected
 *                      \-> expired
 *   any non-terminal   --> cancelled
 *
 * The two pending states are NOT the same thing:
 *   - `pending_no_receipt` holds a seat and expires on a timer. The person has
 *     not paid yet, so the system can release the seat on its own.
 *   - `pending_review` holds a seat and NEVER expires on a timer. The money was
 *     already transferred, so only the admin can release it.
 */
export const reservationStatus = pgEnum("reservation_status", [
  "pending_no_receipt",
  "pending_review",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

/** Statuses that occupy a seat in an event. */
export const OCCUPYING_STATUSES = [
  "pending_no_receipt",
  "pending_review",
  "approved",
] as const;

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  theme: text("theme"),
  description: text("description"),
  imageUrl: text("image_url"),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  /** Stored as a string on purpose: `numeric` must never go through a float. */
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    /** Always stored lowercased; it is the identity used to deduplicate. */
    email: varchar("email", { length: 320 }).notNull(),
    whatsapp: varchar("whatsapp", { length: 32 }).notNull(),
    /** Marketing consent is separate from terms acceptance, by law. */
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("customers_email_unique").on(table.email)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: reservationStatus("status").notNull().default("pending_no_receipt"),
    /** Secret token for the public status page. Never expose it in listings. */
    publicToken: text("public_token").notNull(),
    /** Only meaningful while status is `pending_no_receipt`. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Declared transfer data. The admin cross-checks these against her banking
    // app. This is an efficiency aid, not a verification mechanism: a receipt
    // screenshot can always be forged.
    transferHolder: text("transfer_holder"),
    transferAmount: numeric("transfer_amount", { precision: 10, scale: 2 }),
    transferDate: date("transfer_date"),
    transferReference: text("transfer_reference"),

    // Receipt file. Lives in private storage, never in the database.
    receiptPath: text("receipt_path"),
    receiptMimeType: text("receipt_mime_type"),
    receiptUploadedAt: timestamp("receipt_uploaded_at", { withTimezone: true }),

    // Health data: sensitive under Ley 25.326. Never used for marketing and
    // never shared with third parties.
    hasCondition: boolean("has_condition").notNull(),
    conditionDetails: text("condition_details"),

    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    rejectionReason: text("rejection_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reservations_public_token_unique").on(table.publicToken),
    // One person cannot hold two seats for the same event. The condition keys on
    // the STORED status, so it bites only for the three statuses that hold a
    // seat: a rejected or cancelled row never blocks. A `pending_no_receipt`
    // whose timer ran out is materialized to `expired` by `createReservation`
    // before it inserts, so it stops blocking too — the timer itself lives in
    // the seat predicate, not in this index.
    uniqueIndex("reservations_active_per_person_unique")
      .on(table.eventId, table.customerId)
      .where(sql`${table.status} in ('pending_no_receipt', 'pending_review', 'approved')`),
    index("reservations_event_status_idx").on(table.eventId, table.status),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
