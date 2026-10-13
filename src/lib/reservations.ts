import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, events, reservations } from "@/db/schema";
import type { AdminReservationFilters } from "@/lib/reservation-admin-schema";

/**
 * Creating a reservation, with the seat held atomically.
 *
 * Seat counting and the insert happen inside one transaction that first takes a
 * row lock on the event (`SELECT ... FOR UPDATE`). Without that lock, two
 * concurrent requests read the same free seat and both insert, selling the last
 * seat twice. With it, the second request waits and then sees the seat taken.
 */

/** How long a `pending_no_receipt` reservation holds its seat. */
export const RESERVATION_HOLD_MINUTES = 30;

/** Input already validated by the reservation schema. */
export type CreateReservationInput = {
  fullName: string;
  email: string;
  whatsapp: string;
  hasHealthCondition: boolean;
  healthCondition: string | null;
  marketingConsent: boolean;
};

export type CreateReservationResult =
  | { ok: true; publicToken: string }
  | { ok: false; reason: "not_found" | "sold_out" | "already_reserved" };

const UNIQUE_VIOLATION = "23505";

/**
 * SQLSTATE of a Postgres error, unwrapping Drizzle's wrapper when present.
 *
 * Drizzle runs every statement through `queryWithCache`, which rethrows driver
 * errors as a `DrizzleQueryError` whose `cause` is the original `PostgresError`.
 * The SQLSTATE therefore lives on the cause, not on the thrown object.
 */
function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    return code;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") {
      return causeCode;
    }
  }

  return undefined;
}

export async function createReservation(
  eventId: string,
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Serialize every attempt on this event. The second request blocks here
      //    until the first commits, so it cannot read the same free seat.
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .for("update")
        .limit(1);

      // 2. The event must exist, be published and not have started.
      if (
        !event ||
        !event.isPublished ||
        event.startsAt.getTime() <= Date.now()
      ) {
        return { ok: false, reason: "not_found" };
      }

      // 3. Count occupied seats with the expiry evaluated in SQL (`now()`), not
      //    in JavaScript. A `pending_no_receipt` holds a seat only while it has
      //    not expired; the other occupying statuses never expire on a timer.
      //    Do not reuse the static OCCUPYING_STATUSES list: it cannot express
      //    the timer, so an abandoned reservation would shrink capacity forever.
      const [occupied] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(reservations)
        .where(
          and(
            eq(reservations.eventId, eventId),
            sql`(
              ${reservations.status} in ('pending_review', 'approved')
              or (
                ${reservations.status} = 'pending_no_receipt'
                and ${reservations.expiresAt} > now()
              )
            )`,
          ),
        );

      // 4. No seat left.
      if ((occupied?.count ?? 0) >= event.capacity) {
        return { ok: false, reason: "sold_out" };
      }

      // 5. Upsert the customer by email. Email is unique, and that is exactly
      //    what makes the "one active reservation per person and event" rule
      //    enforceable by the partial unique index.
      const [customer] = await tx
        .insert(customers)
        .values({
          fullName: input.fullName,
          email: input.email,
          whatsapp: input.whatsapp,
          marketingConsent: input.marketingConsent,
          marketingConsentAt: input.marketingConsent ? sql`now()` : null,
        })
        .onConflictDoUpdate({
          target: customers.email,
          set: {
            fullName: input.fullName,
            whatsapp: input.whatsapp,
            marketingConsent: input.marketingConsent,
            marketingConsentAt: input.marketingConsent ? sql`now()` : null,
          },
        })
        .returning({ id: customers.id });

      // 6. Materialize an expired hold of this same person for this event, before
      //    the insert below. The partial unique index matches on the STORED
      //    status, so a hold whose timer ran out would still count as active and
      //    block this person forever — even though its seat is already free (the
      //    seat predicate ignores it). Writing `expired` makes the index bite
      //    only where it should. The condition is the exact complement of the
      //    seat-holding predicate, evaluated by the DB clock. It needs no extra
      //    lock: step 1 already holds the event row FOR UPDATE, which serializes
      //    every attempt on this event, so this is race-free and idempotent. It
      //    changes no seat count, because this row already stopped counting.
      await tx
        .update(reservations)
        .set({ status: "expired", updatedAt: sql`now()` })
        .where(
          and(
            eq(reservations.eventId, eventId),
            eq(reservations.customerId, customer.id),
            eq(reservations.status, "pending_no_receipt"),
            sql`(${reservations.expiresAt} is null or ${reservations.expiresAt} <= now())`,
          ),
        );

      // 7. Insert the reservation, holding a seat for 30 minutes. The expiry and
      //    the acceptance timestamp use the database clock so they agree with
      //    the `now()` that counts seats.
      const publicToken = randomBytes(32).toString("base64url");

      await tx.insert(reservations).values({
        eventId,
        customerId: customer.id,
        status: "pending_no_receipt",
        publicToken,
        expiresAt: sql`now() + ${RESERVATION_HOLD_MINUTES} * interval '1 minute'`,
        hasCondition: input.hasHealthCondition,
        conditionDetails: input.healthCondition,
        termsAcceptedAt: sql`now()`,
      });

      // 8. Success.
      return { ok: true, publicToken };
    });
  } catch (error) {
    // A failed statement aborts the transaction, so this can only be caught
    // outside it. The partial unique index on (event_id, customer_id) rejects a
    // second active reservation for the same person: that is a duplicate, not a
    // server error, and it must never surface as a 500.
    if (sqlState(error) === UNIQUE_VIOLATION) {
      return { ok: false, reason: "already_reserved" };
    }
    throw error;
  }
}

