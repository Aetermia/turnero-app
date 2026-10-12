import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, events, reservations } from "@/db/schema";

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

      // 6. Insert the reservation, holding a seat for 30 minutes. The expiry and
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

      // 7. Success.
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

export type ReservationByToken = {
  publicToken: string;
  status: (typeof reservations.$inferSelect)["status"];
  expiresAt: Date | null;
  createdAt: Date;
  eventTitle: string;
  eventStartsAt: Date;
  eventPrice: string;
};

/** Public reservation lookup by its secret token; `null` when it does not exist. */
export async function getReservationByToken(
  token: string,
): Promise<ReservationByToken | null> {
  const [row] = await db
    .select({
      publicToken: reservations.publicToken,
      status: reservations.status,
      expiresAt: reservations.expiresAt,
      createdAt: reservations.createdAt,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      eventPrice: events.price,
    })
    .from(reservations)
    .innerJoin(events, eq(events.id, reservations.eventId))
    .where(eq(reservations.publicToken, token))
    .limit(1);

  return row ?? null;
}
