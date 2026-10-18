<?php

declare(strict_types=1);

/*
 * Public event data access. Every query answers with live data and nothing is
 * cached: a stale seat count would let the app oversell an event.
 */
final class Events
{
    /**
     * A seat is occupied while the money is in play:
     *   - pending_review / approved: the transfer already happened and only the
     *     owner can release it, so the seat is held with no timer;
     *   - pending_no_receipt: not paid yet, so the seat frees itself once the
     *     timer runs out.
     * The timer is evaluated by the DATABASE clock (NOW()), never by PHP: the
     * count is right without any cron job (R3). It goes in the LEFT JOIN's ON
     * clause so events without reservations still come back with zero.
     */
    public const SEAT_HOLDING = "(r.status IN ('pending_review', 'approved')
        OR (r.status = 'pending_no_receipt' AND r.expires_at > NOW()))";

    private const SELECT = 'SELECT e.id, e.title, e.theme, e.description, e.image_url, e.location,
               e.starts_at, e.ends_at, e.capacity, e.price, COUNT(r.id) AS occupied
        FROM events e
        LEFT JOIN reservations r ON r.event_id = e.id AND ' . self::SEAT_HOLDING;

    /**
     * Published events starting in the future, soonest first, with free seats.
     *
     * @return list<array<string, mixed>>
     */
    public static function upcomingPublished(): array
    {
        $rows = Db::all(self::SELECT . '
            WHERE e.is_published = 1 AND e.starts_at > NOW()
            GROUP BY e.id
            ORDER BY e.starts_at ASC');
        return array_map(self::withSeats(...), $rows);
    }

    /**
     * One published event with its free seats, or null when it is not public.
     * A malformed id is simply "not found", never an error.
     *
     * @return array<string, mixed>|null
     */
    public static function publishedById(string $id): ?array
    {
        if (!is_uuid($id)) {
            return null;
        }
        $row = Db::one(self::SELECT . '
            WHERE e.id = ? AND e.is_published = 1
            GROUP BY e.id', [$id]);
        return $row === null ? null : self::withSeats($row);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function withSeats(array $row): array
    {
        $row['capacity'] = (int) $row['capacity'];
        $row['occupied'] = (int) $row['occupied'];
        $row['seats_available'] = max(0, $row['capacity'] - $row['occupied']);
        return $row;
    }
}