/** Literal union of the lifecycle states, taken from the table itself. */
export type ReservationStatus = (typeof reservations.$inferSelect)["status"];

/**
 * The status a reservation shows *now*, with the hold timer evaluated by the
 * database clock.
 *
 * `pending_no_receipt` holds its seat only while `expires_at` is in the future,
 * so once that moment passes the row reads as `expired` even though the stored
 * status never changes. This is the exact mirror of `seatHoldingPredicate` in
 * `events.ts` and the single encoding of the rule: every surface that shows or
 * filters a status projects this expression instead of copying the comparison
 * into JavaScript. Nothing is written back (R3), which is what lets an abandoned
 * hold release its seat with no cron job.
 */
export const effectiveStatusSql = sql<ReservationStatus>`case
  when ${reservations.status} = 'pending_no_receipt'
    and (${reservations.expiresAt} is null or ${reservations.expiresAt} <= now())
  then 'expired'
  else ${reservations.status}
end`;

/**
 * Everything the public, token-only page renders — and nothing else.
 *
 * The declared health condition is deliberately absent: it is sensitive data
 * under Ley 25.326 and this lookup needs no login, only the secret token.
 */
export type ReservationByToken = {
  publicToken: string;
  status: ReservationStatus;
  effectiveStatus: ReservationStatus;
  expiresAt: Date | null;
  createdAt: Date;
  eventId: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventPrice: string;
  transferHolder: string | null;
  transferAmount: string | null;
  transferDate: string | null;
  transferReference: string | null;
  rejectionReason: string | null;
  hasReceipt: boolean;
};

/** Public reservation lookup by its secret token; `null` when it does not exist. */
export async function getReservationByToken(
  token: string,
): Promise<ReservationByToken | null> {
  const [row] = await db
    .select({
      publicToken: reservations.publicToken,
      status: reservations.status,
      effectiveStatus: effectiveStatusSql,
      expiresAt: reservations.expiresAt,
      createdAt: reservations.createdAt,
      eventId: reservations.eventId,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      eventPrice: events.price,
      transferHolder: reservations.transferHolder,
      transferAmount: reservations.transferAmount,
      transferDate: reservations.transferDate,
      transferReference: reservations.transferReference,
      rejectionReason: reservations.rejectionReason,
      receiptPath: reservations.receiptPath,
    })
    .from(reservations)
    .innerJoin(events, eq(events.id, reservations.eventId))
    .where(eq(reservations.publicToken, token))
    .limit(1);

  if (!row) {
    return null;
  }

  const { receiptPath, ...rest } = row;
  return { ...rest, hasReceipt: receiptPath !== null };
}

