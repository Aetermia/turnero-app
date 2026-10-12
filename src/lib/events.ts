import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, reservations } from "@/db/schema";

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
