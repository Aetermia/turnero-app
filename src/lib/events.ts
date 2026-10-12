import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, reservations } from "@/db/schema";
import type { EventFormValues } from "@/lib/event-schema";

/**
 * Public event data access.
 *
 * Every function here answers with live data, so the catalog never sells a seat
 * that was already taken. That is why nothing in this module is cached: with
 * `cacheComponents` enabled, caching is opt-in via `use cache` and a stale seat
 * count would let the app oversell.
 */

export type EventWithSeats = {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  price: string;
  seatsAvailable: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A seat is occupied while the money is in play:
 *   - `pending_review` / `approved`: the transfer already happened and only the
 *     owner can release it, so the seat is held with no timer.
 *   - `pending_no_receipt`: the person has not paid yet, so the seat is released
 *     automatically once the timer runs out.
 *
 * The timer is evaluated in SQL (`now()`), not in JavaScript, so the count is
 * always correct without a cron job. This is why the static
 * `OCCUPYING_STATUSES` list from the schema must not be reused: it cannot
 * express the timer, and a `pending_no_receipt` reservation that expired would
 * keep shrinking the available capacity forever.
 */
const seatHoldingPredicate = sql`(
  ${reservations.status} in ('pending_review', 'approved')
  or (
    ${reservations.status} = 'pending_no_receipt'
    and ${reservations.expiresAt} > now()
  )
)`;

/**
 * Aggregates the occupied seats per event in the same query that reads the
 * event, so there is no N+1. The predicate lives in the `leftJoin` ON clause on
 * purpose: events without any reservation still come back as one row with a
 * `NULL` reservation, and `count(reservations.id)` ignores those nulls.
 */
const eventSelection = {
  id: events.id,
  title: events.title,
  theme: events.theme,
  description: events.description,
  imageUrl: events.imageUrl,
  location: events.location,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  capacity: events.capacity,
  price: events.price,
  // Postgres `count()` returns bigint; the cast keeps it a plain number.
  occupied: sql<number>`count(${reservations.id})::int`,
};

type EventRow = {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  price: string;
  occupied: number;
};

function toEventWithSeats(row: EventRow): EventWithSeats {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    description: row.description,
    imageUrl: row.imageUrl,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    price: row.price,
    seatsAvailable: Math.max(0, row.capacity - row.occupied),
  };
}

/** Published events starting in the future, soonest first, with free seats. */
export async function getUpcomingPublishedEvents(): Promise<EventWithSeats[]> {
  const rows = await db
    .select(eventSelection)
    .from(events)
    .leftJoin(
      reservations,
      and(eq(reservations.eventId, events.id), seatHoldingPredicate),
    )
    .where(and(eq(events.isPublished, true), gt(events.startsAt, sql`now()`)))
    .groupBy(events.id)
    .orderBy(asc(events.startsAt));

  return rows.map(toEventWithSeats);
}

/** One published event with its free seats, or `null` if it is not public. */
export async function getPublishedEventById(
  id: string,
): Promise<EventWithSeats | null> {
  // Malformed ids would make Postgres reject the uuid comparison with a 500;
  // a non-existent event must 404 instead.
  if (!UUID_PATTERN.test(id)) {
    return null;
  }

  const rows = await db
    .select(eventSelection)
    .from(events)
    .leftJoin(
      reservations,
      and(eq(reservations.eventId, events.id), seatHoldingPredicate),
    )
    .where(and(eq(events.id, id), eq(events.isPublished, true)))
    .groupBy(events.id)
    .limit(1);

  const row = rows[0];
  return row ? toEventWithSeats(row) : null;
}

/*
 * ---------------------------------------------------------------------------
 * Admin data access.
 *
 * Same seat-holding predicate as the public reads, so the panel and the catalog
 * can never disagree about how many seats are taken. Every write here is fed
 * only validated values (`EventFormValues`); the server action is the only
 * caller.
 * ---------------------------------------------------------------------------
 */

/** One event as the admin panel needs it, including the draft flag. */
export type AdminEvent = {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  price: string;
  isPublished: boolean;
  occupied: number;
  seatsAvailable: number;
};