/*
 * ---------------------------------------------------------------------------
 * Admin data access.
 *
 * The panel reads and resolves reservations here. The seat-holding rule is never
 * re-implemented: `approved` and `pending_review` both hold a seat, so approving
 * changes no count and rejecting frees the seat by the schema predicate alone,
 * with no counter to decrement.
 * ---------------------------------------------------------------------------
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One row of the reservations list.
 *
 * The declared health condition is deliberately NOT selected here: the list is a
 * work queue, and the sensitive field belongs behind the detail page, which is
 * where the owner actually reads it.
 */
export type AdminReservationListItem = {
  id: string;
  status: ReservationStatus;
  effectiveStatus: ReservationStatus;
  createdAt: Date;
  eventId: string;
  eventTitle: string;
  eventStartsAt: Date;
  customerFullName: string;
  customerEmail: string;
  customerWhatsapp: string;
  hasReceipt: boolean;
};

/** Reservations for the panel, newest first, filtered by event and/or status. */
export async function listReservationsForAdmin(
  filters: AdminReservationFilters,
): Promise<AdminReservationListItem[]> {
  const rows = await db
    .select({
      id: reservations.id,
      status: reservations.status,
      effectiveStatus: effectiveStatusSql,
      createdAt: reservations.createdAt,
      eventId: reservations.eventId,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      customerFullName: customers.fullName,
      customerEmail: customers.email,
      customerWhatsapp: customers.whatsapp,
      receiptPath: reservations.receiptPath,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(events, eq(events.id, reservations.eventId))
    .where(
      and(
        filters.eventId ? eq(reservations.eventId, filters.eventId) : undefined,
        // Filter on the timer-aware status, so an abandoned hold shows up under
        // "Expirada" and disappears from "Pendiente de comprobante".
        filters.status ? eq(effectiveStatusSql, filters.status) : undefined,
      ),
    )
    .orderBy(desc(reservations.createdAt));

  return rows.map(({ receiptPath, ...row }) => ({
    ...row,
    hasReceipt: receiptPath !== null,
  }));
}

/** Everything the detail page shows for one reservation, in one join. */
export type AdminReservationDetail = {
  id: string;
  status: ReservationStatus;
  effectiveStatus: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
  transferHolder: string | null;
  transferAmount: string | null;
  transferDate: string | null;
  transferReference: string | null;
  receiptPath: string | null;
  receiptMimeType: string | null;
  receiptUploadedAt: Date | null;
  hasCondition: boolean;
  conditionDetails: string | null;
  termsAcceptedAt: Date;
  customer: {
    fullName: string;
    email: string;
    whatsapp: string;
    marketingConsent: boolean;
    marketingConsentAt: Date | null;
    createdAt: Date;
  };
  event: {
    id: string;
    title: string;
    theme: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    price: string;
  };
};

/** One reservation with its customer and event, or `null` when it does not exist. */
export async function getReservationForAdminById(
  id: string,
): Promise<AdminReservationDetail | null> {
  // A malformed uuid would make Postgres reject the comparison with a 500; the
  // page must 404 instead.
  if (!UUID_PATTERN.test(id)) {
    return null;
  }

  const [row] = await db
    .select({
      id: reservations.id,
      status: reservations.status,
      effectiveStatus: effectiveStatusSql,
      createdAt: reservations.createdAt,
      updatedAt: reservations.updatedAt,
      resolvedAt: reservations.resolvedAt,
      expiresAt: reservations.expiresAt,
      rejectionReason: reservations.rejectionReason,
      transferHolder: reservations.transferHolder,
      transferAmount: reservations.transferAmount,
      transferDate: reservations.transferDate,
      transferReference: reservations.transferReference,
      receiptPath: reservations.receiptPath,
      receiptMimeType: reservations.receiptMimeType,
      receiptUploadedAt: reservations.receiptUploadedAt,
      hasCondition: reservations.hasCondition,
      conditionDetails: reservations.conditionDetails,
      termsAcceptedAt: reservations.termsAcceptedAt,
      customerFullName: customers.fullName,
      customerEmail: customers.email,
      customerWhatsapp: customers.whatsapp,
      customerMarketingConsent: customers.marketingConsent,
      customerMarketingConsentAt: customers.marketingConsentAt,
      customerCreatedAt: customers.createdAt,
      eventId: events.id,
      eventTitle: events.title,
      eventTheme: events.theme,
      eventLocation: events.location,
      eventStartsAt: events.startsAt,
      eventEndsAt: events.endsAt,
      eventCapacity: events.capacity,
      eventPrice: events.price,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(events, eq(events.id, reservations.eventId))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    effectiveStatus: row.effectiveStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    expiresAt: row.expiresAt,
    rejectionReason: row.rejectionReason,
    transferHolder: row.transferHolder,
    transferAmount: row.transferAmount,
    transferDate: row.transferDate,
    transferReference: row.transferReference,
    receiptPath: row.receiptPath,
    receiptMimeType: row.receiptMimeType,
    receiptUploadedAt: row.receiptUploadedAt,
    hasCondition: row.hasCondition,
    conditionDetails: row.conditionDetails,
    termsAcceptedAt: row.termsAcceptedAt,
    customer: {
      fullName: row.customerFullName,
      email: row.customerEmail,
      whatsapp: row.customerWhatsapp,
      marketingConsent: row.customerMarketingConsent,
      marketingConsentAt: row.customerMarketingConsentAt,
      createdAt: row.customerCreatedAt,
    },
    event: {
      id: row.eventId,
      title: row.eventTitle,
      theme: row.eventTheme,
      location: row.eventLocation,
      startsAt: row.eventStartsAt,
      endsAt: row.eventEndsAt,
      capacity: row.eventCapacity,
      price: row.eventPrice,
    },
  };
}

/**
 * Approves a `pending_review` reservation.
 *
 * The status condition lives in the `WHERE`, not in a read-then-write, so a
 * double click or a second tab cannot apply the transition twice: the second
 * `UPDATE` matches no row and reports `false` instead of faking success.
 *
 * Approving does not move any seat count. `pending_review` already held the
 * seat and `approved` keeps holding it, so there is nothing to add or subtract.
 */
export async function approveReservation(id: string): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) {
    return false;
  }

  const updated = await db
    .update(reservations)
    .set({ status: "approved", resolvedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(eq(reservations.id, id), eq(reservations.status, "pending_review")),
    )
    .returning({ id: reservations.id });

  return updated.length > 0;
}

/**
 * Rejects a `pending_review` reservation, optionally recording a reason.
 *
 * The seat is released by the schema itself: the seat-holding predicate counts
 * `pending_review`/`approved` only, so flipping the row to `rejected` frees the
 * place with no counter to decrement. Same conditional `WHERE` as approve, so a
 * repeated submit cannot reject twice.
 */
export async function rejectReservation(
  id: string,
  rejectionReason: string | null,
): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) {
    return false;
  }

  const updated = await db
    .update(reservations)
    .set({
      status: "rejected",
      rejectionReason,
      resolvedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(reservations.id, id), eq(reservations.status, "pending_review")),
    )
    .returning({ id: reservations.id });

  return updated.length > 0;
}