const adminEventSelection = {
  id: events.id,
  title: events.title,
  theme: events.theme,
  description: events.description,
  location: events.location,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  capacity: events.capacity,
  price: events.price,
  isPublished: events.isPublished,
  occupied: sql<number>`count(${reservations.id})::int`,
};

type AdminEventRow = {
  id: string;
  title: string;
  theme: string | null;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  price: string;
  isPublished: boolean;
  occupied: number;
};

function toAdminEvent(row: AdminEventRow): AdminEvent {
  return {
    ...row,
    seatsAvailable: Math.max(0, row.capacity - row.occupied),
  };
}

/** Every event, drafts included, most recent first, with live seat counts. */
export async function listEventsForAdmin(): Promise<AdminEvent[]> {
  const rows = await db
    .select(adminEventSelection)
    .from(events)
    .leftJoin(
      reservations,
      and(eq(reservations.eventId, events.id), seatHoldingPredicate),
    )
    .groupBy(events.id)
    .orderBy(desc(events.startsAt));

  return rows.map(toAdminEvent);
}

/** One event by id for the edit form, or `null` when it does not exist. */
export async function getEventForAdminById(
  id: string,
): Promise<AdminEvent | null> {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }

  const rows = await db
    .select(adminEventSelection)
    .from(events)
    .leftJoin(
      reservations,
      and(eq(reservations.eventId, events.id), seatHoldingPredicate),
    )
    .where(eq(events.id, id))
    .groupBy(events.id)
    .limit(1);

  const row = rows[0];
  return row ? toAdminEvent(row) : null;
}

/**
 * Counts the seats an event currently holds, as a scalar subquery so the
 * capacity guard can be evaluated by the database itself.
 */
function occupiedSeatsSubquery(eventId: string) {
  return sql`(
    select count(*) from ${reservations}
    where ${reservations.eventId} = ${eventId}
      and ${seatHoldingPredicate}
  )`;
}

export type SaveEventResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "capacity_below_occupied" };

/** Inserts a new event; a fresh event has no reservations, so no seat guard. */
export async function createEvent(input: EventFormValues): Promise<string> {
  const [created] = await db
    .insert(events)
    .values({
      title: input.title,
      theme: input.theme,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      price: input.price,
      isPublished: input.isPublished,
    })
    .returning({ id: events.id });

  return created.id;
}

/**
 * Updates an event, refusing to lower `capacity` below the seats already held.
 *
 * The guard is a single UPDATE whose `WHERE` compares the new capacity against
 * an SQL count of occupied seats (same predicate as the seat counts above, with
 * the `pending_no_receipt` timer at `now()`); no reservation rows are loaded
 * into the application to make the decision. The row lock taken first serializes
 * this edit with `createReservation`, which locks the same event row, so a
 * concurrent booking cannot slip past the count.
 */
export async function updateEvent(
  id: string,
  input: EventFormValues,
): Promise<SaveEventResult> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, reason: "not_found" };
  }

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, id))
      .for("update")
      .limit(1);

    if (!existing) {
      return { ok: false, reason: "not_found" as const };
    }

    const updated = await tx
      .update(events)
      .set({
        title: input.title,
        theme: input.theme,
        description: input.description,
        location: input.location,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity,
        price: input.price,
        isPublished: input.isPublished,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(events.id, id),
          sql`${input.capacity} >= ${occupiedSeatsSubquery(id)}`,
        ),
      )
      .returning({ id: events.id });

    if (updated.length === 0) {
      return { ok: false, reason: "capacity_below_occupied" as const };
    }

    return { ok: true, id };
  });
}

/**
 * Publishes or unpublishes an event. Only `is_published` changes: unpublishing
 * removes the event from the catalog and leaves its reservations untouched.
 * Returns `false` when the id matches no event.
 */
export async function setEventPublished(
  id: string,
  isPublished: boolean,
): Promise<boolean> {
  if (!UUID_PATTERN.test(id)) {
    return false;
  }

  const updated = await db
    .update(events)
    .set({ isPublished, updatedAt: sql`now()` })
    .where(eq(events.id, id))
    .returning({ id: events.id });

  return updated.length > 0;
}
